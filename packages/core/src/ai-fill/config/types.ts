import type { EditableGridCell, GridCell } from "../../internal/data-grid/data-grid-types.js";
import type {
    JevAnswerFor,
    JevInstructions,
    JevPrimitive,
    JevRequest,
    JevResponse,
    JevState,
    AIJsonObject,
    AIJsonValue,
    ScoreAnswer,
} from "../contract/types.js";
import type {
    AICommitEvent,
    AIFillError,
    AIRejectEvent,
    AIResultEvent,
    AIRunProgressEvent,
    AIRunStartEvent,
    AIRunSummary,
    AIColumnId,
    AIMappedOutput,
    AIPolicyDecision,
    AIRowId,
} from "./results.js";
import type { AIFillApi } from "./api.js";

// ---------------------------------------------------------------------------
// Connection and execution
// ---------------------------------------------------------------------------

/**
 * Production mode: the browser POSTs `{ model, state, questions }` to your
 * server, which adds the key and forwards it to Jev. The key never reaches the browser.
 */
export interface AIFillEndpointConnection {
    readonly mode: "endpoint";
    /** Your endpoint's URL, for example `/api/jev`. */
    readonly url: string;
    /** Extra request headers, such as a CSRF token. Called for every request. */
    readonly headers?: () => Record<string, string> | Promise<Record<string, string>>;
    /** A `fetch` implementation. Defaults to the global `fetch`. */
    readonly fetch?: typeof fetch;
}

/**
 * Local and demo mode: calls Jev directly with the key. A key used in a browser
 * is visible to that browser's user, so browsers need `dangerouslyAllowBrowser: true`.
 */
export interface AIFillDirectConnection {
    readonly mode: "direct";
    readonly apiKey: string;
    /** Must be `true` to use direct mode in a browser. */
    readonly dangerouslyAllowBrowser?: boolean;
    /** Defaults to `https://api.typesafe.ai`. */
    readonly baseURL?: string;
    /** A `fetch` implementation. Defaults to the global `fetch`. */
    readonly fetch?: typeof fetch;
}

/** A custom transport, used by `/testing` and by unusual hosts. It must resolve to a Jev response body. */
export interface AIFillCustomConnection {
    readonly mode: "custom";
    readonly send: (request: JevRequest, signal: AbortSignal) => Promise<JevResponse>;
}

/** How AI Fill reaches Jev. */
export type AIFillConnection = AIFillEndpointConnection | AIFillDirectConnection | AIFillCustomConnection;

/** Scheduler limits. Every field is optional. */
export interface AIFillExecutionOptions {
    /** Requests in flight at once. Default 4. */
    readonly concurrency?: number;
    /** Default 600, half of Jev's documented limit. */
    readonly maxRequestsPerMinute?: number;
    /** Timeout per attempt, in milliseconds. Default 15000. */
    readonly timeoutMs?: number;
    /** Retries for transient failures. Default 2. */
    readonly maxRetries?: number;
    /** Retry backoff. Default 500 ms to 5 s, jitter 0.25. `Retry-After` is honored up to 60 s. */
    readonly backoff?: { readonly initialMs?: number; readonly maxMs?: number; readonly jitter?: number };
    /** The most cells one run may evaluate. Default 1000. */
    readonly maxCellsPerRun?: number;
    /**
     * A fill started from the built-in menus or the fill shortcut that would
     * evaluate more cells than this asks for confirmation first. `column`
     * fills and "Fill and apply" always ask. `api.fill` never asks. Default 100.
     */
    readonly confirmAbove?: number;
    /** Questions combined into one request. Default 16. */
    readonly maxQuestionsPerRequest?: number;
    /** A row state longer than this (as JSON) is an `input-too-large` error. Default 60000. */
    readonly maxStateChars?: number;
    /** Cached answers, least recently used first out. Default 5000. */
    readonly cacheSize?: number;
}

// ---------------------------------------------------------------------------
// Rows, contexts and scopes
// ---------------------------------------------------------------------------

/** Maps display rows to stable row ids and back. */
export interface AIFillRows {
    /** Display row → stable id. Required. Results are keyed by this id, never by display position. */
    readonly getRowId: (row: number) => AIRowId;
    /**
     * Stable id → display row, or `undefined` when the row isn't displayed.
     * Optional: without it, AI Fill scans `getRowId` over the rows once and
     * reuses the map until the current task ends. An index whose `getRowId` is
     * another id is treated as a missing row, so a wrong index can't redirect
     * a read or a write.
     */
    readonly getRowIndex?: (rowId: AIRowId) => number | undefined;
}

