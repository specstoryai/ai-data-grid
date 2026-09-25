import type { GridCell } from "../../internal/data-grid/data-grid-types.js";
import type { JevState, ParsedJevAnswer } from "../contract/types.js";
import type { AIFillMode, AIFillScope } from "../config/types.js";
import type {
    AICellStatus,
    AIColumnId,
    AIFillError,
    AIMappedOutput,
    AIPolicyDecision,
    AIRowId,
} from "../config/results.js";
import { destinationUnchanged, identityMatches, type ResultIdentity } from "../policy/commit-guards.js";
import type { AIPolicyEvaluation } from "../policy/evaluate-policy.js";

/** A cell, by stable ids. */
export interface AICellRef {
    readonly rowId: AIRowId;
    readonly columnId: AIColumnId;
}

/** When a record moved through the pipeline, in epoch milliseconds. */
export interface AICellTimings {
    readonly queuedAt?: number;
    readonly sentAt?: number;
    readonly receivedAt?: number;
}

/** Everything AI Fill knows about one cell, keyed by `(rowId, columnId)`. */
export interface AICellRecord extends AICellRef {
    readonly status: Exclude<AICellStatus, "cancelled">;
    /** The run that produced the record. */
    readonly runId: string;
    /** Increases with every request made for any cell; only the latest request for a cell may settle it. */
    readonly requestSeq: number;
    /** The scope of the fill, used by the overwrite guard at commit time. */
    readonly scope: AIFillScope;
    readonly mode: AIFillMode;
    /** The question, input and model the request was made for. */
    readonly identity: ResultIdentity;
    /** The destination cell's `data` when the request was made. */
    readonly destinationSnapshot: unknown;
    /** The state that was sent. */
    readonly state?: JevState;
    readonly answer?: ParsedJevAnswer;
    readonly output?: AIMappedOutput;
    readonly decision?: AIPolicyDecision;
    readonly error?: AIFillError;
    /** Set once the result is written; a record with a commit id is never written again. */
    readonly commitId?: string;
    /** The destination was edited by hand after the request. It never auto-applies. */
    readonly manual?: boolean;
    /** A source changed while the request was in flight; the response is stored as stale. */
    readonly stalePending?: boolean;
    readonly requestId?: string;
    readonly timings: AICellTimings;
    /** The record this in-flight one replaced, restored if its run is cancelled. */
    readonly previous?: AICellRecord;
}

/** The current identity and destination of a cell, recomputed when a response arrives. */
export interface AICurrentCell {
    readonly identity: ResultIdentity;
    readonly destination: GridCell;
}

/** Why a response or failure didn't settle a record. */
export type AIIgnoredReason = "no-record" | "superseded" | "not-in-flight";

/** The result of settling a record. */
export type AIStoreOutcome =
    | {
          readonly applied: true;
          /** The new record, or `undefined` when the record was dropped because its row is gone. */
          readonly record: AICellRecord | undefined;
      }
    | { readonly applied: false; readonly reason: AIIgnoredReason };

/** Input to {@link AIFillStore.enqueue}. */
export interface AIEnqueueInput extends AICellRef {
    readonly runId: string;
    readonly scope: AIFillScope;
    readonly mode: AIFillMode;
    readonly identity: ResultIdentity;
    readonly destinationSnapshot: unknown;
    readonly state?: JevState;
    readonly queuedAt: number;
}

/** Which request a response belongs to. */
export interface AIRequestTag extends AICellRef {
    readonly runId: string;
    readonly requestSeq: number;
}

/** Input to {@link AIFillStore.resolve}. */
export interface AIResolveInput extends AIRequestTag {
    readonly answer: ParsedJevAnswer;
    readonly requestId?: string;
    readonly receivedAt: number;
    /** The cell now, or `undefined` when its row no longer exists. */
    readonly current: AICurrentCell | undefined;
    /** Runs the policy against the current destination. Called only when the result is still current. */
    readonly evaluate: (destination: GridCell) => AIPolicyEvaluation;
}

/** Input to {@link AIFillStore.fail}. */
export interface AIFailInput extends AIRequestTag {
    readonly error: AIFillError;
    readonly receivedAt: number;
    readonly requestId?: string;
}

