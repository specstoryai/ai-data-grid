import type * as React from "react";
import type { DataEditorProps, DataEditorRef } from "../../data-editor/data-editor.js";
import {
    CompactSelection,
    type EditableGridCell,
    type EditListItem,
    type GridCell,
    type GridColumn,
    type GridSelection,
    type Item,
    isReadWriteCell,
} from "../../internal/data-grid/data-grid-types.js";
import type { GridKeyEventArgs } from "../../internal/data-grid/event-args.js";
import type {
    AIActiveRun,
    AICellState,
    AIFillApi,
    AIFillRun,
    AIFillTarget,
    AIMenuItem,
    AIRunState,
} from "../config/api.js";
import type { AICellContext, AIColumnDefinition, AIFillConfig, AIFillMode, AIFillScope } from "../config/types.js";
import type { AIColumnId, AIFillError, AIRowId, AIRunSummary } from "../config/results.js";
import { canonicalJson } from "../identity/canonical-json.js";
import { questionFingerprint, resolveModel } from "../identity/fingerprints.js";
import { defaultToCell, isAIDestinationEmpty } from "../policy/cells.js";
import {
    applyValidation,
    cellData,
    checkCommitGuards,
    type CommitSource,
    sameCellData,
} from "../policy/commit-guards.js";
import { AIFillEngine, type AIFillPlan } from "../engine/engine.js";
import { buildState, rowContext } from "../engine/state.js";
import { type AICellRecord, type AICellRef, cellKey, isInFlight } from "../engine/store.js";
import type { AIFillBridge, AIFillComposedProps } from "./bridge.js";
import { drawAICell, drawAIHeaderBadge } from "./draw.js";
import { AIFillGridHost } from "./grid-host.js";

type Blocked = NonNullable<AICellState["blocked"]>;
type Status = AICellRecord["status"];

/** Results `reject` applies to. */
const rejectable: readonly Status[] = ["suggested", "review", "withheld", "stale"];
/** Results `accept` may write. */
const acceptable: readonly Status[] = ["suggested", "review"];
/** Results a user may replace with a value of their choosing ("Choose" in the inspector). */
const choosable: ReadonlySet<Status> = new Set(["suggested", "review", "withheld"]);
/** Results `clear` drops. In-flight cells keep waiting. */
const clearable: readonly Status[] = [
    "suggested",
    "review",
    "withheld",
    "error",
    "stale",
    "accepted",
    "applied",
    "rejected",
];
const typeMismatch = "type-mismatch";

interface CommitEdit extends AICellRef {
    readonly location: Item;
    readonly previous: GridCell;
    readonly next: EditableGridCell;
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

function hasSelection(selection: GridSelection | undefined): boolean {
    return (
        selection !== undefined &&
        (selection.current !== undefined || selection.rows.length > 0 || selection.columns.length > 0)
    );
}

/** A menu target: an AI column, or an AI cell and the selection around it. */
export type AIMenuTarget = Exclude<Parameters<AIFillApi["getMenuItems"]>[0], undefined>;

/** The props AI Fill composes, writable. */
export type AIFillComposedOut = { -readonly [K in keyof AIFillComposedProps]: AIFillComposedProps[K] };

/**
 * The built-in UI (`react/ui/`), plugged in by the controller. The session
 * calls it for the parts of the API and the composition that belong to it.
 */
export interface AIFillSessionUI {
    getMenuItems(target?: AIMenuTarget): AIMenuItem[];
    openMenu(target: AIMenuTarget): boolean;
    openInspector(cell: readonly [AIRowId, AIColumnId]): boolean;
    /** Adds the menu, click and class name wrappers to the composed props. */
    compose(p: AIFillComposedProps, out: AIFillComposedOut, memo: Memo): void;
    /** Handles an AI shortcut. Returns whether it did. */
    shortcut(event: GridKeyEventArgs): boolean;
}

/** One wrapper per app handler identity, so composed props keep their identity between renders. */
export class Memo {
    private readonly entries = new Map<string, { deps: readonly unknown[]; value: unknown }>();