/** The row a callback is asked about. */
export interface AIRowContext {
    readonly rowId: AIRowId;
    /** The display row at the time of the call. */
    readonly row: number;
    /** The AI (destination) column. */
    readonly columnId: AIColumnId;
    /** The current cells of the column's `sources`, by column id. */
    readonly sources: { readonly [columnId: string]: GridCell };
}

/** The cell a mapping or policy callback is asked about. */
export interface AICellContext {
    readonly rowId: AIRowId;
    readonly columnId: AIColumnId;
    /** The display row, when it is known. */
    readonly row?: number;
    /** The row state that was sent to Jev, when it is known. */
    readonly state?: JevState;
    /** The destination cell at request time, when it is known. */
    readonly destination?: GridCell;
}

/** The rows a column-wide fill covers, supplied by the app. */
export interface AIRowScope {
    /** `"displayed"` for the rows currently displayed, or an explicit list of row ids. */
    readonly rows: "displayed" | readonly AIRowId[];
    /** How the scope is named to the user, for example "filtered contacts". */
    readonly label: string;
}

/**
 * Which cells a fill evaluates:
 * - `selection`: destination cells in the selection; populated cells follow `overwrite`
 * - `selection-empty`: only the empty destination cells in the selection
 * - `column-empty`: empty destination cells within the app's `rowScope`
 * - `column`: every destination cell within `rowScope` (opt-in). Populated cells are written only with `overwrite: "apply"`.
 */
export type AIFillScope = "selection" | "selection-empty" | "column-empty" | "column";

/**
 * What happens to populated destination cells:
 * - `never`: they are skipped
 * - `suggest`: they are evaluated for explicit selection scopes only, and never auto-applied
 * - `apply`: they can be evaluated and applied like empty cells
 */
export type AIOverwritePolicy = "never" | "suggest" | "apply";

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

/**
 * An inclusive range. A `min` passes when `value >= min`, a `max` when
 * `value <= max`. Values are compared exactly, with no epsilon or rounding.
 */
export interface AIRange {
    readonly min?: number;
    readonly max?: number;
}

/** Choice gate measures. Every condition in a gate must pass. */
export interface ChoiceGate {
    /** The probability of the selected option, and nothing else. Confidence is never substituted for it. */
    readonly minProbability?: number;
    /** Model confidence. Probability is never substituted for it. */
    readonly minConfidence?: number;
    /** The top option's probability minus the second-highest. */
    readonly minMargin?: number;
    /** The selected option must be in `in` (when set) and not in `notIn`. */
    readonly options?: { readonly in?: readonly string[]; readonly notIn?: readonly string[] };
    /** Bounds on any option's probability, by option id. */
    readonly optionProbability?: { readonly [optionId: string]: AIRange };
}

/** Score gate measures. Every condition in a gate must pass. */
export interface ScoreGate {
    /** Model confidence. The score's magnitude never bypasses it. */
    readonly minConfidence?: number;
    /** Bounds on the raw score, within [0, levels − 1]. */
    readonly score?: AIRange;
    /** Bounds on a level's probability, by level index. */
    readonly levelProbability?: { readonly [level: number]: AIRange };
}

/** Noul gate measures. A Noul has no confidence, so there is no confidence measure. */
export interface NoulGate {
    /** Bounds on the raw probability of yes. */
    readonly noul?: AIRange;
}

/** A status the `decide` callback may return. `apply` is honored only when the column configures `autoApply`. */
export type AIDecideStatus = "withheld" | "review" | "suggested" | "apply";

/** What `decide` returns: a new status and reason, or `undefined` to keep the declarative decision. It can't create a value. */
export type AIDecideResult = { readonly status: AIDecideStatus; readonly reason?: string } | undefined;