/** Called with the cells whose records changed. */
export type AIStoreListener = (changes: readonly AICellRef[]) => void;

const inFlightStatuses: ReadonlySet<AICellStatus> = new Set(["queued", "pending"]);
/** Statuses that hold a decided, uncommitted answer. */
const decidedStatuses: ReadonlySet<AICellStatus> = new Set(["suggested", "review", "withheld"]);

/** Whether a record is waiting for a response. */
export function isInFlight(record: AICellRecord): boolean {
    return inFlightStatuses.has(record.status);
}

/** Whether a record holds a decided answer that hasn't been committed or rejected. */
export function isDecided(record: AICellRecord): boolean {
    return decidedStatuses.has(record.status);
}

/** The map key of a cell. */
export function cellKey(rowId: AIRowId, columnId: AIColumnId): string {
    return JSON.stringify([rowId, columnId]);
}

function withoutPrevious(record: AICellRecord): AICellRecord {
    if (record.previous === undefined) return record;
    const { previous: _previous, ...rest } = record;
    return rest;
}

/** The record's status, decision, output and error for a policy evaluation. Apply candidates are stored as `suggested`. */
function evaluated(evaluation: AIPolicyEvaluation): Pick<AICellRecord, "status" | "decision" | "output" | "error"> {
    if (evaluation.status === "error") {
        return { status: "error", error: evaluation.error, output: evaluation.output, decision: undefined };
    }
    return {
        status: evaluation.status === "apply-candidate" ? "suggested" : evaluation.status,
        decision: evaluation.decision,
        output: evaluation.output,
        error: undefined,
    };
}

function clean<T extends object>(record: T): T {
    for (const key of Object.keys(record) as (keyof T)[]) {
        if (record[key] === undefined) delete record[key];
    }
    return record;
}

/**
 * AI Fill's result store: a state machine of {@link AICellRecord}s keyed by
 * `(rowId, columnId)`, with no I/O and no timers.
 *
 * Every request gets a new `requestSeq`. A response or failure settles a
 * record only when the record's `runId` and `requestSeq` are the ones the
 * request was tagged with and the record is still in flight, so cancelled,
 * retried and out-of-order responses can never attach to another cell or to
 * a newer request. When a response arrives, the identity and destination are
 * compared with the current ones, and a mismatch stores the answer as `stale`.
 */
export class AIFillStore {
    private readonly records = new Map<string, AICellRecord>();
    private readonly listeners = new Set<AIStoreListener>();
    private seq = 0;

    get size(): number {
        return this.records.size;
    }

    get(rowId: AIRowId, columnId: AIColumnId): AICellRecord | undefined {
        return this.records.get(cellKey(rowId, columnId));
    }

    /** Every record, in insertion order. */
    all(): AICellRecord[] {
        return [...this.records.values()];
    }

