import {
    type EditableGridCell,
    type GridCell,
    GridCellKind,
    type GridColumn,
    type Item,
} from "../../internal/data-grid/data-grid-types.js";
import type { JevQuestion, JevState, ParsedJevAnswer } from "../contract/types.js";
import { parseJevAnswer } from "../contract/parse-answer.js";
import type { AIColumnDefinition, AIFillConfig, AIFillConnection, AIFillMode, AIFillScope } from "../config/types.js";
import type {
    AICellStatus,
    AIColumnId,
    AIFillError,
    AIResultEvent,
    AIResultMetadata,
    AIRowId,
    AIRunSummary,
    AISkipReason,
} from "../config/results.js";
import { validateAIFillConfig, type AIFillConfigIssue } from "../config/validate.js";
import { canonicalJson } from "../identity/canonical-json.js";
import { buildQuestion, cacheKey, questionFingerprint, resolveModel, shortHash } from "../identity/fingerprints.js";
import { isAIDestinationEmpty } from "../policy/cells.js";
import {
    cellData,
    destinationUnchanged,
    identityMatches,
    isWritableCell,
    overwriteAllows,
    type ResultIdentity,
} from "../policy/commit-guards.js";
import { evaluateAIPolicy } from "../policy/evaluate-policy.js";
import { createJevTransport, type JevTransport } from "../transport/client.js";
import { isAbortError, isJevTransportError, type JevTransportErrorInit } from "../transport/errors.js";
import { maxRetryAfterMs } from "../transport/retry.js";
import { resolveExecution, type ResolvedExecution } from "./defaults.js";
import { LruCache } from "./lru-cache.js";
import { groupRequests, type PlannedRequest, type RequestCell } from "./requests.js";
import { RequestScheduler } from "./scheduler.js";
import { type AIFillCellRead, buildState, isInputMissing, rowContext } from "./state.js";
import {
    type AICellRecord,
    type AICellRef,
    type AICurrentCell,
    AIFillStore,
    type AIStoreListener,
    cellKey,
    isDecided,
    isInFlight,
} from "./store.js";

/** How the engine reads the grid. Rows are always addressed by stable id. */
export interface AIFillEngineHost {
    /**
     * Reads a cell now: its display row, destination cell and the given source
     * cells. Returns `undefined` when the row no longer exists.
     */
    readCell(rowId: AIRowId, columnId: AIColumnId, sources: readonly AIColumnId[]): AIFillCellRead | undefined;
}

/** Options for {@link AIFillEngine}. */
export interface AIFillEngineOptions {
    readonly config: AIFillConfig;
    readonly host: AIFillEngineHost;
    /** The grid's columns, for validation. */
    readonly columns?: readonly GridColumn[];
    /** Whether this is a browser. Default: detected. */
    readonly isBrowser?: boolean;
    /** The retry jitter source. Default `Math.random`. */
    readonly random?: () => number;
}

/** What to fill. */
export interface AIFillPlanTarget {
    /** Cells by `[rowId, columnId]`. Cells outside AI columns are ignored. */
    readonly cells: readonly (readonly [AIRowId, AIColumnId])[];
    readonly scope: AIFillScope;
    /** `"apply"` for "Fill and apply". Default `"suggest"`. */
    readonly mode?: AIFillMode;
}

/** A cell that will be evaluated. */
export interface AIPlannedCell extends RequestCell {
    readonly definition: AIColumnDefinition;
    readonly row: number;
    readonly destination: GridCell;
    readonly identity: ResultIdentity;
    readonly cacheKey: string;
    readonly scope: AIFillScope;
    readonly mode: AIFillMode;
}

/** A cell that fails before any request, for example because its `state` accessor threw. */
export interface AIPlanFailure extends AICellRef {
    readonly error: AIFillError;
    readonly identity: ResultIdentity;
    readonly destinationSnapshot: unknown;
    readonly scope: AIFillScope;
    readonly mode: AIFillMode;
}

/** What a fill will do, computed before anything is sent. */
export interface AIFillPlan {
    readonly scope: AIFillScope;
    readonly mode: AIFillMode;
    readonly cells: readonly AIPlannedCell[];
    readonly failed: readonly AIPlanFailure[];
    /** Cells in scope that won't be evaluated, by reason. */
    readonly skipped: { readonly [R in AISkipReason]?: number };
    readonly columnIds: readonly AIColumnId[];
    /** How many requests the fill needs, after cache hits and in-flight duplicates. */
    readonly requests: number;
    /** Set when the fill can't run: the configuration is invalid, or it exceeds `maxCellsPerRun`. */
    readonly error?: AIFillError;
}

/** A started run. */
export interface AIRunHandle {
    readonly runId: string;
    /** Resolves with the summary when the run ends, including when it is cancelled. */
    readonly done: Promise<AIRunSummary>;
}

/** Input to {@link AIFillEngine.recordCommit}. */
export interface AICommitInput {
    readonly source: "accept" | "auto-apply" | "choose";
    readonly edits: readonly (AICellRef & {
        readonly location: Item;
        readonly previous: GridCell;
        readonly next: EditableGridCell;
    })[];
}