/** The context passed to `decide`. */
export interface AIDecideContext<P extends JevPrimitive = JevPrimitive> extends AICellContext {
    /** The full validated answer: probabilities, confidence, legend and the model that answered, as applicable. */
    readonly answer: JevAnswerFor<P>;
    /** The column's definition. */
    readonly definition: AIColumnDefinitionFor<P>;
    /** The mapped output: value, display text and semantic outcome. */
    readonly candidate: AIMappedOutput<P>;
    /** The decision the declarative gates reached. */
    readonly decision: AIPolicyDecision;
    /** `"apply"` in a "Fill and apply" run, otherwise `"suggest"`. */
    readonly mode: AIFillMode;
}

/** Whether a fill may apply qualifying results. */
export type AIFillMode = "suggest" | "apply";

/**
 * A result policy. For each result, in order:
 * 1. `show` fails → `withheld`
 * 2. `ready` fails → `review`
 * 3. otherwise `suggested`, and a result that passes `autoApply` in a "Fill and apply" run is an apply candidate
 * 4. `decide`, when set, may replace the status
 *
 * A gate that isn't configured passes, except `autoApply`, which never passes unless configured.
 * Thresholds are the developer's choice, not accuracy guarantees.
 */
export interface AIPolicy<G, P extends JevPrimitive> {
    readonly show?: G;
    readonly ready?: G;
    readonly autoApply?: G;
    /**
     * Runs last. Returning `undefined` keeps the declarative decision. A throw
     * makes the cell a `policy-callback` error, and nothing is written.
     */
    readonly decide?: (ctx: AIDecideContext<P>) => AIDecideResult;
}

/** A Choice policy. */
export type ChoicePolicy = AIPolicy<ChoiceGate, "choice">;
/** A Score policy. */
export type ScorePolicy = AIPolicy<ScoreGate, "score">;
/** A Noul policy. */
export type NoulPolicy = AIPolicy<NoulGate, "noul">;

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

/** Output settings shared by every primitive. */
export interface AIOutputBase<P extends JevPrimitive> {
    /** The display text. Receives the value (`undefined` when there is none) and the raw answer. */
    readonly format?: (value: unknown, answer: JevAnswerFor<P>) => string;
    /**
     * Writes an accepted value into the destination cell. Return `undefined` when
     * the value doesn't fit; the cell then gets a `type-mismatch` error and nothing
     * is written. The default handles Text, Markdown, Uri, Number, Boolean and the
     * cells package's dropdown cell.
     */
    readonly toCell?: (value: unknown, current: GridCell, ctx: AICellContext) => EditableGridCell | undefined;
}

/** Fields shared by every AI column definition. */
export interface AIColumnDefinitionBase {
    /** Jev `instructions`: the question. */
    readonly instructions: JevInstructions;
    /** Source column ids. They build the default state and invalidate results when edited. Default `[]` (then a state accessor is required). */
    readonly sources?: readonly AIColumnId[];
    /** A per-column row state accessor. Overrides the grid's `rowState`. */
    readonly state?: (ctx: AIRowContext) => JevState;
    /** Extra developer context, such as category definitions or examples. Sent with the instructions. */
    readonly context?: AIJsonValue;
    /** Whether the column applies to a row. Default: every row. */
    readonly applies?: (ctx: AIRowContext) => boolean;
    /** What to do when the input is missing. Default `"skip"`. */
    readonly missingInput?: "skip" | "evaluate";
    /**
     * What "missing" means. Default: the column has sources and every source
     * cell is empty by {@link isAIDestinationEmpty}.
     */
    readonly isMissing?: (ctx: AIRowContext) => boolean;
    /** Whether a destination cell is empty. Default {@link isAIDestinationEmpty}, under which `0` and `false` are values. */
    readonly isEmpty?: (cell: GridCell) => boolean;
    /** Default `"never"`. */
    readonly overwrite?: AIOverwritePolicy;
    /** Default `["selection", "selection-empty", "column-empty"]`. */
    readonly fillScopes?: readonly AIFillScope[];
    /** A per-column model. Default: the grid's `model`. */
    readonly model?: string;
}

/** One Choice option. */
export interface ChoiceOption {
    /** Sent to Jev as the option's criteria description. Use `null` for none. */
    readonly description: string | AIJsonObject | null;
    /** What users see. Default: the option id. */
    readonly label?: string;
    /** What gets stored. Default: `label ?? id`. For a semantic outcome, default: nothing is stored. */
    readonly value?: unknown;
    /** Marks a semantic outcome such as none-of-the-above (`none`) or insufficient information (`unknown`). Default `value`. */
    readonly outcome?: "value" | "none" | "unknown";
}