    subscribe(listener: AIStoreListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Starts a request for a cell: the record becomes `queued` with a new
     * `requestSeq`, keeping the last settled record to restore on cancel.
     */
    enqueue(input: AIEnqueueInput): AICellRecord {
        const key = cellKey(input.rowId, input.columnId);
        const existing = this.records.get(key);
        const previous = existing === undefined ? undefined : isInFlight(existing) ? existing.previous : existing;
        this.seq++;
        const record: AICellRecord = clean({
            rowId: input.rowId,
            columnId: input.columnId,
            status: "queued",
            runId: input.runId,
            requestSeq: this.seq,
            scope: input.scope,
            mode: input.mode,
            identity: input.identity,
            destinationSnapshot: input.destinationSnapshot,
            state: input.state,
            timings: { queuedAt: input.queuedAt },
            previous: previous === undefined ? undefined : withoutPrevious(previous),
        });
        this.set(key, record);
        return record;
    }

    /** Marks a queued record as sent. Ignored unless the tag matches. */
    markPending(tag: AIRequestTag, sentAt: number): boolean {
        const record = this.matching(tag);
        if (record === undefined || record.status !== "queued") return false;
        this.set(cellKey(tag.rowId, tag.columnId), {
            ...record,
            status: "pending",
            timings: { ...record.timings, sentAt },
        });
        return true;
    }

    /**
     * Settles an in-flight record with an answer. The row missing drops the
     * record. A source change while pending, a different identity or a changed
     * destination stores the answer as `stale` (a changed destination also marks
     * it `manual`). Otherwise the policy decides the status.
     */
    resolve(input: AIResolveInput): AIStoreOutcome {
        const ignored = this.check(input);
        if (ignored !== undefined) return { applied: false, reason: ignored };
        const key = cellKey(input.rowId, input.columnId);
        const record = this.records.get(key) as AICellRecord;
        if (input.current === undefined) {
            this.delete(key);
            return { applied: true, record: undefined };
        }
        const base: AICellRecord = {
            ...withoutPrevious(record),
            answer: input.answer,
            requestId: input.requestId,
            timings: { ...record.timings, receivedAt: input.receivedAt },
            stalePending: undefined,
        };
        const destinationChanged = !destinationUnchanged(record.destinationSnapshot, input.current.destination);
        const stale =
            record.stalePending === true ||
            destinationChanged ||
            !identityMatches(record.identity, input.current.identity);
        const next: AICellRecord = stale
            ? { ...base, status: "stale", manual: destinationChanged || record.manual === true ? true : undefined }
            : { ...base, ...evaluated(input.evaluate(input.current.destination)) };
        this.set(key, clean(next));
        return { applied: true, record: this.records.get(key) };
    }

    /** Settles an in-flight record with an error. The last answer, if any, is dropped with the request. */
    fail(input: AIFailInput): AIStoreOutcome {
        const ignored = this.check(input);
        if (ignored !== undefined) return { applied: false, reason: ignored };
        const key = cellKey(input.rowId, input.columnId);
        const record = this.records.get(key) as AICellRecord;
        this.set(
            key,
            clean({
                ...withoutPrevious(record),
                status: "error",
                error: input.error,
                answer: undefined,
                output: undefined,
                decision: undefined,
                stalePending: undefined,
                requestId: input.requestId,
                timings: { ...record.timings, receivedAt: input.receivedAt },
            })
        );
        return { applied: true, record: this.records.get(key) };
    }

    /**
     * Cancels a run: its queued and pending records go back to the record they
     * replaced, or are removed when there was none. Returns the cells restored.
     */
    cancelRun(runId: string): AICellRef[] {
        const changed: AICellRef[] = [];
        for (const [key, record] of this.records) {
            if (record.runId !== runId || !isInFlight(record)) continue;
            if (record.previous === undefined) this.records.delete(key);
            else this.records.set(key, record.previous);
            changed.push({ rowId: record.rowId, columnId: record.columnId });
        }
        this.emit(changed);
        return changed;
    }

    /**
     * A source of the cell changed. An in-flight record becomes stale-pending
     * (its response will be stored as stale), and a decided or failed one becomes `stale`.
     */
    markSourceChanged(ref: AICellRef): boolean {
        const record = this.get(ref.rowId, ref.columnId);
        if (record === undefined) return false;
        if (isInFlight(record)) {
            this.set(cellKey(ref.rowId, ref.columnId), { ...record, stalePending: true });
            return true;
        }
        if (isDecided(record) || record.status === "error") {
            this.set(cellKey(ref.rowId, ref.columnId), { ...record, status: "stale" });
            return true;
        }
        return false;
    }

    /**
     * The destination was edited by hand. The record is marked `manual`, and an
     * in-flight or decided record also becomes stale.
     */
    markDestinationEdited(ref: AICellRef): boolean {
        const record = this.get(ref.rowId, ref.columnId);
        if (record === undefined) return false;
        const key = cellKey(ref.rowId, ref.columnId);
        if (isInFlight(record)) this.set(key, { ...record, manual: true, stalePending: true });
        else if (isDecided(record) || record.status === "error")
            this.set(key, { ...record, manual: true, status: "stale" });
        else this.set(key, { ...record, manual: true });
        return true;
    }

    /** Marks a decided or failed record `stale` (its question, input or model changed). */
    markStale(ref: AICellRef): boolean {
        return this.markSourceChanged(ref);
    }

    /**
     * Re-runs the policy on a stored answer without a request (SPST-17 §4.5).
     * Only records with an answer that are decided, or failed in mapping or in
     * `decide`, are re-evaluated. Returns whether the record changed.
     */
    reevaluate(ref: AICellRef, evaluate: (answer: ParsedJevAnswer) => AIPolicyEvaluation): boolean {
        const record = this.get(ref.rowId, ref.columnId);
        if (record?.answer === undefined) return false;
        const policyError =
            record.status === "error" &&
            (record.error?.kind === "type-mismatch" || record.error?.kind === "policy-callback");
        if (!isDecided(record) && !policyError) return false;
        this.set(cellKey(ref.rowId, ref.columnId), clean({ ...record, ...evaluated(evaluate(record.answer)) }));
        return true;
    }

    /** Marks decided or stale records `rejected`. Returns the records as they were before. */
    reject(refs: readonly AICellRef[]): AICellRecord[] {
        const rejected: AICellRecord[] = [];
        for (const ref of refs) {
            const record = this.get(ref.rowId, ref.columnId);
            if (record === undefined || !(isDecided(record) || record.status === "stale")) continue;
            this.records.set(cellKey(ref.rowId, ref.columnId), { ...record, status: "rejected" });
            rejected.push(record);
        }
        this.emit(rejected);
        return rejected;
    }

    /**
     * Records a write. A record that already has a commit id is never committed
     * again, so a repeated accept can't write twice. A new request for the cell
     * starts a new record without a commit id.
     */
    commit(
        refs: readonly AICellRef[],
        commitId: string,
        status: "accepted" | "applied"
    ): { committed: AICellRecord[]; alreadyCommitted: AICellRef[] } {
        const committed: AICellRecord[] = [];
        const alreadyCommitted: AICellRef[] = [];
        for (const ref of refs) {
            const record = this.get(ref.rowId, ref.columnId);
            if (record === undefined) continue;
            if (record.commitId !== undefined) {
                alreadyCommitted.push({ rowId: ref.rowId, columnId: ref.columnId });
                continue;
            }
            const next: AICellRecord = { ...record, status, commitId };
            this.records.set(cellKey(ref.rowId, ref.columnId), next);
            committed.push(next);
        }
        this.emit(committed);
        return { committed, alreadyCommitted };
    }

    /** Whether a record exists and hasn't been committed. */
    canCommit(ref: AICellRef): boolean {
        const record = this.get(ref.rowId, ref.columnId);
        return record !== undefined && record.commitId === undefined;
    }

    /** Removes records. Returns the ones removed. */
    remove(predicate: (record: AICellRecord) => boolean): AICellRecord[] {
        const removed: AICellRecord[] = [];
        for (const [key, record] of this.records) {
            if (!predicate(record)) continue;
            this.records.delete(key);
            removed.push(record);
        }
        this.emit(removed);
        return removed;
    }

    private matching(tag: AIRequestTag): AICellRecord | undefined {
        const record = this.get(tag.rowId, tag.columnId);
        return record?.runId === tag.runId && record.requestSeq === tag.requestSeq ? record : undefined;
    }

    private check(tag: AIRequestTag): AIIgnoredReason | undefined {
        const record = this.get(tag.rowId, tag.columnId);
        if (record === undefined) return "no-record";
        if (record.runId !== tag.runId || record.requestSeq !== tag.requestSeq) return "superseded";
        if (!isInFlight(record)) return "not-in-flight";
        return undefined;
    }

    private set(key: string, record: AICellRecord): void {
        this.records.set(key, record);
        this.emit([{ rowId: record.rowId, columnId: record.columnId }]);
    }

    private delete(key: string): void {
        const record = this.records.get(key);
        if (record === undefined) return;
        this.records.delete(key);
        this.emit([{ rowId: record.rowId, columnId: record.columnId }]);
    }

    private emit(changes: readonly AICellRef[]): void {
        if (changes.length === 0) return;
        const refs = changes.map(({ rowId, columnId }) => ({ rowId, columnId }));
        for (const listener of this.listeners) listener(refs);
    }
}