/** The result of {@link AIFillEngine.recordCommit}. */
export interface AICommitResult {
    /** The commit id, or `undefined` when nothing was committed. */
    readonly commitId: string | undefined;
    readonly committed: readonly AICellRef[];
    /** Cells whose result was already committed. They must not be written again. */
    readonly alreadyCommitted: readonly AICellRef[];
}

type FlightOutcome =
    | { readonly kind: "answer"; readonly answer: ParsedJevAnswer; readonly requestId?: string }
    | { readonly kind: "error"; readonly error: AIFillError };

/** One request in flight (or queued), shared by every run waiting on one of its cells. */
interface Flight {
    readonly waiters: Set<RunState>;
    readonly controller: AbortController;
    readonly keys: readonly string[];
}

interface PendingCell {
    readonly ref: AICellRef;
    readonly requestSeq: number;
    readonly cell?: AIPlannedCell;
    flight?: Flight;
}

interface RunState {
    readonly runId: string;
    readonly pending: Map<string, PendingCell>;
    readonly flights: Set<Flight>;
    readonly counts: { [S in AICellStatus]?: number };
    readonly skipped: { readonly [R in AISkipReason]?: number };
    readonly total: number;
    done: number;
    finished: boolean;
    finishQueued: boolean;
    readonly resolve: (summary: AIRunSummary) => void;
}

/** The result of validating the configuration. */
interface ValidationState {
    readonly issues: readonly AIFillConfigIssue[];
    /** Columns disabled by a column-level issue. */
    readonly disabled: ReadonlySet<AIColumnId>;
    /** The first issue that disables AI Fill for the whole grid. */
    readonly gridIssue?: AIFillConfigIssue;
}

const defaultFillScopes: readonly AIFillScope[] = ["selection", "selection-empty", "column-empty"];

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function hasOwn(object: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, key);
}

/** Calls an app callback. A throw is rethrown asynchronously, so it is visible but never breaks AI Fill. */
function notify<A>(callback: ((arg: A) => void) | undefined, arg: A): void {
    if (callback === undefined) return;
    try {
        callback(arg);
    } catch (error) {
        queueMicrotask(() => {
            throw error;
        });
    }
}

function sameConnection(a: AIFillConnection, b: AIFillConnection): boolean {
    if (a === b) return true;
    const aRecord = a as unknown as Record<string, unknown>;
    const bRecord = b as unknown as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
    return [...keys].every(key => aRecord[key] === bRecord[key]);
}

function sameTransportSettings(a: ResolvedExecution, b: ResolvedExecution): boolean {
    return (
        a.timeoutMs === b.timeoutMs &&
        a.maxRetries === b.maxRetries &&
        a.backoff.initialMs === b.backoff.initialMs &&
        a.backoff.maxMs === b.backoff.maxMs &&
        a.backoff.jitter === b.backoff.jitter
    );
}

function countInto<K extends string>(counts: { [P in K]?: number }, key: K, amount: number = 1): void {
    counts[key] = (counts[key] ?? 0) + amount;
}

/**
 * The AI Fill execution engine. It has no React and no DOM: it plans fills
 * against a {@link AIFillEngineHost}, schedules requests, caches and dedups
 * answers, settles results into an {@link AIFillStore}, and calls the config's
 * lifecycle callbacks.
 *
 * Inference only ever starts from {@link fill}, {@link run}, {@link retry} or
 * {@link rerunStale}. Nothing else sends a request.
 */
export class AIFillEngine {
    readonly store = new AIFillStore();
    private config: AIFillConfig;
    private readonly host: AIFillEngineHost;
    private readonly isBrowser: boolean | undefined;
    private readonly random: (() => number) | undefined;
    private settings: ResolvedExecution;
    private transport: JevTransport;
    private readonly scheduler: RequestScheduler;
    private readonly cache: LruCache<{ readonly answer: ParsedJevAnswer; readonly requestId?: string }>;
    private readonly inflight = new Map<string, Flight>();
    private readonly runs = new Map<string, RunState>();
    private readonly reportedColumnErrors = new Set<string>();
    private readonly questions = new WeakMap<AIColumnDefinition, { question: JevQuestion; fingerprint: string }>();
    private validation: ValidationState;
    private runCounter = 0;
    private commitCounter = 0;
    private disposed = false;

    constructor(options: AIFillEngineOptions) {
        this.config = options.config;
        this.host = options.host;
        this.isBrowser = options.isBrowser;
        this.random = options.random;
        this.settings = resolveExecution(options.config.execution);
        this.validation = this.validate(options.columns);
        this.transport = this.createTransport();
        this.scheduler = new RequestScheduler(() => this.settings);
        this.cache = new LruCache(() => this.settings.cacheSize);
    }

    /** The configuration problems found by `validateAIFillConfig`. */
    get issues(): readonly AIFillConfigIssue[] {
        return this.validation.issues;
    }

    /** The execution settings with defaults filled in. */
    get execution(): ResolvedExecution {
        return this.settings;
    }

    /** Runs that haven't ended. */
    get activeRuns(): readonly string[] {
        return [...this.runs.keys()];
    }