    get<T>(key: string, deps: readonly unknown[], create: () => T): T {
        const entry = this.entries.get(key);
        if (entry !== undefined && entry.deps.length === deps.length && entry.deps.every((d, i) => d === deps[i])) {
            return entry.value as T;
        }
        const value = create();
        this.entries.set(key, { deps, value });
        return value;
    }
}

/**
 * Everything the lazily loaded controller does, without React: it owns the
 * engine, reads the grid through {@link AIFillGridHost}, composes the app's
 * props, commits results through the app's edit handlers, and repaints the
 * cells whose records change. The controller component only drives its
 * lifecycle (SPST-17, A1).
 */
export class AIFillSession {
    private props: AIFillComposedProps | undefined;
    private config: AIFillConfig | undefined;
    engine: AIFillEngine | undefined;
    private configured: { config: AIFillConfig; columns: readonly GridColumn[] } | undefined;
    private onBridge: ((bridge: AIFillBridge | undefined) => void) | undefined;
    private unsubscribe: (() => void) | undefined;
    readonly host = new AIFillGridHost(this.gridProps.bind(this), this.currentConfig.bind(this));
    private readonly memo = new Memo();
    private readonly wrapped = new WeakMap<AIFillConfig, AIFillConfig>();
    private readonly reportedIssues = new Set<string>();
    private readonly runs = new Map<string, { -readonly [K in keyof AIActiveRun]: AIActiveRun[K] }>();
    private lastRun: AIRunSummary | undefined;
    private readonly commits = new Map<string, readonly CommitEdit[]>();
    private readonly blocked = new Map<string, Blocked & { readonly requestSeq: number }>();
    private readonly inFlight = new Map<string, number>();
    private readonly repaint = new Map<string, AICellRef>();
    private readonly autoApply = new Map<string, AICellRef>();
    private flushQueued = false;
    private heldSelection: GridSelection = {
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: undefined,
    };
    /** The last selection the grid reported, when the app listens without controlling it. */
    private observedSelection: GridSelection | undefined;
    private reviewedCounter = 0;
    private ready = false;
    private readonly listeners = new Set<() => void>();
    /** Bumped on every change {@link subscribe} reports. */
    version = 0;
    /** The built-in UI. Set by the controller before the session attaches. */
    ui: AIFillSessionUI | undefined;

    readonly api: AIFillApi;

    constructor(readonly grid: React.RefObject<DataEditorRef | null>) {
        this.api = {
            fill: (scope, options) => this.fill(scope, options?.columns, options?.mode ?? "suggest"),
            cancel: runId => {
                // Results that already passed auto-apply are written first, so the summary counts them as applied.
                this.applyPending();
                this.engine?.cancel(runId);
            },
            accept: target => this.commit(this.acceptable(target), "accept"),
            reject: target => this.engine?.reject(this.rejectable(target)).length ?? 0,
            retry: target => this.rerun("error", target),
            rerunStale: target => this.rerun("stale", target),
            revertCommit: commitId => this.revert(commitId),
            getCellState: (rowId, columnId) => this.cellState(rowId, columnId),
            getRunState: () => this.runState(),
            notifyRowsChanged: rowIds => {
                this.host.invalidate();
                this.engine?.notifyRowsChanged(rowIds);
            },
            clear: target => this.clear(target),
            getMenuItems: target => this.ui?.getMenuItems(target) ?? [],
            openMenu: target => this.ui?.openMenu(target) ?? false,
            openInspector: cell => this.ui?.openInspector(cell) ?? false,
            subscribe: listener => this.subscribe(listener),
        };
    }

    /** Calls `listener` after every change to a run, a record or the built-in UI. */
    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** Reports a change to {@link subscribe}rs. */
    changed(): void {
        this.version++;
        for (const listener of this.listeners) notify(listener, undefined);
    }

    /** Records the latest props and configuration. Called while rendering. */
    update(props: AIFillComposedProps, config: AIFillConfig): void {
        this.props = props;
        this.config = config;
    }

    /** Starts the engine and hands `DataEditor` the bridge. */
    attach(onBridge: (bridge: AIFillBridge | undefined) => void): void {
        const config = this.currentConfig();
        const columns = this.gridProps().columns;
        this.onBridge = onBridge;
        this.engine = new AIFillEngine({ config: this.wrap(config), host: this.host, columns });
        this.configured = { config, columns };
        this.unsubscribe = this.engine.subscribe(changes => this.onRecordsChanged(changes));
        this.reportIssues(config);
        this.publish();
        if (!this.ready) {
            this.ready = true;
            notify(config.onReady, this.api);
        }
    }

    /** Stops the engine: in-flight requests are aborted and every result is dropped. */
    detach(): void {
        this.unsubscribe?.();
        this.engine?.dispose();
        this.engine = undefined;
        this.configured = undefined;
        this.runs.clear();
        this.inFlight.clear();
        this.blocked.clear();
        this.commits.clear();
        const onBridge = this.onBridge;
        this.onBridge = undefined;
        onBridge?.(undefined);
    }

    /** Applies a new configuration or column set to the running engine. */
    configure(config: AIFillConfig, columns: readonly GridColumn[]): void {
        const engine = this.engine;
        if (engine === undefined) return;
        if (this.configured?.config === config && this.configured.columns === columns) return;
        this.configured = { config, columns };
        engine.setConfig(this.wrap(config), columns);
        this.reportIssues(config);
    }

    // -----------------------------------------------------------------------
    // Composition
    // -----------------------------------------------------------------------

