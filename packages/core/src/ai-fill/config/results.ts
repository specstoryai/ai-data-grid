import type { EditableGridCell, GridCell, Item } from "../../internal/data-grid/data-grid-types.js";
import type { JevAnswerFor, JevPrimitive, ParsedJevAnswer } from "../contract/types.js";

/** A stable row id, as returned by `rows.getRowId`. */
export type AIRowId = string;

/** A stable column id: the AI column's `GridColumn.id`. */
export type AIColumnId = string;

/**
 * What a mapped answer means, independent of whether it is shown:
 * - `value`: an ordinary value for the cell
 * - `none`: a Choice option marked `outcome: "none"` (for example "none of the above")
 * - `unknown`: a Choice option marked `outcome: "unknown"` (for example "insufficient information")
 * - `uncertain`: a Noul in the middle band of a `boolean` or `label` mapping
 *
 * Semantic outcomes are answers, not errors, and are distinct from `withheld` and `review`.
 */
export type AISemanticOutcome = "value" | "none" | "unknown" | "uncertain";

/**
 * The result of mapping an answer to the grid. The raw answer, the display text
 * and the value to commit are three separate things.
 */
export interface AIMappedOutput<P extends JevPrimitive = JevPrimitive> {
    /** The raw, validated answer. Always kept, whatever the mapping. */
    readonly answer: JevAnswerFor<P>;
    /** The text shown to the user. Display rounding never feeds a policy decision. */
    readonly display: string;
    /** Whether there is a value to commit. `false` for a semantic outcome without a configured value, and for the Noul middle band. */
    readonly hasValue: boolean;
    /** The value to commit, when `hasValue` is `true`. `0` and `false` are ordinary values. */
    readonly value: unknown;
    /** The semantic outcome. */
    readonly outcome: AISemanticOutcome;
    /** The destination cell with `value` written into it, when a destination cell was given and `hasValue` is `true`. */
    readonly cell?: EditableGridCell;
    /** Score only: the rubric level the score maps to, by `output.levelFrom`. */
    readonly level?: number;
    /** Noul `boolean` and `label` mappings only: the band the probability falls in. */
    readonly band?: "false" | "true" | "between";
}

/**
 * The status a policy gives a result:
 * - `withheld`: failed `show`, or a Noul middle band set to `withhold`. Not shown; nothing is written.
 * - `review`: shown, but failed `ready` (or a Noul middle band set to `review`). Never auto-applied.
 * - `suggested`: shown and ready. Written only when a user accepts it.
 * - `apply-candidate`: passed `autoApply` in a "Fill and apply" run. Still subject to the commit guards.
 */
export type AIPolicyStatus = "withheld" | "review" | "suggested" | "apply-candidate";

/** The name of a declarative gate. */
export type AIGateName = "show" | "ready" | "autoApply";

/** Why a result got its policy status. */
export interface AIDecisionReason {
    /**
     * - `passed`: every configured gate passed
     * - `gate-failed`: a declarative gate failed (see `gate`, `measure`, `actual`, `threshold`)
     * - `band`: a Noul band decided the status
     * - `decide`: the `decide` callback decided the status
     * - `apply-not-requested`: passed `autoApply`, but the run isn't a "Fill and apply" run
     * - `no-value`: would be an apply candidate, but there is no value to write
     */
    readonly code: "passed" | "gate-failed" | "band" | "decide" | "apply-not-requested" | "no-value";
    /** The gate involved, if any. */
    readonly gate?: AIGateName;
    /** The measure that failed, for example `minProbability` or `optionProbability.b2b.max`. */
    readonly measure?: string;
    /** The exact value the gate compared, unrounded. */
    readonly actual?: number | string;
    /** The exact configured threshold. */
    readonly threshold?: number | string | readonly string[];
    /** A readable explanation, for example `withheld: probability 0.79 < show.minProbability 0.8`. */
    readonly message: string;
}

/** A policy decision for one result. */
export interface AIPolicyDecision {
    readonly status: AIPolicyStatus;
    readonly reason: AIDecisionReason;
}

/**
 * The kind of an {@link AIFillError}:
 *
 * | Kind | Scope |
 * |---|---|
 * | `configuration` | Run or column, or cells for an incomplete output mapping |
 * | `authentication` | Run |
 * | `rate-limit`, `overloaded`, `timeout`, `network`, `invalid-request` | Cells |
 * | `evaluation` | Cells: the answer for a question id is missing |
 * | `malformed` | Cells: the answer failed `parseJevAnswer` |
 * | `type-mismatch` | Cells: the value can't be mapped to the destination cell |
 * | `input-too-large` | Cells |
 * | `policy-callback` | Cells: `decide` threw or returned something invalid |
 * | `commit-blocked` | Cells: a write was refused. So far only for a result that was already committed; the validation, read-only, overwrite and staleness guards come with the commit path in a later stage |
 */