    getRecord(rowId: AIRowId, columnId: AIColumnId): AICellRecord | undefined {
        return this.store.get(rowId, columnId);
    }

    /** Listens for record changes. Returns an unsubscribe function. */
    subscribe(listener: AIStoreListener): () => void {
        return this.store.subscribe(listener);
    }

    /** The metadata passed to callbacks for a record. */
    metadata(record: AICellRecord): AIResultMetadata {
        return {
            runId: record.runId,
            rowId: record.rowId,
            columnId: record.columnId,
            requestedModel: record.identity.model,
            ...(record.answer === undefined ? {} : { model: record.answer.model, answer: record.answer }),
            questionFingerprint: shortHash(record.identity.questionFingerprint),
            inputFingerprint: shortHash(record.identity.inputFingerprint),
            timings: record.timings,
        };
    }

    /**
     * Works out which cells a fill evaluates and which it skips, without
     * sending anything (SPST-17 §6.2 and §8.2). A cell is skipped when it is
     * unloaded (or its row is gone), read-only, not applicable (the column is
     * disabled by a configuration issue, doesn't allow the scope, or `applies`
     * returns false), populated (by `isEmpty`, `overwrite` and the scope),
     * missing input, or already decided with the same identity (`cached`).
     */
    plan(target: AIFillPlanTarget): AIFillPlan {
        const { scope } = target;
        const mode = target.mode ?? "suggest";
        const skipped: { [R in AISkipReason]?: number } = {};
        const cells: AIPlannedCell[] = [];
        const failed: AIPlanFailure[] = [];
        const columnIds = new Set<AIColumnId>();
        const seen = new Set<string>();
        const gridIssue = this.validation.gridIssue;
        if (gridIssue !== undefined) {
            return {
                scope,
                mode,
                cells,
                failed,
                skipped,
                columnIds: [],
                requests: 0,
                error: {
                    kind: "configuration",
                    message: `AI Fill is disabled: ${[gridIssue.path, gridIssue.message].filter(part => part !== "").join(" ")}`,
                    retryable: false,
                },
            };
        }

        for (const [rowId, columnId] of target.cells) {
            const key = cellKey(rowId, columnId);
            if (seen.has(key) || !hasOwn(this.config.columns, columnId)) continue;
            seen.add(key);
            columnIds.add(columnId);
            const definition = this.config.columns[columnId];
            const planned = this.planCell(rowId, columnId, definition, scope, mode);
            if (planned.kind === "skip") countInto(skipped, planned.reason);
            else if (planned.kind === "failed") failed.push(planned.failure);
            else cells.push(planned.cell);
        }

        const sendable = cells.filter(
            cell =>
                cell.stateJson.length <= this.settings.maxStateChars &&
                !this.cache.has(cell.cacheKey) &&
                !this.inflight.has(cell.cacheKey)
        );
        const total = cells.length + failed.length;
        return {
            scope,
            mode,
            cells,
            failed,
            skipped,
            columnIds: [...columnIds],
            requests: groupRequests(sendable, this.settings.maxQuestionsPerRequest).length,
            ...(total > this.settings.maxCellsPerRun
                ? {
                      error: {
                          kind: "configuration",
                          message: `This fill covers ${total} cells; the limit is execution.maxCellsPerRun (${this.settings.maxCellsPerRun})`,
                          retryable: false,
                      },
                  }
                : {}),
        };
    }

    /** Plans and runs a fill. */
    fill(target: AIFillPlanTarget): AIRunHandle {
        return this.run(this.plan(target));
    }