    /** Composes the app's props with AI Fill's (the A1 table). Plain function, called during render. */
    readonly compose = <P extends AIFillComposedProps>(p: P, config: AIFillConfig): P => {
        this.update(p, config);
        const aiColumns = config.columns;
        const out: { -readonly [K in keyof AIFillComposedProps]: AIFillComposedProps[K] } = {
            ...p,
            columns: this.memo.get("columns", [p.columns, aiColumns], () =>
                p.columns.map(column =>
                    column.id !== undefined && hasOwn(aiColumns, column.id) && column.hasMenu !== true
                        ? { ...column, hasMenu: true }
                        : column
                )
            ),
            drawCell: this.memo.get("drawCell", [p.drawCell], () => this.drawCell(p.drawCell)),
            drawHeader: this.memo.get("drawHeader", [p.drawHeader], () => this.drawHeader(p.drawHeader)),
            onCellsEdited: this.memo.get("onCellsEdited", [p.onCellsEdited], () => this.onCellsEdited(p.onCellsEdited)),
            onKeyDown: this.memo.get("onKeyDown", [p.onKeyDown], () => this.onKeyDown(p.onKeyDown)),
        };
        this.ui?.compose(p, out, this.memo);
        if (p.onCellEdited !== undefined) {
            const app = p.onCellEdited;
            out.onCellEdited = this.memo.get("onCellEdited", [app], () => this.onCellEdited(app));
        }
        if (p.gridSelection === undefined) {
            const app = p.onGridSelectionChange;
            if (app === undefined) {
                out.gridSelection = this.heldSelection;
                out.onGridSelectionChange = this.holdSelection;
            } else {
                out.onGridSelectionChange = this.memo.get("onGridSelectionChange", [app], () =>
                    this.observeSelection(app)
                );
            }
        }
        return { ...p, ...out };
    };

    /** The grid holds the selection and reports changes: observe them, then forward. */
    private observeSelection(app: (selection: GridSelection) => void): (selection: GridSelection) => void {
        return selection => {
            this.observedSelection = selection;
            app(selection);
            this.changed();
        };
    }

    private readonly holdSelection = (selection: GridSelection): void => {
        this.heldSelection = selection;
        this.publish();
        this.changed();
    };

    /** Observes the edit, then forwards the same arguments and returns the app's value. */
    private onCellsEdited(app: DataEditorProps["onCellsEdited"]): NonNullable<DataEditorProps["onCellsEdited"]> {
        return items => {
            this.observe(items.map(item => item.location));
            return app?.(items);
        };
    }

    private onCellEdited(
        app: NonNullable<DataEditorProps["onCellEdited"]>
    ): NonNullable<DataEditorProps["onCellEdited"]> {
        return (cell, value) => {
            this.observe([cell]);
            app(cell, value);
        };
    }

    private drawCell(app: DataEditorProps["drawCell"]): NonNullable<DataEditorProps["drawCell"]> {
        return (args, drawContent) => {
            const content = app === undefined ? drawContent : () => app(args, drawContent);
            const columnId = this.gridProps().columns[args.col]?.id;
            const definition = columnId === undefined ? undefined : this.definition(columnId);
            const record =
                definition === undefined || columnId === undefined || args.row >= this.gridProps().rows
                    ? undefined
                    : this.engine?.getRecord(this.host.rowId(args.row), columnId);
            if (record === undefined || definition === undefined) {
                content();
                return;
            }
            drawAICell(args, content, record, definition, (definition.isEmpty ?? isAIDestinationEmpty)(args.cell));
        };
    }

    private drawHeader(app: DataEditorProps["drawHeader"]): NonNullable<DataEditorProps["drawHeader"]> {
        return (args, drawContent) => {
            if (app === undefined) drawContent();
            else app(args, drawContent);
            const columnId = args.column.id;
            if (columnId !== undefined && this.definition(columnId) !== undefined) {
                drawAIHeaderBadge(args.ctx, args.rect, args.menuBounds, args.theme);
            }
        };
    }

    /** The app's handler runs first. If it prevented the default or cancelled, AI Fill does nothing. */
    private onKeyDown(app: DataEditorProps["onKeyDown"]): NonNullable<DataEditorProps["onKeyDown"]> {
        return event => {
            let handled = false;
            app?.({
                ...event,
                preventDefault: () => {
                    handled = true;
                    event.preventDefault();
                },
                cancel: () => {
                    handled = true;
                    event.cancel();
                },
            });
            if (handled || this.ui?.shortcut(event) !== true) return;
            event.cancel();
            event.preventDefault();
            event.stopPropagation();
        };
    }

