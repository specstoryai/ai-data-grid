import type { AIFillMode, AIFillScope } from "./types.js";
import type { AIFillConfigIssue } from "./validate.js";
import type {
    AICellStatus,
    AIColumnId,
    AIFillError,
    AIMappedOutput,
    AIPolicyDecision,
    AIResultMetadata,
    AIRowId,
    AIRunSummary,
    AISkipReason,
} from "./results.js";

/**
 * The AI cells an action applies to:
 * - `{ cells }`: these cells, by `[rowId, columnId]`
 * - `{ selection: true }`: the AI cells in the grid's current selection
 * - `{ column, filter }`: the cells of one AI column that hold a result.
 *   `eligible` is the `suggested` results, `review` the `review` results, and
 *   `all` both. `accept` with `eligible` is "Accept all eligible", which never
 *   includes `review` results. The filter applies to every method, so
 *   `retry` and `rerunStale` find nothing to re-run with a column target.
 */
export type AIFillTarget =
    | { readonly cells: readonly (readonly [AIRowId, AIColumnId])[] }
    | { readonly selection: true }
    | { readonly column: AIColumnId; readonly filter: "eligible" | "review" | "all" };

/** What AI Fill knows about one cell, from {@link AIFillApi.getCellState}. */
export interface AICellState {
    readonly rowId: AIRowId;
    readonly columnId: AIColumnId;
    /** `queued` and `pending` wait for Jev; `suggested`, `review` and `withheld` hold a decided answer. */
    readonly status: Exclude<AICellStatus, "cancelled">;
    /**
     * The policy decision, for decided results. `decision.status` is
     * `apply-candidate` for a result that passed `autoApply` in a "Fill and apply" run.
     */
    readonly decision?: AIPolicyDecision;
    /** The mapped answer: the value to commit, its display text and its semantic outcome. */
    readonly output?: AIMappedOutput;
    readonly error?: AIFillError;
    /** Set once the result was written, or accepted without a value to write. It is never written again. */
    readonly commitId?: string;
    /** The destination was edited in the grid after the request. The result never auto-applies. */
    readonly manual: boolean;
    /** Why the last attempt to write this result was blocked. Nothing was written. */
    readonly blocked?: {
        readonly reason:
            | "already-committed"
            | "row-missing"
            | "stale"
            | "destination-changed"
            | "read-only"
            | "overwrite"
            | "validation"
            | "type-mismatch";
        readonly message: string;
    };
    readonly metadata: AIResultMetadata;
}

/** A run in progress. */
export interface AIActiveRun {
    readonly runId: string;
    readonly columnIds: readonly AIColumnId[];
    /** Cells in the run. */
    readonly total: number;
    /** Cells settled so far. */
    readonly done: number;
    /** Whether qualifying results may be applied ("Fill and apply"). */
    readonly apply: boolean;
}

/** AI Fill's overall state, from {@link AIFillApi.getRunState}. */
export interface AIRunState {
    /** Runs in progress, oldest first. */
    readonly active: readonly AIActiveRun[];
    /** The summary of the last run that ended. */
    readonly last?: AIRunSummary;
    /** AI cells by status, across the grid. */
    readonly cells: { readonly [S in Exclude<AICellStatus, "cancelled">]?: number };
    /** Configuration problems found by `validateAIFillConfig`. A problem with a `columnId` disables that column; one without disables AI Fill. */
    readonly issues: readonly AIFillConfigIssue[];
}

/** What {@link AIFillApi.fill}, `retry` and `rerunStale` started. */
export interface AIFillRun {
    /** The run id. Pass it to `cancel`. */
    readonly runId: string;
    /** Resolves with the run's summary when it ends, including when it is cancelled. */
    readonly done: Promise<AIRunSummary>;
    /** The cells that will be evaluated. */
    readonly cells: number;
    /** The requests the run needs, after cache hits and requests already in flight. */
    readonly requests: number;
    /** The cells in scope that won't be evaluated, by reason. */
    readonly skipped: { readonly [R in AISkipReason]?: number };
    /** Set when the fill can't run, for example because it needs `rowScope` or exceeds `maxCellsPerRun`. Nothing was sent. */
    readonly error?: AIFillError;
}

/**
 * AI Fill's API: `ref.current.aiFill` on a `DataEditor` with the `aiFill` prop,
 * once AI Fill has loaded, and the argument of `aiFill.onReady`. Rows are
 * always addressed by the stable ids from `rows.getRowId`.
 *
 * Inference starts only from `fill`, `retry` and `rerunStale`. Reading state,
 * painting, scrolling, selecting and sorting never send a request.
 */
export interface AIFillApi {
    /**
     * Starts a fill. The scope decides the cells:
     * - `selection`: the AI cells in the selection; populated cells follow `overwrite`
     * - `selection-empty`: only the empty AI cells in the selection
     * - `column-empty`: the empty cells of the AI columns within `rowScope`
     * - `column`: every cell of the AI columns within `rowScope`
     *
     * `columns` limits the fill to those AI columns (default: every AI column in
     * the grid). `mode: "apply"` is "Fill and apply": results that pass the
     * column's `autoApply` gate are written once they pass every commit guard.
     * Cells that are unloaded, read-only, not applicable, populated, missing
     * input or already decided with the same inputs are skipped and counted.
     */
    fill(
        scope: AIFillScope,
        options?: { readonly columns?: readonly AIColumnId[]; readonly mode?: AIFillMode }
    ): AIFillRun;
    /** Cancels one run, or every run. In-flight cells go back to what they were, and late answers are ignored. */
    cancel(runId?: string): void;
    /**
     * Writes the `suggested` and `review` results in the target through the
     * grid's edit handlers, as one batch, after re-checking every commit guard.
     * A `{ column }` target covers only displayed rows, and its `eligible`
     * filter never includes `review` results.
     * A result without a value to write (a semantic outcome without a `value`)
     * is marked accepted and nothing is written. Returns the commit id, or
     * `undefined` when nothing was written.
     */
    accept(target: AIFillTarget): string | undefined;
    /** Marks the decided or stale results in the target `rejected`. Nothing is written. Returns how many were rejected. */
    reject(target: AIFillTarget): number;
    /** Re-runs the failed cells in the target (default: every failed cell). */
    retry(target?: AIFillTarget): AIFillRun;
    /** Re-runs the stale cells in the target (default: every stale cell). */
    rerunStale(target?: AIFillTarget): AIFillRun;
    /**
     * Writes a commit's previous values back, by row id, through the same batch
     * path. A cell whose value changed since the commit, whose row is gone,
     * that is now read-only or whose old value `validateCell` rejects is left
     * alone. Returns how many cells were restored.
     */
    revertCommit(commitId: string): number;
    /** What AI Fill knows about one cell, or `undefined` when the cell has no result. Never sends a request. */
    getCellState(rowId: AIRowId, columnId: AIColumnId): AICellState | undefined;
    /** The active runs, the last run's summary, cell counts by status and the configuration issues. Never sends a request. */
    getRunState(): AIRunState;
    /**
     * Tells AI Fill that rows changed outside the grid's edit handlers. Their
     * results are re-fingerprinted: a changed input marks a result stale, and a
     * row that is gone drops its decided results. A row that is filtered out
     * counts as gone, so call it while a filter is on only for rows that are
     * displayed. Commits always re-check, whether or not this is called.
     */
    notifyRowsChanged(rowIds?: readonly AIRowId[]): void;
    /**
     * Drops the results in the target, or cancels every run and drops every
     * result. Cells still waiting for Jev keep waiting. Nothing is written.
     */
    clear(target?: AIFillTarget): void;
}