    /**
     * Runs a plan. Cells whose state is longer than `maxStateChars` fail with
     * `input-too-large` before anything is sent. Cached answers settle without a
     * request, and cells already in flight join that request. The rest are
     * grouped into requests and queued.
     */
    run(plan: AIFillPlan): AIRunHandle {
        const runId = `run-${++this.runCounter}`;
        let resolve: (summary: AIRunSummary) => void = () => undefined;
        const done = new Promise<AIRunSummary>(r => {
            resolve = r;
        });
        const run: RunState = {
            runId,
            pending: new Map(),
            flights: new Set(),
            counts: {},
            skipped: plan.skipped,
            total: plan.error === undefined ? plan.cells.length + plan.failed.length : 0,
            done: 0,
            finished: false,
            finishQueued: false,
            resolve,
        };
        if (plan.error !== undefined || this.disposed) {
            if (plan.error !== undefined) notify(this.config.onError, plan.error);
            this.scheduleFinish(run);
            return { runId, done };
        }
        this.runs.set(runId, run);
        notify(this.config.onRunStart, {
            runId,
            columnIds: plan.columnIds,
            cells: run.total,
            apply: plan.cells.some(cell => cell.mode === "apply"),
        });

        const queuedAt = Date.now();
        for (const failure of plan.failed) {
            const record = this.store.enqueue({ ...failure, runId, queuedAt });
            const pending: PendingCell = { ref: failure, requestSeq: record.requestSeq };
            run.pending.set(cellKey(failure.rowId, failure.columnId), pending);
            notify(this.config.onError, failure.error);
            this.settle(run, pending, { kind: "error", error: failure.error });
        }

        const fresh: AIPlannedCell[] = [];
        for (const cell of plan.cells) {
            const record = this.store.enqueue({
                rowId: cell.rowId,
                columnId: cell.columnId,
                runId,
                scope: cell.scope,
                mode: cell.mode,
                identity: cell.identity,
                destinationSnapshot: cellData(cell.destination),
                state: cell.state,
                queuedAt,
            });
            const pending: PendingCell = { ref: cell, requestSeq: record.requestSeq, cell };
            run.pending.set(cellKey(cell.rowId, cell.columnId), pending);

            const cached = this.cache.get(cell.cacheKey);
            const flight = this.inflight.get(cell.cacheKey);
            if (cell.stateJson.length > this.settings.maxStateChars) {
                const error: AIFillError = {
                    kind: "input-too-large",
                    message: `The row state is ${cell.stateJson.length} characters of JSON; the limit is execution.maxStateChars (${this.settings.maxStateChars})`,
                    retryable: false,
                    cells: [[cell.rowId, cell.columnId]],
                };
                notify(this.config.onError, error);
                this.settle(run, pending, { kind: "error", error });
            } else if (cached !== undefined) {
                this.settle(run, pending, { kind: "answer", ...cached });
            } else if (flight !== undefined) {
                pending.flight = flight;
                flight.waiters.add(run);
                run.flights.add(flight);
            } else {
                fresh.push(cell);
            }
        }

        for (const request of groupRequests(fresh, this.settings.maxQuestionsPerRequest)) {
            this.startFlight(run, request);
        }
        this.scheduleFinish(run);
        return { runId, done };
    }

    /** Re-runs failed cells (all of them, or those in `target`), each with the scope and mode it had. */
    retry(target?: readonly AICellRef[]): AIRunHandle {
        return this.rerun(record => record.status === "error", target);
    }

    /** Re-runs stale cells (all of them, or those in `target`), each with the scope and mode it had. */
    rerunStale(target?: readonly AICellRef[]): AIRunHandle {
        return this.rerun(record => record.status === "stale", target);
    }

    /**
     * Cancels one run, or every run. Queued requests are dropped, requests no
     * other run is waiting on are aborted, and the run's in-flight records go
     * back to what they were. Late responses are ignored.
     */
    cancel(runId?: string): void {
        const targets = runId === undefined ? [...this.runs.values()] : [this.runs.get(runId)];
        for (const run of targets) {
            if (run === undefined || run.finished) continue;
            this.detach(run);
            this.store.cancelRun(run.runId);
            countInto(run.counts, "cancelled", run.pending.size);
            run.done += run.pending.size;
            run.pending.clear();
            this.finish(run, true);
        }
        this.scheduler.prune();
    }

    /** Marks decided or stale results `rejected` and calls `onReject`. Nothing is written. */
    reject(target: readonly AICellRef[]): AICellRef[] {
        const rejected = this.store.reject(target);
        if (rejected.length > 0) {
            notify(this.config.onReject, {
                cells: rejected.map(record => ({
                    rowId: record.rowId,
                    columnId: record.columnId,
                    metadata: this.metadata(record),
                })),
            });
        }
        return rejected.map(({ rowId, columnId }) => ({ rowId, columnId }));
    }

    /**
     * Records a batch of writes and calls `onCommit`. The commit path calls it
     * after the commit guards pass and right before writing, in the same tick,
     * and writes only the cells in `committed`. A result that already has a
     * commit id is returned in `alreadyCommitted`, is not committed again and is
     * reported once to `onError` as `commit-blocked`, so a retry or a repeated
     * accept can't write twice.
     */
    recordCommit(input: AICommitInput): AICommitResult {
        const commitId = `commit-${++this.commitCounter}`;
        const status = input.source === "auto-apply" ? "applied" : "accepted";
        const { committed, alreadyCommitted } = this.store.commit(input.edits, commitId, status);
        if (alreadyCommitted.length > 0) {
            notify(this.config.onError, {
                kind: "commit-blocked",
                message: `${alreadyCommitted.length} result(s) were already committed and weren't written again`,
                retryable: false,
                cells: alreadyCommitted.map(ref => [ref.rowId, ref.columnId] as const),
            });
        }
        if (committed.length === 0) return { commitId: undefined, committed: [], alreadyCommitted };
        const byKey = new Map(committed.map(record => [cellKey(record.rowId, record.columnId), record]));
        const edits = input.edits.flatMap(edit => {
            const record = byKey.get(cellKey(edit.rowId, edit.columnId));
            if (record === undefined) return [];
            return [
                {
                    rowId: edit.rowId,
                    columnId: edit.columnId,
                    location: edit.location,
                    previous: edit.previous,
                    next: edit.next,
                    metadata: this.metadata(record),
                },
            ];
        });
        notify(this.config.onCommit, { commitId, source: input.source, edits });
        return {
            commitId,
            committed: committed.map(({ rowId, columnId }) => ({ rowId, columnId })),
            alreadyCommitted,
        };
    }