    /** Edits made in the grid: an edited AI cell becomes manual, and results whose sources were edited become stale. */
    private observe(locations: readonly Item[]): void {
        const engine = this.engine;
        if (engine === undefined) return;
        const { columns, rows } = this.gridProps();
        const refs: AICellRef[] = [];
        for (const [col, row] of locations) {
            const columnId = columns[col]?.id;
            if (columnId !== undefined && row >= 0 && row < rows) refs.push({ rowId: this.host.rowId(row), columnId });
        }
        this.host.invalidate();
        engine.markEdited(refs);
    }

    // -----------------------------------------------------------------------
    // Fills
    // -----------------------------------------------------------------------

    fill(scope: AIFillScope, only: readonly AIColumnId[] | undefined, mode: AIFillMode): AIFillRun {
        return this.start(this.planFill(scope, only, mode));
    }

    /** Works out what a fill would do, without starting it. */
    planFill(scope: AIFillScope, only: readonly AIColumnId[] | undefined, mode: AIFillMode): AIFillPlan | undefined {
        this.host.invalidate();
        const config = this.currentConfig();
        let cells: [AIRowId, AIColumnId][] = [];
        let error: AIFillError | undefined;
        if (scope === "selection" || scope === "selection-empty") {
            cells = this.selectionCells(only);
        } else {
            const rowScope = config.rowScope?.();
            if (rowScope === undefined) {
                error = {
                    kind: "configuration",
                    message: `A "${scope}" fill needs aiFill.rowScope, which names the rows a column-wide fill covers`,
                    retryable: false,
                };
            } else {
                const rowIds =
                    rowScope.rows === "displayed"
                        ? Array.from({ length: this.gridProps().rows }, (_, row) => this.host.rowId(row))
                        : rowScope.rows;
                const columnIds = this.aiColumnIds(only);
                cells = rowIds.flatMap(rowId => columnIds.map(columnId => [rowId, columnId] as [AIRowId, AIColumnId]));
            }
        }
        return error === undefined
            ? this.engine?.plan({ cells, scope, mode })
            : { scope, mode, cells: [], failed: [], skipped: {}, columnIds: [], requests: 0, error };
    }

    /** Evaluates these cells again, with the scope their results had. For rejected results, which `retry` and `rerunStale` don't cover. */
    refill(refs: readonly AICellRef[]): AIFillRun {
        this.host.invalidate();
        const record = refs.length === 0 ? undefined : this.engine?.getRecord(refs[0].rowId, refs[0].columnId);
        return this.start(
            this.engine?.plan({
                cells: refs.map(ref => [ref.rowId, ref.columnId] as const),
                scope: record?.scope ?? "selection",
            })
        );
    }

    rerun(status: "error" | "stale", target: AIFillTarget | undefined): AIFillRun {
        return this.start(this.planRerun(status, target));
    }

    /** Works out what `retry` (`error`) or `rerunStale` (`stale`) would do, without starting it. */
    planRerun(status: "error" | "stale", target: AIFillTarget | undefined): AIFillPlan | undefined {
        this.host.invalidate();
        const refs = target === undefined ? undefined : this.resolve(target, [status]);
        return this.engine?.planRerun(status, refs);
    }

    private start(plan: AIFillPlan | undefined): AIFillRun {
        const engine = this.engine;
        if (engine === undefined || plan === undefined) {
            const error: AIFillError = { kind: "configuration", message: "AI Fill isn't running", retryable: false };
            return {
                runId: "",
                done: Promise.resolve({ runId: "", cancelled: true, counts: {}, skipped: {} }),
                cells: 0,
                requests: 0,
                skipped: {},
                error,
            };
        }
        const { runId, done } = engine.run(plan);
        return {
            runId,
            done,
            cells: plan.error === undefined ? plan.cells.length + plan.failed.length : 0,
            requests: plan.error === undefined ? plan.requests : 0,
            skipped: plan.skipped,
            ...(plan.error === undefined ? {} : { error: plan.error }),
        };
    }

    /** The AI columns in the grid, in display order, optionally limited to `only`. */
    aiColumnIds(only: readonly AIColumnId[] | undefined): AIColumnId[] {
        const ids: AIColumnId[] = [];
        for (const column of this.gridProps().columns) {
            const id = column.id;
            if (
                id !== undefined &&
                this.definition(id) !== undefined &&
                (only === undefined || only.includes(id)) &&
                !ids.includes(id)
            ) {
                ids.push(id);
            }
        }
        return ids;
    }

    /**
     * The grid's selection now: the app's when it controls it, the last one the
     * grid reported when the app only listens, otherwise the one AI Fill holds.
     */
    selection(): GridSelection | undefined {
        const p = this.gridProps();
        if (p.gridSelection !== undefined) return p.gridSelection;
        return p.onGridSelectionChange === undefined ? this.heldSelection : this.observedSelection;
    }