/** Choice display options. */
export interface ChoicePresentation {
    /** Show the selected option's probability. */
    readonly showProbability?: boolean;
    /** Show the model confidence, always labelled as model confidence. */
    readonly showConfidence?: boolean;
    /** Ranked alternatives to show. */
    readonly alternatives?: { readonly count: number; readonly minProbability?: number };
}

/** A Choice column: pick one of a fixed set of options. */
export interface ChoiceColumnDefinition extends AIColumnDefinitionBase {
    readonly primitive: "choice";
    /** 2 to 255 options by id. Ids are sent as Jev criteria keys. */
    readonly options: { readonly [optionId: string]: ChoiceOption };
    readonly policy?: ChoicePolicy;
    readonly output?: AIOutputBase<"choice">;
    readonly presentation?: ChoicePresentation;
}

/** A Score rubric level: a description (string, or an object such as `{ what, examples }`), optionally with a label and a stored value. */
export type ScoreLevel =
    string | { readonly description: string | AIJsonObject; readonly label?: string; readonly value?: unknown };

/** Score output settings. */
export interface ScoreOutput extends AIOutputBase<"score"> {
    /**
     * What to store. Default `"score"`.
     * - `score`: the score rounded to `precision`
     * - `level`: the level index
     * - `level-label`: the level's label (or its description, when it is a string)
     * - `level-value`: the level's `value` (every level needs one)
     * - a function of the raw answer
     */
    readonly store?: "score" | "level" | "level-label" | "level-value" | ((answer: ScoreAnswer) => unknown);
    /** How the level is picked. `nearest` rounds half up; `most-probable` takes the highest probability, ties to the lower level. Default `nearest`. */
    readonly levelFrom?: "nearest" | "most-probable";
    /** Decimals for `score` values. Default 2. */
    readonly precision?: number;
}

/** Score display options. */
export interface ScorePresentation {
    /** Show the model confidence, always labelled as model confidence. */
    readonly showConfidence?: boolean;
    /** Show a thin bar marking the score's position on the rubric. */
    readonly rubricBar?: boolean;
}

/** A Score column: a position on an ordered rubric. */
export interface ScoreColumnDefinition extends AIColumnDefinitionBase {
    readonly primitive: "score";
    /** 2 to 10 levels, lowest first. */
    readonly levels: readonly ScoreLevel[];
    readonly policy?: ScorePolicy;
    readonly output?: ScoreOutput;
    readonly presentation?: ScorePresentation;
}

/**
 * Noul bands for the `boolean` and `label` mappings. At or below
 * `falseAtOrBelow` is false, at or above `trueAtOrAbove` is true, and the
 * middle band is `review` or `withhold`.
 */
export interface NoulBands {
    readonly falseAtOrBelow: number;
    readonly trueAtOrAbove: number;
    readonly between: "review" | "withhold";
}

/** Noul labels. Defaults: `Yes`, `No` and `Uncertain`. */
export interface NoulLabels {
    readonly true?: string;
    readonly false?: string;
    readonly uncertain?: string;
}

/** Noul output settings. */
export interface NoulOutput extends AIOutputBase<"noul"> {
    /**
     * What to store. Default `"probability"`.
     * - `probability`: the raw probability, rounded to `precision`
     * - `boolean`: `true` or `false` by `bands`
     * - `label`: `labels.true` or `labels.false` by `bands`
     */
    readonly store?: "probability" | "boolean" | "label";
    /** Required for `boolean` and `label`. There are no default bands. */
    readonly bands?: NoulBands;
    readonly labels?: NoulLabels;
    /** Decimals for `probability` values. Default 2. */
    readonly precision?: number;
}

/** Noul display options. */
export interface NoulPresentation {
    /** Show a thin probability bar. */
    readonly probabilityBar?: boolean;
}

/** A Noul column: the probability that the answer to a yes/no question is yes. */
export interface NoulColumnDefinition extends AIColumnDefinitionBase {
    readonly primitive: "noul";
    /** What `true` and `false` mean. */
    readonly criteria?: { readonly true?: string | AIJsonObject; readonly false?: string | AIJsonObject };
    readonly policy?: NoulPolicy;
    readonly output?: NoulOutput;
    readonly presentation?: NoulPresentation;
}