    /**
     * Tells the engine about edits made in the grid. An edited AI cell is marked
     * `manual` (and stale if pending or decided); for every AI column whose
     * `sources` include an edited column, that row's result becomes stale.
     */
    markEdited(edits: readonly AICellRef[]): void {
        for (const edit of edits) {
            if (hasOwn(this.config.columns, edit.columnId)) this.store.markDestinationEdited(edit);
            for (const [columnId, definition] of Object.entries(this.config.columns)) {
                if ((definition.sources ?? []).includes(edit.columnId)) {
                    this.store.markSourceChanged({ rowId: edit.rowId, columnId });
                }
            }
        }
    }

    /**
     * Re-fingerprints the records of the given rows (or all rows) after an
     * external data change. A changed input marks the result stale, and a
     * changed destination also marks it manual. A decided result whose row is
     * gone is dropped with `onResult` reason `row-missing`.
     */
    notifyRowsChanged(rowIds?: readonly AIRowId[]): void {
        const rows = rowIds === undefined ? undefined : new Set(rowIds);
        for (const record of this.store.all()) {
            if (rows !== undefined && !rows.has(record.rowId)) continue;
            if (!isInFlight(record) && !isDecided(record)) continue;
            if (!hasOwn(this.config.columns, record.columnId)) continue;
            const definition = this.config.columns[record.columnId];
            const read = this.host.readCell(record.rowId, record.columnId, definition.sources ?? []);
            if (read === undefined) {
                if (isDecided(record)) this.dropMissingRow(record);
                continue;
            }
            const current = this.currentCell(definition, record, read);
            if (!destinationUnchanged(record.destinationSnapshot, current.destination)) {
                this.store.markDestinationEdited(record);
            } else if (!identityMatches(record.identity, current.identity)) {
                this.store.markSourceChanged(record);
            }
        }
    }

    /**
     * Applies a new configuration. Removed columns drop their records. A column
     * whose question or model changed has its results marked stale. Any other
     * change to a column's definition (policy, output, presentation, `decide`)
     * re-evaluates its stored answers synchronously, with no request (SPST-17 §4.5).
     */
    setConfig(config: AIFillConfig, columns?: readonly GridColumn[]): void {
        const previous = this.config;
        const previousSettings = this.settings;
        this.config = config;
        this.settings = resolveExecution(config.execution);
        this.validation = this.validate(columns);
        this.cache.trim();
        if (
            !sameConnection(previous.connection, config.connection) ||
            !sameTransportSettings(previousSettings, this.settings)
        ) {
            this.transport = this.createTransport();
        }

        for (const columnId of Object.keys(previous.columns)) {
            if (!hasOwn(config.columns, columnId)) this.store.remove(record => record.columnId === columnId);
        }
        for (const [columnId, definition] of Object.entries(config.columns)) {
            if (previous.columns[columnId] === definition && previous.model === config.model) continue;
            const { fingerprint } = this.question(definition);
            const model = resolveModel(config, definition);
            for (const record of this.store.all()) {
                if (record.columnId !== columnId) continue;
                if (record.identity.questionFingerprint !== fingerprint || record.identity.model !== model) {
                    this.store.markStale(record);
                } else {
                    this.reevaluate(record, definition);
                }
            }
        }
    }

    /** Cancels every run and stops the engine. */
    dispose(): void {
        this.cancel();
        this.disposed = true;
        this.scheduler.dispose();
    }

    private validate(columns: readonly GridColumn[] | undefined): ValidationState {
        const issues = validateAIFillConfig(this.config, {
            ...(columns === undefined ? {} : { columns }),
            ...(this.isBrowser === undefined ? {} : { isBrowser: this.isBrowser }),
        });
        const gridIssue = issues.find(issue => issue.columnId === undefined);
        return {
            issues,
            disabled: new Set(issues.flatMap(issue => (issue.columnId === undefined ? [] : [issue.columnId]))),
            ...(gridIssue === undefined ? {} : { gridIssue }),
        };
    }

    private createTransport(): JevTransport {
        const { timeoutMs, maxRetries, backoff } = this.settings;
        return createJevTransport(this.config.connection, {
            timeoutMs,
            maxRetries,
            backoff,
            ...(this.random === undefined ? {} : { random: this.random }),
            ...(this.isBrowser === undefined ? {} : { isBrowser: this.isBrowser }),
        });
    }

    private question(definition: AIColumnDefinition): { question: JevQuestion; fingerprint: string } {
        let entry = this.questions.get(definition);
        if (entry === undefined) {
            entry = { question: buildQuestion(definition), fingerprint: questionFingerprint(definition) };
            this.questions.set(definition, entry);
        }
        return entry;
    }