    /** The AI cells in the selection, as `[rowId, columnId]`, in display order. */
    selectionCells(only: readonly AIColumnId[] | undefined): [AIRowId, AIColumnId][] {
        const selection = this.selection();
        if (selection === undefined) return [];
        const { columns, rows } = this.gridProps();
        const allowed = new Set(this.aiColumnIds(only));
        const aiCols = columns.flatMap((column, col) =>
            column.id !== undefined && allowed.has(column.id) ? [col] : []
        );
        const seen = new Set<string>();
        const cells: [AIRowId, AIColumnId][] = [];
        const add = (col: number, row: number) => {
            const columnId = columns[col]?.id;
            if (columnId === undefined || !allowed.has(columnId) || row < 0 || row >= rows) return;
            const rowId = this.host.rowId(row);
            const key = cellKey(rowId, columnId);
            if (seen.has(key)) return;
            seen.add(key);
            cells.push([rowId, columnId]);
        };
        for (const col of selection.columns.toArray()) for (let row = 0; row < rows; row++) add(col, row);
        for (const row of selection.rows.toArray()) for (const col of aiCols) add(col, row);
        const current = selection.current;
        if (current !== undefined) {
            for (const range of [current.range, ...current.rangeStack]) {
                for (let row = range.y; row < range.y + range.height; row++) {
                    for (const col of aiCols) if (col >= range.x && col < range.x + range.width) add(col, row);
                }
            }
        }
        return cells;
    }

    /**
     * The cells of a target whose record has one of `statuses`, the statuses
     * the calling method acts on. A column target's filter narrows them:
     * `all` keeps them all, `eligible` keeps only `suggested` and `review`
     * only `review`.
     */
    resolve(target: AIFillTarget, statuses: readonly Status[]): AICellRef[] {
        const engine = this.engine;
        if (engine === undefined) return [];
        let refs: AICellRef[];
        let wanted = statuses;
        if ("column" in target) {
            if (target.filter !== "all") {
                const only: Status = target.filter === "eligible" ? "suggested" : "review";
                wanted = statuses.filter(status => status === only);
            }
            refs = engine.store.all().filter(record => record.columnId === target.column);
        } else {
            const cells = "cells" in target ? target.cells : this.selectionCells(undefined);
            refs = cells.map(([rowId, columnId]) => ({ rowId, columnId }));
        }
        return refs.filter(ref => {
            const status = engine.getRecord(ref.rowId, ref.columnId)?.status;
            return status !== undefined && wanted.includes(status);
        });
    }

    /** The results in a target that `reject` covers: suggested, review, withheld and stale. */
    rejectable(target: AIFillTarget): AICellRef[] {
        return this.resolve(target, rejectable);
    }

    /**
     * The results in a target that `accept` may write: `suggested` and
     * `review`, filtered by a column target's filter. A column target covers
     * only displayed rows, so a filtered-out row keeps its result for when it
     * comes back.
     */
    acceptable(target: AIFillTarget): AICellRef[] {
        const refs = this.resolve(target, acceptable);
        if (!("column" in target)) return refs;
        this.host.invalidate();
        return refs.filter(ref => this.host.rowIndex(ref.rowId) !== undefined);
    }

    private clear(target: AIFillTarget | undefined): void {
        const engine = this.engine;
        if (engine === undefined) return;
        if (target === undefined) {
            engine.cancel();
            engine.store.remove(() => true);
            return;
        }
        const keys = new Set(this.resolve(target, clearable).map(ref => cellKey(ref.rowId, ref.columnId)));
        engine.store.remove(record => keys.has(cellKey(record.rowId, record.columnId)) && !isInFlight(record));
    }

    // -----------------------------------------------------------------------
    // Commits
    // -----------------------------------------------------------------------