export type AIFillErrorKind =
    | "configuration"
    | "authentication"
    | "rate-limit"
    | "overloaded"
    | "timeout"
    | "network"
    | "invalid-request"
    | "evaluation"
    | "malformed"
    | "type-mismatch"
    | "input-too-large"
    | "policy-callback"
    | "commit-blocked";

/** An AI Fill error. Errors never erase data. */
export interface AIFillError {
    readonly kind: AIFillErrorKind;
    readonly message: string;
    /** Whether retrying the same request can succeed. */
    readonly retryable: boolean;
    readonly httpStatus?: number;
    /** The `x-typesafe-request-id` response header, when there was one. */
    readonly requestId?: string;
    /** The column, for column-scoped errors. */
    readonly columnId?: AIColumnId;
    /** The cells affected, for cell-scoped errors. */
    readonly cells?: readonly (readonly [AIRowId, AIColumnId])[];
}

/**
 * The status of one AI cell record, keyed by `(rowId, columnId)`. `cancelled`
 * restores the previous valid record.
 */
export type AICellStatus =
    | "queued"
    | "pending"
    | "suggested"
    | "review"
    | "withheld"
    | "error"
    | "stale"
    | "accepted"
    | "applied"
    | "rejected"
    | "cancelled";

/** Why a cell in a fill scope is not evaluated. */
export type AISkipReason = "populated" | "read-only" | "unloaded" | "not-applicable" | "missing-input" | "cached";

/** Metadata attached to every result, so the app can persist or observe outcomes and recognize stale ones. */
export interface AIResultMetadata {
    readonly runId: string;
    readonly rowId: AIRowId;
    readonly columnId: AIColumnId;
    /** The model id the request asked for, for example `jev-latest`. */
    readonly requestedModel: string;
    /** The versioned model id that answered, when there was an answer. */
    readonly model?: string;
    /** A short display hash of the question fingerprint. */
    readonly questionFingerprint: string;
    /** A short display hash of the input fingerprint. */
    readonly inputFingerprint: string;
    /** The validated answer, when there was one. */
    readonly answer?: ParsedJevAnswer;
    /** Milliseconds since the epoch. */
    readonly timings: { readonly queuedAt?: number; readonly sentAt?: number; readonly receivedAt?: number };
}

/** Passed to `onResult` for every decided result, including withheld and review ones. */
export interface AIResultEvent extends AIResultMetadata {
    readonly status: AICellStatus;
    readonly decision?: AIPolicyDecision;
    readonly error?: AIFillError;
    /**
     * Set with status `cancelled` when an answer arrived for a row that no
     * longer exists. The record is dropped and nothing is written.
     */
    readonly reason?: "row-missing";
}

/** Passed to `onRunStart`. */
export interface AIRunStartEvent {
    readonly runId: string;
    readonly columnIds: readonly AIColumnId[];
    /** The number of cells that will be evaluated. */
    readonly cells: number;
    /** Whether qualifying results may be applied ("Fill and apply"). */
    readonly apply: boolean;
}

/** Passed to `onRunProgress`. */
export interface AIRunProgressEvent {
    readonly runId: string;
    readonly done: number;
    readonly total: number;
}

/** Passed to `onRunEnd`: every outcome of the run, counted. */
export interface AIRunSummary {
    readonly runId: string;
    readonly cancelled: boolean;
    readonly counts: { readonly [S in AICellStatus]?: number };
    readonly skipped: { readonly [R in AISkipReason]?: number };
}

/** One write in an {@link AICommitEvent}. */
export interface AICommitEdit {
    readonly rowId: AIRowId;
    readonly columnId: AIColumnId;
    /** The display location at commit time. */
    readonly location: Item;
    readonly previous: GridCell;
    readonly next: EditableGridCell;
    readonly metadata: AIResultMetadata;
}

/** Passed to `onCommit` for every batch of writes. */
export interface AICommitEvent {
    readonly commitId: string;
    readonly source: "accept" | "auto-apply" | "choose";
    readonly edits: readonly AICommitEdit[];
}

/** Passed to `onReject`. */
export interface AIRejectEvent {
    readonly cells: readonly {
        readonly rowId: AIRowId;
        readonly columnId: AIColumnId;
        readonly metadata: AIResultMetadata;
    }[];
}