    private planCell(
        rowId: AIRowId,
        columnId: AIColumnId,
        definition: AIColumnDefinition,
        scope: AIFillScope,
        mode: AIFillMode
    ):
        | { readonly kind: "skip"; readonly reason: AISkipReason }
        | { readonly kind: "failed"; readonly failure: AIPlanFailure }
        | { readonly kind: "cell"; readonly cell: AIPlannedCell } {
        if (this.validation.disabled.has(columnId) || !(definition.fillScopes ?? defaultFillScopes).includes(scope)) {
            return { kind: "skip", reason: "not-applicable" };
        }
        const read = this.host.readCell(rowId, columnId, definition.sources ?? []);
        if (read === undefined || read.destination.kind === GridCellKind.Loading) {
            return { kind: "skip", reason: "unloaded" };
        }
        const destination = read.destination;
        if (!isWritableCell(destination)) return { kind: "skip", reason: "read-only" };

        const { question, fingerprint } = this.question(definition);
        const model = resolveModel(this.config, definition);
        const ctx = rowContext(rowId, columnId, read);
        let state: JevState;
        let stateJson: string;
        try {
            if (definition.applies !== undefined && !definition.applies(ctx)) {
                return { kind: "skip", reason: "not-applicable" };
            }
            const empty = (definition.isEmpty ?? isAIDestinationEmpty)(destination);
            const overwrite = definition.overwrite ?? "never";
            if (!empty && !overwriteAllows({ overwrite, destinationEmpty: false, source: "accept", scope })) {
                return { kind: "skip", reason: "populated" };
            }
            if ((definition.missingInput ?? "skip") === "skip" && isInputMissing(definition, ctx)) {
                return { kind: "skip", reason: "missing-input" };
            }
            state = buildState(this.config, definition, ctx);
            stateJson = canonicalJson(state);
        } catch (error) {
            return {
                kind: "failed",
                failure: {
                    rowId,
                    columnId,
                    scope,
                    mode,
                    identity: { questionFingerprint: fingerprint, inputFingerprint: "", model },
                    destinationSnapshot: cellData(destination),
                    error: {
                        kind: "configuration",
                        message: `Column "${columnId}": building the row state failed: ${errorMessage(error)}`,
                        retryable: false,
                        columnId,
                        cells: [[rowId, columnId]],
                    },
                },
            };
        }

        const identity: ResultIdentity = { questionFingerprint: fingerprint, inputFingerprint: stateJson, model };
        const existing = this.store.get(rowId, columnId);
        if (
            existing !== undefined &&
            isDecided(existing) &&
            existing.manual !== true &&
            identityMatches(existing.identity, identity) &&
            destinationUnchanged(existing.destinationSnapshot, destination)
        ) {
            return { kind: "skip", reason: "cached" };
        }
        return {
            kind: "cell",
            cell: {
                rowId,
                columnId,
                row: read.row,
                definition,
                destination,
                question,
                model,
                state,
                stateJson,
                identity,
                cacheKey: cacheKey({
                    rowId,
                    columnId,
                    questionFingerprint: fingerprint,
                    inputFingerprint: stateJson,
                    model,
                }),
                scope,
                mode,
            },
        };
    }

    private rerun(select: (record: AICellRecord) => boolean, target?: readonly AICellRef[]): AIRunHandle {
        const wanted = target === undefined ? undefined : new Set(target.map(ref => cellKey(ref.rowId, ref.columnId)));
        const groups = new Map<string, { scope: AIFillScope; mode: AIFillMode; cells: [AIRowId, AIColumnId][] }>();
        for (const record of this.store.all()) {
            if (!select(record) || (wanted !== undefined && !wanted.has(cellKey(record.rowId, record.columnId))))
                continue;
            const key = `${record.scope}\u0000${record.mode}`;
            let group = groups.get(key);
            if (group === undefined) {
                group = { scope: record.scope, mode: record.mode, cells: [] };
                groups.set(key, group);
            }
            group.cells.push([record.rowId, record.columnId]);
        }
        const plans = [...groups.values()].map(group => this.plan(group));
        const first = plans[0] as AIFillPlan | undefined;
        const error = plans.find(plan => plan.error !== undefined)?.error;
        const skipped: { [R in AISkipReason]?: number } = {};
        for (const plan of plans) {
            for (const [reason, count] of Object.entries(plan.skipped) as [AISkipReason, number][]) {
                countInto(skipped, reason, count);
            }
        }
        return this.run({
            scope: first?.scope ?? "selection",
            mode: first?.mode ?? "suggest",
            cells: plans.flatMap(plan => plan.cells),
            failed: plans.flatMap(plan => plan.failed),
            skipped,
            columnIds: [...new Set(plans.flatMap(plan => plan.columnIds))],
            requests: plans.reduce((sum, plan) => sum + plan.requests, 0),
            ...(error === undefined ? {} : { error }),
        });
    }

    private startFlight(run: RunState, planned: PlannedRequest<AIPlannedCell>): void {
        const flight: Flight = {
            waiters: new Set([run]),
            controller: new AbortController(),
            keys: planned.questions.map(q => q.cell.cacheKey),
        };
        for (const { cell } of planned.questions) {
            this.inflight.set(cell.cacheKey, flight);
            const pending = run.pending.get(cellKey(cell.rowId, cell.columnId));
            if (pending !== undefined) pending.flight = flight;
        }
        run.flights.add(flight);
        this.scheduler.enqueue({
            cancelled: () => flight.waiters.size === 0,
            start: () => this.execute(flight, planned),
        });
    }