    /**
     * The commit path (SPST-17 §8.6 and A5). Every guard is checked again now:
     * the row still exists, the inputs and the destination are unchanged, the
     * cell is writable, the overwrite policy allows it and `validateCell`
     * passes (a coerced cell is used). The writes then go out as one batch, the
     * way core's paste does: one `onCellsEdited(items)`, and unless it returns
     * `true`, one `onCellEdited` per item in the same tick. If the grid has no
     * selection, one covering the written cells is set first, so `useUndoRedo`
     * records the batch as one step.
     */
    commit(refs: readonly AICellRef[], source: CommitSource, chosen?: { readonly value: unknown }): string | undefined {
        const engine = this.engine;
        if (engine === undefined || refs.length === 0) return undefined;
        const config = this.currentConfig();
        const p = this.gridProps();
        this.host.invalidate();
        const edits: CommitEdit[] = [];
        const reviewed: AICellRef[] = [];
        const blocked: (AICellRef & Blocked)[] = [];
        for (const ref of refs) {
            const record = engine.getRecord(ref.rowId, ref.columnId);
            const definition = this.definition(ref.columnId);
            if (record === undefined || definition === undefined) continue;
            if (chosen === undefined) {
                if (record.output === undefined) continue;
                if (record.status !== "suggested" && record.status !== "review") continue;
                if (!record.output.hasValue) {
                    if (source !== "auto-apply") reviewed.push(ref);
                    continue;
                }
            } else if (!choosable.has(record.status)) {
                continue;
            }
            const edit = this.prepare(record, definition, source, p.validateCell, chosen);
            if ("reason" in edit) {
                blocked.push({ ...ref, ...edit });
                this.block(record, edit);
            } else {
                edits.push(edit);
            }
        }
        if (reviewed.length > 0) engine.store.commit(reviewed, `reviewed-${++this.reviewedCounter}`, "accepted");
        this.reportBlocked(config, blocked);
        if (edits.length === 0) return undefined;

        this.ensureSelection(edits.map(edit => edit.location));
        const result = engine.recordCommit({ source, edits });
        if (result.commitId === undefined) return undefined;
        const committed = new Set(result.committed.map(ref => cellKey(ref.rowId, ref.columnId)));
        const written = edits.filter(edit => committed.has(cellKey(edit.rowId, edit.columnId)));
        this.write(written.map(edit => ({ location: edit.location, value: edit.next })));
        this.commits.set(result.commitId, written);
        this.sourcesChanged(written);
        return result.commitId;
    }

    /** Checks one result against every commit guard, and builds the cell to write. */
    private prepare(
        record: AICellRecord,
        definition: AIColumnDefinition,
        source: CommitSource,
        validateCell: DataEditorProps["validateCell"],
        chosen: { readonly value: unknown } | undefined
    ): CommitEdit | Blocked {
        const p = this.gridProps();
        if (p.onCellsEdited === undefined && p.onCellEdited === undefined) {
            return { reason: "read-only", message: "the grid has no onCellEdited or onCellsEdited handler" };
        }
        const config = this.currentConfig();
        const read = this.host.readCell(record.rowId, record.columnId, definition.sources ?? []);
        const location = read === undefined ? undefined : this.host.locate(record.rowId, record.columnId);
        if (read === undefined || location === undefined) {
            this.engine?.notifyRowsChanged([record.rowId]);
            return { reason: "row-missing", message: "the row no longer exists" };
        }
        const current = read.destination;
        const ctx: AICellContext = {
            rowId: record.rowId,
            columnId: record.columnId,
            row: read.row,
            ...(record.state === undefined ? {} : { state: record.state }),
            destination: current,
        };
        let next: EditableGridCell | undefined;
        let inputFingerprint = "";
        try {
            next = (definition.output?.toCell ?? defaultToCell)((chosen ?? record.output)?.value, current, ctx);
            inputFingerprint = canonicalJson(
                buildState(config, definition, rowContext(record.rowId, record.columnId, read))
            );
        } catch {
            // A throwing accessor can't confirm the input or the cell, so the result isn't written.
        }
        if (next === undefined) {
            return { reason: typeMismatch, message: "the value doesn't fit the destination cell" };
        }
        const guard = checkCommitGuards({
            alreadyCommitted: record.commitId !== undefined,
            location,
            current,
            next,
            expected: record.identity,
            actual: {
                questionFingerprint: questionFingerprint(definition),
                inputFingerprint,
                model: resolveModel(config, definition),
            },
            destinationSnapshot: record.destinationSnapshot,
            overwrite: {
                overwrite: definition.overwrite ?? "never",
                destinationEmpty: (definition.isEmpty ?? isAIDestinationEmpty)(current),
                source,
                scope: record.scope,
            },
            ...(validateCell === undefined ? {} : { validateCell }),
        });
        if (!guard.ok) {
            if (guard.reason === "stale") this.engine?.store.markSourceChanged(record);
            else if (guard.reason === "destination-changed") this.engine?.store.markDestinationEdited(record);
            return { reason: guard.reason, message: guard.message };
        }
        return {
            rowId: record.rowId,
            columnId: record.columnId,
            location: guard.location,
            previous: current,
            next: guard.cell,
        };
    }

    private block(record: AICellRecord, blocked: Blocked): void {
        const current = this.engine?.getRecord(record.rowId, record.columnId) ?? record;
        this.blocked.set(cellKey(record.rowId, record.columnId), { ...blocked, requestSeq: current.requestSeq });
        this.queueRepaint([record]);
    }

    /** One `onError` per reason: `type-mismatch` for a value that doesn't fit, `commit-blocked` for the rest. */
    private reportBlocked(config: AIFillConfig, blocked: readonly (AICellRef & Blocked)[]): void {
        const byReason = new Map<Blocked["reason"], (AICellRef & Blocked)[]>();
        for (const cell of blocked) byReason.set(cell.reason, [...(byReason.get(cell.reason) ?? []), cell]);
        for (const [reason, cells] of byReason) {
            notify(config.onError, {
                kind: reason === typeMismatch ? typeMismatch : "commit-blocked",
                message: `${cells.length} result(s) weren't written: ${cells[0].message}`,
                retryable: false,
                cells: cells.map(cell => [cell.rowId, cell.columnId] as const),
            });
        }
    }