/** An AI column definition, discriminated on `primitive`. */
export type AIColumnDefinition = ChoiceColumnDefinition | ScoreColumnDefinition | NoulColumnDefinition;

/** The column definition type for primitive `P`. */
export type AIColumnDefinitionFor<P extends JevPrimitive> = Extract<AIColumnDefinition, { readonly primitive: P }>;

// ---------------------------------------------------------------------------
// Built-in UI
// ---------------------------------------------------------------------------

/**
 * AI Fill's keyboard shortcuts, in the syntax of the grid's `keybindings`:
 * modifiers joined with `+` (`ctrl`, `shift`, `alt`, `meta`, and `primary`,
 * which is Cmd on macOS and Ctrl elsewhere), then the `KeyboardEvent.key`,
 * with `|` between alternatives. `false` turns one off.
 *
 * They go through `DataEditor`'s `onKeyDown`, after the app's handler: if the
 * app's handler calls `preventDefault()` or `cancel()`, AI Fill does nothing.
 * Each acts only when it has something to do, and otherwise leaves the key to
 * the grid.
 */
export interface AIFillShortcuts {
    /**
     * Opens the AI menu: the column menu when a whole AI column is selected,
     * otherwise the cell menu for the focused AI cell. Default `"shift+F10|ContextMenu"`.
     */
    readonly menu?: string | false;
    /** Opens the inspector for the focused cell when it holds a result. Default `"alt+ArrowDown"`. */
    readonly inspect?: string | false;
    /** Accepts the selected suggestions. Default `"primary+Enter"`. */
    readonly accept?: string | false;
    /** Rejects the selected `suggested`, `review`, `withheld` and `stale` results. Default `"primary+Backspace"`. */
    readonly reject?: string | false;
    /** Fills the AI cells in the selection. Default `"primary+alt+f"`. */
    readonly fill?: string | false;
}

// ---------------------------------------------------------------------------
// Grid-level configuration
// ---------------------------------------------------------------------------

/** AI Fill configuration for one grid. */
export interface AIFillConfig {
    readonly connection: AIFillConnection;
    /** The Jev model, for example `jev-latest`. Required; there is no hidden default. */
    readonly model: string;
    readonly rows: AIFillRows;
    /** The row state sent to Jev. Default: built from each column's `sources`. */
    readonly rowState?: (ctx: AIRowContext) => JevState;
    /** The rows column-wide fills cover. Without it, column-wide fills aren't offered. */
    readonly rowScope?: () => AIRowScope;
    /** AI column definitions, keyed by `GridColumn.id`. */
    readonly columns: { readonly [columnId: string]: AIColumnDefinition };
    readonly execution?: AIFillExecutionOptions;
    /**
     * The built-in menus on AI columns and cells:
     * - `"built-in"` (default): the header ▾, the cell context menu and the
     *   menu shortcut open AI Fill's menu. When the app has its own handler for
     *   that menu, the AI menu ends with "More options…", which calls it with
     *   the original arguments. Other columns and cells go straight to the app.
     * - `"compose"`: the built-in menu never opens and the app's handlers are
     *   always called. Put `api.getMenuItems(target)` in the app's own menu.
     * - `"off"`: no menus; only the API and the shortcuts.
     */
    readonly menus?: "built-in" | "compose" | "off";
    /**
     * Shows the built-in status bar over the bottom edge of the grid while a
     * run is in progress and after it ends. Default `true`. With `false`,
     * render `<AIFillStatus api={api} />` where you want it.
     */
    readonly statusBar?: boolean;
    /** Keyboard shortcuts. `false` turns all of them off. */
    readonly shortcuts?: AIFillShortcuts | false;
    readonly onRunStart?: (event: AIRunStartEvent) => void;
    readonly onRunProgress?: (event: AIRunProgressEvent) => void;
    readonly onRunEnd?: (summary: AIRunSummary) => void;
    /** Fires for every decided result, including withheld and review ones. */
    readonly onResult?: (event: AIResultEvent) => void;
    readonly onCommit?: (event: AICommitEvent) => void;
    readonly onReject?: (event: AIRejectEvent) => void;
    readonly onError?: (error: AIFillError) => void;
    /**
     * Called once, when AI Fill has loaded and its API exists. The same API is
     * `ref.current.aiFill` from then on.
     */
    readonly onReady?: (api: AIFillApi) => void;
}