    private flightCells(run: RunState, flight: Flight): PendingCell[] {
        return [...run.pending.values()].filter(pending => pending.flight === flight);
    }

    private release(flight: Flight): void {
        for (const key of flight.keys) {
            if (this.inflight.get(key) === flight) this.inflight.delete(key);
        }
    }

    private async execute(flight: Flight, planned: PlannedRequest<AIPlannedCell>): Promise<void> {
        if (flight.waiters.size === 0) {
            this.release(flight);
            return;
        }
        const sentAt = Date.now();
        for (const run of flight.waiters) {
            for (const pending of this.flightCells(run, flight)) {
                this.store.markPending({ ...pending.ref, runId: run.runId, requestSeq: pending.requestSeq }, sentAt);
            }
        }

        let outcomes: Map<string, FlightOutcome>;
        try {
            const result = await this.transport.send(planned.request, flight.controller.signal);
            this.release(flight);
            outcomes = new Map();
            const { answers, model } = result.response;
            const requestId = result.requestId;
            for (const { questionId, cell } of planned.questions) {
                const tag = requestId === undefined ? {} : { requestId };
                const cells = [[cell.rowId, cell.columnId] as const];
                if (!hasOwn(answers, questionId)) {
                    outcomes.set(cell.cacheKey, {
                        kind: "error",
                        error: {
                            kind: "evaluation",
                            message: `Jev returned no answer for column "${cell.columnId}" (question ${questionId})`,
                            retryable: true,
                            cells,
                            ...tag,
                        },
                    });
                    continue;
                }
                const parsed = parseJevAnswer(answers[questionId], cell.question, model);
                if (parsed.ok) {
                    this.cache.set(cell.cacheKey, { answer: parsed.answer, ...tag });
                    outcomes.set(cell.cacheKey, { kind: "answer", answer: parsed.answer, ...tag });
                } else {
                    outcomes.set(cell.cacheKey, {
                        kind: "error",
                        error: {
                            kind: "malformed",
                            message: `The answer for column "${cell.columnId}" is malformed: ${parsed.reason}`,
                            retryable: false,
                            cells,
                            ...tag,
                        },
                    });
                }
            }
        } catch (error) {
            this.release(flight);
            if (flight.controller.signal.aborted || isAbortError(error)) return;
            const failure: JevTransportErrorInit = isJevTransportError(error)
                ? error
                : { kind: "network", message: errorMessage(error), retryable: true };
            if (failure.kind === "rate-limit" || failure.kind === "overloaded") {
                this.scheduler.pause(Math.min(failure.retryAfterMs ?? this.settings.backoff.maxMs, maxRetryAfterMs));
            }
            for (const run of flight.waiters) this.failFlight(run, flight, failure);
            return;
        }

        for (const run of flight.waiters) {
            for (const pending of this.flightCells(run, flight)) {
                const outcome = outcomes.get(pending.cell?.cacheKey ?? "");
                if (outcome === undefined) continue;
                if (outcome.kind === "error") notify(this.config.onError, outcome.error);
                this.settle(run, pending, outcome);
            }
            run.flights.delete(flight);
            this.scheduleFinish(run);
        }
    }

    private failFlight(run: RunState, flight: Flight, failure: JevTransportErrorInit): void {
        if (run.finished) return;
        const cells = failure.kind === "authentication" ? [...run.pending.values()] : this.flightCells(run, flight);
        const error: AIFillError = {
            kind: failure.kind,
            message: failure.message,
            retryable: failure.retryable,
            ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
            ...(failure.requestId === undefined ? {} : { requestId: failure.requestId }),
            cells: cells.map(pending => [pending.ref.rowId, pending.ref.columnId] as const),
        };
        notify(this.config.onError, error);
        if (failure.kind === "authentication") {
            // A 401 or 403 aborts the whole run: one error, and no further request for it.
            this.detach(run);
            this.scheduler.prune();
        } else {
            run.flights.delete(flight);
        }
        for (const pending of cells) this.settle(run, pending, { kind: "error", error });
        this.scheduleFinish(run);
    }

    /** Stops a run waiting on its requests. Requests nobody else waits on are aborted. */
    private detach(run: RunState): void {
        for (const flight of run.flights) {
            flight.waiters.delete(run);
            if (flight.waiters.size === 0) {
                flight.controller.abort();
                this.release(flight);
            }
        }
        run.flights.clear();
        for (const pending of run.pending.values()) pending.flight = undefined;
    }

    private currentCell(definition: AIColumnDefinition, ref: AICellRef, read: AIFillCellRead): AICurrentCell {
        let inputFingerprint = "";
        try {
            inputFingerprint = canonicalJson(
                buildState(this.config, definition, rowContext(ref.rowId, ref.columnId, read))
            );
        } catch {
            // An accessor that throws now can't confirm the input, so the result is treated as stale.
        }
        return {
            identity: {
                questionFingerprint: this.question(definition).fingerprint,
                inputFingerprint,
                model: resolveModel(this.config, definition),
            },
            destination: read.destination,
        };
    }