    /** Sets a selection covering `locations` when the grid has none, so `useUndoRedo` records the edits. */
    private ensureSelection(locations: readonly Item[]): void {
        if (hasSelection(this.selection())) return;
        const xs = locations.map(([col]) => col);
        const ys = locations.map(([, row]) => row);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const selection: GridSelection = {
            columns: CompactSelection.empty(),
            rows: CompactSelection.empty(),
            current: {
                cell: locations[0],
                range: { x, y, width: Math.max(...xs) - x + 1, height: Math.max(...ys) - y + 1 },
                rangeStack: [],
            },
        };
        this.select(selection);
    }

    /**
     * Sets the grid's selection through the composed `onGridSelectionChange`:
     * AI Fill holds it when the app doesn't, and asks the app when it does.
     */
    select(selection: GridSelection): void {
        const p = this.gridProps();
        if (p.onGridSelectionChange !== undefined) {
            if (p.gridSelection === undefined) this.observedSelection = selection;
            p.onGridSelectionChange(selection);
        } else if (p.gridSelection === undefined) {
            this.holdSelection(selection);
        }
    }

    /** One batch through the app's handlers, the same contract core's paste uses. */
    private write(items: readonly EditListItem[]): void {
        const p = this.gridProps();
        if (p.onCellsEdited?.(items) !== true) {
            for (const item of items) p.onCellEdited?.(item.location, item.value);
        }
        this.host.invalidate();
        this.grid.current?.updateCells(items.map(item => ({ cell: item.location })));
    }

    /** Results whose sources include a written AI cell become stale, as they would after an edit in the grid. */
    private sourcesChanged(written: readonly AICellRef[]): void {
        const engine = this.engine;
        if (engine === undefined) return;
        for (const [columnId, definition] of Object.entries(this.currentConfig().columns)) {
            for (const edit of written) {
                if ((definition.sources ?? []).includes(edit.columnId)) {
                    engine.store.markSourceChanged({ rowId: edit.rowId, columnId });
                }
            }
        }
    }

    /**
     * Writes a commit's previous values back by row id, through the same batch
     * path. A cell whose value isn't the committed one anymore (a newer edit),
     * whose row is gone, that is read-only now, or that `validateCell` rejects
     * is left alone.
     */
    private revert(commitId: string): number {
        const edits = this.commits.get(commitId);
        if (edits === undefined || this.engine === undefined) return 0;
        this.host.invalidate();
        const p = this.gridProps();
        const items: EditListItem[] = [];
        const restored: AICellRef[] = [];
        for (const edit of edits) {
            const location = this.host.locate(edit.rowId, edit.columnId);
            if (location === undefined) continue;
            const current = p.getCellContent(location);
            if (!sameCellData(cellData(edit.next), cellData(current)) || !isReadWriteCell(current)) continue;
            if (!isReadWriteCell(edit.previous)) continue;
            const validated =
                p.validateCell === undefined
                    ? ({ ok: true, cell: edit.previous } as const)
                    : applyValidation(edit.previous, p.validateCell(location, edit.previous, current));
            if (!validated.ok) continue;
            items.push({ location, value: validated.cell });
            restored.push(edit);
        }
        if (items.length === 0) return 0;
        this.commits.delete(commitId);
        this.ensureSelection(items.map(item => item.location));
        this.write(items);
        this.sourcesChanged(restored);
        return items.length;
    }

    // -----------------------------------------------------------------------
    // Records, repaints and auto-apply
    // -----------------------------------------------------------------------

    private onRecordsChanged(changes: readonly AICellRef[]): void {
        const engine = this.engine;
        if (engine === undefined) return;
        for (const ref of changes) {
            const key = cellKey(ref.rowId, ref.columnId);
            const record = engine.getRecord(ref.rowId, ref.columnId);
            const settledSeq = this.inFlight.get(key);
            if (record !== undefined && isInFlight(record)) {
                this.inFlight.set(key, record.requestSeq);
            } else {
                this.inFlight.delete(key);
                // Only a result that just settled from its own request can auto-apply, never a re-evaluated one.
                if (
                    record !== undefined &&
                    settledSeq === record.requestSeq &&
                    record.status === "suggested" &&
                    record.mode === "apply" &&
                    record.decision?.status === "apply-candidate" &&
                    record.manual !== true &&
                    record.commitId === undefined
                ) {
                    this.autoApply.set(key, ref);
                }
            }
        }
        this.queueRepaint(changes);
    }

    private queueRepaint(refs: readonly AICellRef[]): void {
        for (const ref of refs) this.repaint.set(cellKey(ref.rowId, ref.columnId), ref);
        if (this.flushQueued) return;
        this.flushQueued = true;
        queueMicrotask(() => this.flush());
    }

    /** Writes the results queued for auto-apply. */
    private applyPending(): void {
        if (this.engine === undefined || this.autoApply.size === 0) return;
        const apply = [...this.autoApply.values()];
        this.autoApply.clear();
        this.commit(apply, "auto-apply");
    }

    private flush(): void {
        this.flushQueued = false;
        if (this.engine === undefined) return;
        this.applyPending();
        const cells: { cell: Item }[] = [];
        for (const ref of this.repaint.values()) {
            const location = this.host.locate(ref.rowId, ref.columnId);
            if (location !== undefined) cells.push({ cell: location });
        }
        this.repaint.clear();
        if (cells.length > 0) this.grid.current?.updateCells(cells);
        this.changed();
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    cellState(rowId: AIRowId, columnId: AIColumnId): AICellState | undefined {
        const engine = this.engine;
        const record = engine?.getRecord(rowId, columnId);
        if (engine === undefined || record === undefined) return undefined;
        const blocked = this.blocked.get(cellKey(rowId, columnId));
        return {
            rowId,
            columnId,
            status: record.status,
            ...(record.decision === undefined ? {} : { decision: record.decision }),
            ...(record.output === undefined ? {} : { output: record.output }),
            ...(record.error === undefined ? {} : { error: record.error }),
            ...(record.commitId === undefined ? {} : { commitId: record.commitId }),
            manual: record.manual === true,
            ...(blocked === undefined || blocked.requestSeq !== record.requestSeq || record.commitId !== undefined
                ? {}
                : { blocked: { reason: blocked.reason, message: blocked.message } }),
            metadata: engine.metadata(record),
        };
    }

    runState(): AIRunState {
        const cells: { [S in AICellRecord["status"]]?: number } = {};
        for (const record of this.engine?.store.all() ?? []) cells[record.status] = (cells[record.status] ?? 0) + 1;
        return {
            active: [...this.runs.values()].map(run => ({ ...run })),
            ...(this.lastRun === undefined ? {} : { last: this.lastRun }),
            cells,
            issues: this.engine?.issues ?? [],
        };
    }

    private reportIssues(config: AIFillConfig): void {
        for (const issue of this.engine?.issues ?? []) {
            const key = `${issue.columnId ?? ""}\u0000${issue.path}\u0000${issue.message}`;
            if (this.reportedIssues.has(key)) continue;
            this.reportedIssues.add(key);
            notify(config.onError, {
                kind: "configuration",
                message: [issue.path, issue.message].filter(part => part !== "").join(" "),
                retryable: false,
                ...(issue.columnId === undefined ? {} : { columnId: issue.columnId }),
            });
        }
    }

    /** The configuration the engine runs with: the app's, with the run callbacks observed for {@link runState}. */
    private wrap(config: AIFillConfig): AIFillConfig {
        let wrapped = this.wrapped.get(config);
        if (wrapped === undefined) {
            wrapped = {
                ...config,
                onRunStart: event => {
                    this.runs.set(event.runId, {
                        runId: event.runId,
                        columnIds: event.columnIds,
                        columnTitles: event.columnIds.map(id => this.columnTitle(id)),
                        total: event.cells,
                        done: 0,
                        apply: event.apply,
                    });
                    config.onRunStart?.(event);
                    this.changed();
                },
                onRunProgress: event => {
                    const run = this.runs.get(event.runId);
                    if (run !== undefined) run.done = event.done;
                    config.onRunProgress?.(event);
                    this.changed();
                },
                onRunEnd: summary => {
                    this.runs.delete(summary.runId);
                    this.lastRun = summary;
                    config.onRunEnd?.(summary);
                    this.changed();
                },
            };
            this.wrapped.set(config, wrapped);
        }
        return wrapped;
    }

    private publish(): void {
        this.onBridge?.({ api: this.api, compose: this.compose });
        this.changed();
    }

    /** A column's title in the grid, or its id when the grid has no such column. */
    columnTitle(columnId: AIColumnId): string {
        const col = this.host.colIndex(columnId);
        return (col === undefined ? undefined : this.gridProps().columns[col]?.title) ?? columnId;
    }

    definition(columnId: AIColumnId): AIColumnDefinition | undefined {
        const columns = this.currentConfig().columns;
        return hasOwn(columns, columnId) ? columns[columnId] : undefined;
    }

    gridProps(): AIFillComposedProps {
        if (this.props === undefined) throw new Error("AI Fill: the controller has no props yet");
        return this.props;
    }

    currentConfig(): AIFillConfig {
        if (this.config === undefined) throw new Error("AI Fill: the controller has no configuration yet");
        return this.config;
    }
}