    private reevaluate(record: AICellRecord, definition: AIColumnDefinition): void {
        const read = this.host.readCell(record.rowId, record.columnId, definition.sources ?? []);
        if (read === undefined) return;
        this.store.reevaluate(record, answer => {
            const evaluation = evaluateAIPolicy({
                definition,
                answer,
                context: {
                    rowId: record.rowId,
                    columnId: record.columnId,
                    row: read.row,
                    ...(record.state === undefined ? {} : { state: record.state }),
                    destination: read.destination,
                },
                mode: record.mode,
            });
            if (evaluation.status !== "error" && evaluation.configurationError !== undefined) {
                this.reportColumnError(evaluation.configurationError);
            }
            return evaluation;
        });
    }

    private reportColumnError(error: AIFillError): void {
        const key = `${error.columnId ?? ""}\u0000${error.message}`;
        if (this.reportedColumnErrors.has(key)) return;
        this.reportedColumnErrors.add(key);
        notify(this.config.onError, error);
    }

    private dropMissingRow(record: AICellRecord): void {
        this.store.remove(r => r.rowId === record.rowId && r.columnId === record.columnId);
        notify(this.config.onResult, { ...this.metadata(record), status: "cancelled", reason: "row-missing" });
    }

    /** Settles one cell of a run with an answer or an error, and reports it. */
    private settle(run: RunState, pending: PendingCell, outcome: FlightOutcome): void {
        const key = cellKey(pending.ref.rowId, pending.ref.columnId);
        if (run.finished || run.pending.get(key) !== pending) return;
        run.pending.delete(key);
        run.done++;
        const tag = { ...pending.ref, runId: run.runId, requestSeq: pending.requestSeq };
        const before = this.store.get(pending.ref.rowId, pending.ref.columnId);
        const receivedAt = Date.now();

        let status: AICellStatus = "cancelled";
        let event: AIResultEvent | undefined;
        if (outcome.kind === "error") {
            const result = this.store.fail({
                ...tag,
                error: outcome.error,
                receivedAt,
                ...(outcome.error.requestId === undefined ? {} : { requestId: outcome.error.requestId }),
            });
            if (result.applied && result.record !== undefined) {
                status = result.record.status;
                event = { ...this.metadata(result.record), status, error: outcome.error };
            }
        } else {
            const definition = hasOwn(this.config.columns, pending.ref.columnId)
                ? this.config.columns[pending.ref.columnId]
                : undefined;
            if (definition === undefined) {
                // The column was removed from the configuration while the request was in flight.
                this.store.remove(r => r.runId === run.runId && r.requestSeq === pending.requestSeq);
            } else {
                const read = this.host.readCell(pending.ref.rowId, pending.ref.columnId, definition.sources ?? []);
                const mode = pending.cell?.mode ?? before?.mode ?? "suggest";
                const state = pending.cell?.state ?? before?.state;
                const result = this.store.resolve({
                    ...tag,
                    answer: outcome.answer,
                    ...(outcome.requestId === undefined ? {} : { requestId: outcome.requestId }),
                    receivedAt,
                    current: read === undefined ? undefined : this.currentCell(definition, pending.ref, read),
                    evaluate: destination => {
                        const evaluation = evaluateAIPolicy({
                            definition,
                            answer: outcome.answer,
                            context: {
                                ...pending.ref,
                                row: read?.row,
                                ...(state === undefined ? {} : { state }),
                                destination,
                            },
                            mode,
                        });
                        if (evaluation.status !== "error" && evaluation.configurationError !== undefined) {
                            this.reportColumnError(evaluation.configurationError);
                        }
                        return evaluation;
                    },
                });
                if (result.applied && result.record === undefined && before !== undefined) {
                    event = {
                        ...this.metadata({
                            ...before,
                            answer: outcome.answer,
                            timings: { ...before.timings, receivedAt },
                        }),
                        status: "cancelled",
                        reason: "row-missing",
                    };
                } else if (result.applied && result.record !== undefined) {
                    status = result.record.status;
                    event = {
                        ...this.metadata(result.record),
                        status,
                        ...(result.record.decision === undefined ? {} : { decision: result.record.decision }),
                        ...(result.record.error === undefined ? {} : { error: result.record.error }),
                    };
                }
            }
        }

        countInto(run.counts, status);
        if (event !== undefined) notify(this.config.onResult, event);
        notify(this.config.onRunProgress, { runId: run.runId, done: run.done, total: run.total });
    }

    private scheduleFinish(run: RunState): void {
        if (run.finishQueued || run.finished) return;
        run.finishQueued = true;
        queueMicrotask(() => {
            run.finishQueued = false;
            if (run.pending.size === 0) this.finish(run, false);
        });
    }

    private finish(run: RunState, cancelled: boolean): void {
        if (run.finished) return;
        run.finished = true;
        const started = this.runs.delete(run.runId);
        const summary: AIRunSummary = { runId: run.runId, cancelled, counts: { ...run.counts }, skipped: run.skipped };
        if (started) notify(this.config.onRunEnd, summary);
        run.resolve(summary);
    }
}
