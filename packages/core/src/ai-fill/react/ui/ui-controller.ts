import { isHotkey } from "../../../common/is-hotkey.js";
import type { DataEditorProps } from "../../../data-editor/data-editor.js";
import {
    CompactSelection,
    type GridSelection,
    type Item,
    type Rectangle,
} from "../../../internal/data-grid/data-grid-types.js";
import type { GridKeyEventArgs } from "../../../internal/data-grid/event-args.js";
import type { AIMenuItem } from "../../config/api.js";
import type { AIColumnDefinition, AIFillMode, AIFillScope, AIFillShortcuts } from "../../config/types.js";
import type { AIColumnId, AIRowId, AISkipReason } from "../../config/results.js";
import type { AIFillPlan } from "../../engine/engine.js";
import type { AICellRef } from "../../engine/store.js";
import type { AIFillComposedProps } from "../bridge.js";
import type { AIFillComposedOut, AIFillSession, AIFillSessionUI, AIMenuTarget, Memo } from "../session.js";
import type { AIAnchor } from "./popup.js";

/** A fill waiting for the user to confirm its scope statement (SPST-17 §8.2). */
export interface AIFillRequest {
    readonly scope: AIFillScope;
    readonly columns: readonly AIColumnId[] | undefined;
    readonly mode: AIFillMode;
    readonly plan: AIFillPlan;
}

/** The built-in popup that is open. Only one is open at a time. */
export type AIPopupState =
    | {
          readonly kind: "menu";
          readonly target: AIMenuTarget;
          readonly anchor: AIAnchor;
          /** Calls the app's own handler with the original arguments ("More options…"). */
          readonly more: (() => void) | undefined;
      }
    | { readonly kind: "confirm"; readonly request: AIFillRequest }
    | { readonly kind: "inspector"; readonly rowId: AIRowId; readonly columnId: AIColumnId; readonly anchor: AIAnchor };

/** The default shortcuts (SPST-17 §8.1). */
const defaultShortcuts: Required<AIFillShortcuts> = {
    menu: "shift+F10|ContextMenu",
    inspect: "alt+ArrowDown",
    accept: "primary+Enter",
    reject: "primary+Backspace",
    fill: "primary+alt+f",
};

/** How a skip reason reads in the scope statement. */
export const skipLabels: Record<AISkipReason, string> = {
    populated: "already have a value",
    "read-only": "read-only",
    unloaded: "not loaded yet",
    "not-applicable": "not applicable",
    "missing-input": "missing input",
    cached: "already have a result for the same input",
};

const suggestions: readonly ("suggested" | "review")[] = ["suggested", "review"];
const columnEmpty = "column-empty";
/** A column's fill scopes when it doesn't list them. */
const defaultScopes: readonly AIFillScope[] = ["selection", "selection-empty", columnEmpty];

let gridCounter = 0;

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function cellSelection([col, row]: Item): GridSelection {
    return {
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: { cell: [col, row], range: { x: col, y: row, width: 1, height: 1 }, rangeStack: [] },
    };
}

function below(bounds: Rectangle): AIAnchor {
    return { x: bounds.x, y: bounds.y + bounds.height };
}

/** Whether a column's policy has an `autoApply` gate, which is what makes "Fill and apply" available. */
function hasAutoApply(definition: AIColumnDefinition | undefined): boolean {
    return definition?.policy?.autoApply !== undefined;
}

/**
 * AI Fill's built-in UI: the column and cell menus and how they coexist with
 * the app's, the scope confirmation, the inspector's actions, "Review next"
 * and the keyboard shortcuts (SPST-17 §8). It holds which popup is open; the
 * React components in this folder render it.
 */
export class AIFillUI implements AIFillSessionUI {
    popup: AIPopupState | undefined;
    /** The latest action result, for screen readers. */
    announcement = "";
    /** A class name unique to this grid, so the status bar can find the grid's element. */
    readonly gridClass = `gdg-ai-grid-${++gridCounter}`;

    constructor(readonly session: AIFillSession) {}

    private get mode(): "built-in" | "compose" | "off" {
        return this.session.currentConfig().menus ?? "built-in";
    }

    /** The grid's own element, found by {@link gridClass}. */
    gridElement(): HTMLElement | null {
        return document.querySelector<HTMLElement>(`.${this.gridClass}`);
    }

    /** The element popups portal into: `portalElementRef ?? #portal`. */
    portal(): HTMLElement | null {
        return this.session.gridProps().portalElementRef?.current ?? document.getElementById("portal");
    }

    setPopup(popup: AIPopupState | undefined): void {
        this.popup = popup;
        this.session.changed();
    }

    /** Closes the open popup, and returns focus to the grid unless the user moved it elsewhere. */
    close(focusGrid: boolean): void {
        this.setPopup(undefined);
        if (focusGrid) this.session.grid.current?.focus();
    }

    announce(text: string): void {
        this.announcement = text;
        this.session.changed();
    }

    // -----------------------------------------------------------------------
    // Composition (SPST-17 A1 and §8.1)
    // -----------------------------------------------------------------------

    compose(p: AIFillComposedProps, out: AIFillComposedOut, memo: Memo): void {
        out.className = memo.get("className", [p.className], () =>
            [p.className, "gdg-ai-grid", this.gridClass].filter(part => part !== undefined && part !== "").join(" ")
        );
        out.onCellClicked = memo.get("onCellClicked", [p.onCellClicked], () => this.onCellClicked(p.onCellClicked));
        if (this.mode !== "built-in") return;
        out.onHeaderMenuClick = memo.get("onHeaderMenuClick", [p.onHeaderMenuClick], () =>
            this.onHeaderMenuClick(p.onHeaderMenuClick)
        );
        out.onHeaderContextMenu = memo.get("onHeaderContextMenu", [p.onHeaderContextMenu], () =>
            this.onHeaderContextMenu(p.onHeaderContextMenu)
        );
        out.onCellContextMenu = memo.get("onCellContextMenu", [p.onCellContextMenu], () =>
            this.onCellContextMenu(p.onCellContextMenu)
        );
    }

    /** The AI column at a display column, or `undefined` for any other column. */
    private aiColumnAt(col: number): AIColumnId | undefined {
        const id = this.session.gridProps().columns[col]?.id;
        return id !== undefined && this.session.definition(id) !== undefined ? id : undefined;
    }

    private onHeaderMenuClick(
        app: DataEditorProps["onHeaderMenuClick"]
    ): NonNullable<DataEditorProps["onHeaderMenuClick"]> {
        return (col, bounds) => {
            const column = this.aiColumnAt(col);
            if (column === undefined) app?.(col, bounds);
            else
                this.setPopup({
                    kind: "menu",
                    target: { column },
                    anchor: below(bounds),
                    more: app && (() => app(col, bounds)),
                });
        };
    }

    private onHeaderContextMenu(
        app: DataEditorProps["onHeaderContextMenu"]
    ): NonNullable<DataEditorProps["onHeaderContextMenu"]> {
        return (col, event) => {
            const column = this.aiColumnAt(col);
            if (column === undefined) {
                app?.(col, event);
                return;
            }
            event.preventDefault();
            this.setPopup({
                kind: "menu",
                target: { column },
                anchor: below(event.bounds),
                more: app && (() => app(col, event)),
            });
        };
    }

    private onCellContextMenu(
        app: DataEditorProps["onCellContextMenu"]
    ): NonNullable<DataEditorProps["onCellContextMenu"]> {
        return (cell, event) => {
            const column = this.aiColumnAt(cell[0]);
            if (column === undefined || cell[1] < 0 || cell[1] >= this.session.gridProps().rows) {
                app?.(cell, event);
                return;
            }
            event.preventDefault();
            this.setPopup({
                kind: "menu",
                target: { cell: [this.session.host.rowId(cell[1]), column] },
                anchor: { x: event.bounds.x + event.localEventX, y: event.bounds.y + event.localEventY },
                more: app && (() => app(cell, event)),
            });
        };
    }

    /** A click on a cell's AI marker, at its right edge, opens the inspector. The app's handler always runs. */
    private onCellClicked(app: DataEditorProps["onCellClicked"]): NonNullable<DataEditorProps["onCellClicked"]> {
        return (cell, event) => {
            app?.(cell, event);
            const column = this.aiColumnAt(cell[0]);
            if (column === undefined || cell[1] >= this.session.gridProps().rows || event.button !== 0) return;
            if (event.bounds.width - event.localEventX > 24) return;
            const rowId = this.session.host.rowId(cell[1]);
            const status = this.session.engine?.getRecord(rowId, column)?.status;
            if (status === undefined || status === "accepted" || status === "applied" || status === "rejected") return;
            this.openInspector([rowId, column]);
        };
    }

    // -----------------------------------------------------------------------
    // Opening
    // -----------------------------------------------------------------------

    openMenu(target: AIMenuTarget): boolean {
        if (this.mode !== "built-in") return false;
        const grid = this.session.grid.current;
        const bounds =
            "column" in target
                ? this.withColumn(target.column, col => grid?.getBounds(col, -1))
                : this.withCell(target.cell, ([col, row]) => grid?.getBounds(col, row));
        if (
            bounds === undefined ||
            this.session.definition("column" in target ? target.column : target.cell[1]) === undefined
        ) {
            return false;
        }
        this.setPopup({ kind: "menu", target, anchor: below(bounds), more: undefined });
        return true;
    }

    openInspector(cell: readonly [AIRowId, AIColumnId]): boolean {
        const [rowId, columnId] = cell;
        const location = this.session.host.locate(rowId, columnId);
        if (location === undefined || this.session.engine?.getRecord(rowId, columnId) === undefined) return false;
        const [col, row] = location;
        this.session.select(cellSelection(location));
        const grid = this.session.grid.current;
        grid?.scrollTo(col, row);
        const bounds = grid?.getBounds(col, row);
        this.setPopup({
            kind: "inspector",
            rowId,
            columnId,
            anchor: bounds === undefined ? { x: 8, y: 8 } : below(bounds),
        });
        return true;
    }

    private withColumn<T>(columnId: AIColumnId, f: (col: number) => T): T | undefined {
        const col = this.session.host.colIndex(columnId);
        return col === undefined ? undefined : f(col);
    }

    private withCell<T>([rowId, columnId]: readonly [AIRowId, AIColumnId], f: (location: Item) => T): T | undefined {
        const location = this.session.host.locate(rowId, columnId);
        return location === undefined ? undefined : f(location);
    }

    // -----------------------------------------------------------------------
    // Keyboard (SPST-17 §8.1)
    // -----------------------------------------------------------------------

    shortcut(event: GridKeyEventArgs): boolean {
        const configured = this.session.currentConfig().shortcuts;
        if (configured === false) return false;
        const keys = { ...defaultShortcuts, ...configured };
        const matches = (key: string | false | undefined) =>
            typeof key === "string" && isHotkey(key, event, { didMatch: false });
        if (matches(keys.menu)) return this.menuFromKeyboard();
        if (matches(keys.inspect)) {
            const focused = this.focusedCell();
            return focused !== undefined && this.openInspector(focused);
        }
        if (matches(keys.accept)) return this.acceptSelected();
        if (matches(keys.reject)) return this.rejectSelected();
        if (matches(keys.fill)) {
            if (this.session.selectionCells(undefined).length === 0) return false;
            this.requestFill("selection", undefined, "suggest");
            return true;
        }
        return false;
    }

    /** The focused AI cell, as `[rowId, columnId]`. */
    private focusedCell(): [AIRowId, AIColumnId] | undefined {
        const cell = this.session.selection()?.current?.cell;
        if (cell === undefined || cell[1] >= this.session.gridProps().rows) return undefined;
        const column = this.aiColumnAt(cell[0]);
        return column === undefined ? undefined : [this.session.host.rowId(cell[1]), column];
    }

    private menuFromKeyboard(): boolean {
        const selected = this.session.selection()?.columns.first();
        const column = selected === undefined ? undefined : this.aiColumnAt(selected);
        if (column !== undefined) return this.openMenu({ column });
        const focused = this.focusedCell();
        return focused !== undefined && this.openMenu({ cell: focused });
    }

    private acceptSelected(): boolean {
        const refs = this.session.acceptable({ selection: true });
        if (refs.length === 0) return false;
        this.accept(refs);
        return true;
    }

    private rejectSelected(): boolean {
        const refs = this.session.rejectable({ selection: true });
        if (refs.length === 0) return false;
        this.reject(refs);
        return true;
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    accept(refs: readonly AICellRef[]): void {
        this.session.commit(refs, "accept");
        const states = refs.map(ref => this.session.cellState(ref.rowId, ref.columnId));
        const accepted = states.filter(state => state?.status === "accepted").length;
        const blocked = states.find(state => state?.blocked !== undefined)?.blocked;
        const suffix = blocked === undefined ? "" : "; not written: " + blocked.message;
        this.announce(`Accepted ${plural(accepted, "suggestion")}${suffix}`);
    }

    reject(refs: readonly AICellRef[]): void {
        const rejected = this.session.engine?.reject(refs).length ?? 0;
        this.announce(`Rejected ${plural(rejected, "result")}`);
    }

    /** Writes a value the user picked, through the same commit path as accept. */
    choose(ref: AICellRef, value: unknown): void {
        const commitId = this.session.commit([ref], "choose", { value });
        const blocked = this.session.cellState(ref.rowId, ref.columnId)?.blocked;
        this.announce(
            commitId === undefined ? `Not written: ${blocked?.message ?? "blocked"}` : "Wrote the chosen value"
        );
    }

    /**
     * Starts a fill from the UI. It asks for confirmation first when it can't
     * run, covers more than `confirmAbove` cells, is a `column` fill, or is
     * "Fill and apply".
     */
    requestFill(scope: AIFillScope, columns: readonly AIColumnId[] | undefined, mode: AIFillMode): void {
        const plan = this.session.planFill(scope, columns, mode);
        if (plan === undefined) return;
        const cells = plan.cells.length + plan.failed.length;
        const confirmAbove = this.session.engine?.execution.confirmAbove ?? 100;
        if (plan.error !== undefined || scope === "column" || mode === "apply" || cells > confirmAbove) {
            this.setPopup({ kind: "confirm", request: { scope, columns, mode, plan } });
            return;
        }
        this.startFill(scope, columns, mode);
    }

    startFill(scope: AIFillScope, columns: readonly AIColumnId[] | undefined, mode: AIFillMode): void {
        const run = this.session.fill(scope, columns, mode);
        this.announce(run.error === undefined ? `Evaluating ${plural(run.cells, "cell")}` : run.error.message);
    }

    /**
     * Selects the next result waiting for a decision after the focused cell, in
     * display order, and opens the inspector on it. Returns whether there was one.
     */
    reviewNext(columns: readonly AIColumnId[], statuses: readonly string[]): boolean {
        const { rows } = this.session.gridProps();
        if (rows === 0) {
            this.announce("Nothing left to review");
            return false;
        }
        const cols = columns
            .map(id => [id, this.session.host.colIndex(id)] as const)
            .filter((entry): entry is readonly [AIColumnId, number] => entry[1] !== undefined)
            .sort((a, b) => a[1] - b[1]);
        const [focusCol, focusRow] = this.session.selection()?.current?.cell ?? [-1, -1];
        for (let i = 0; i <= rows; i++) {
            const row = (Math.max(focusRow, 0) + i) % rows;
            const rowId = this.session.host.rowId(row);
            for (const [columnId, col] of cols) {
                if (i === 0 && focusRow >= 0 && col <= focusCol) continue;
                if (i === rows && (focusRow < 0 || col > focusCol)) continue;
                const status = this.session.engine?.getRecord(rowId, columnId)?.status;
                if (status !== undefined && statuses.includes(status)) return this.openInspector([rowId, columnId]);
            }
        }
        this.announce("Nothing left to review");
        return false;
    }

    // -----------------------------------------------------------------------
    // Menu items (SPST-17 §8.1)
    // -----------------------------------------------------------------------

    getMenuItems(target?: AIMenuTarget): AIMenuItem[] {
        if (target === undefined) return this.gridItems();
        return "column" in target ? this.columnItems(target.column) : this.cellItems(target.cell);
    }

    private item(id: string, label: string, action: () => void, disabledReason?: string, detail?: string): AIMenuItem {
        const disabled = disabledReason !== undefined;
        return {
            id,
            label,
            ...(detail === undefined ? {} : { detail }),
            disabled,
            ...(disabled ? { disabledReason } : {}),
            run: () => {
                if (!disabled) action();
            },
        };
    }

    /** A fill item, labelled with the count it would evaluate, or disabled with why it can't run. */
    private fillItem(
        id: string,
        label: (count: number) => string,
        scope: AIFillScope,
        columns: readonly AIColumnId[] | undefined,
        mode: AIFillMode = "suggest"
    ): AIMenuItem {
        const plan = this.session.planFill(scope, columns, mode);
        const { count, reason } = planned(plan, "No cells to fill", "No cells to fill");
        return this.item(id, label(count), () => this.requestFill(scope, columns, mode), reason);
    }

    /**
     * "Retry N failed" or "Re-run N stale": `api.retry` or `api.rerunStale`
     * with the same target, labelled with the cells that run would evaluate.
     * Results on rows that aren't displayed are skipped as `unloaded`, so they
     * don't count.
     */
    private rerunItem(status: "error" | "stale", column: AIColumnId | undefined): AIMenuItem {
        const target = column === undefined ? undefined : ({ column, filter: "all" } as const);
        const failed = status === "error";
        const { count, reason } = planned(
            this.session.planRerun(status, target),
            failed ? "Nothing failed" : "Nothing is stale",
            failed ? "Nothing to retry" : "Nothing to re-run"
        );
        return this.item(
            failed ? "retry-failed" : "rerun-stale",
            failed ? `Retry ${count} failed` : `Re-run ${count} stale`,
            () => this.session.rerun(status, target),
            reason
        );
    }

    /** The results "Review next" can reach: in these columns, with one of these statuses, on a displayed row. */
    private reviewable(columns: readonly AIColumnId[], statuses: readonly string[]): number {
        const wanted = new Set(columns.filter(id => this.session.host.colIndex(id) !== undefined));
        this.session.host.invalidate();
        return (this.session.engine?.store.all() ?? []).filter(
            record =>
                wanted.has(record.columnId) &&
                statuses.includes(record.status) &&
                this.session.host.rowIndex(record.rowId) !== undefined
        ).length;
    }

    private eligible(columns: readonly AIColumnId[]): AICellRef[] {
        return columns.flatMap(column => this.session.acceptable({ column, filter: "eligible" }));
    }

    /** Accept, review, retry, re-run and cancel for some AI columns (the column menu's tail, and the status bar's actions). */
    private resultItems(columns: readonly AIColumnId[], column: AIColumnId | undefined): AIMenuItem[] {
        const eligible = this.eligible(columns);
        const review = column === undefined ? suggestions : ["review"];
        const toReview = this.reviewable(columns, review);
        const running = this.session.runState().active.length > 0;
        const items = [
            this.item(
                "accept-eligible",
                `Accept ${eligible.length} eligible`,
                () => this.accept(eligible),
                eligible.length === 0 ? "No suggestions ready to accept" : undefined
            ),
            this.item(
                "review-next",
                column === undefined ? "Review next" : `Review ${toReview}`,
                () => this.reviewNext(columns, review),
                toReview === 0 ? "Nothing to review" : undefined
            ),
        ];
        if (column !== undefined) {
            // The same results as `api.reject({ column, filter: "all" })`: suggested, review, withheld and stale.
            const all = this.session.rejectable({ column, filter: "all" });
            items.push(
                this.item(
                    "reject-all",
                    "Reject all suggestions",
                    () => this.reject(all),
                    all.length === 0 ? "Nothing to reject" : undefined
                )
            );
        }
        items.push(this.rerunItem("error", column), this.rerunItem("stale", column));
        if (running) items.push(this.item("cancel", "Cancel", () => this.session.engine?.cancel()));
        return items;
    }

    private gridItems(): AIMenuItem[] {
        return this.resultItems(this.session.aiColumnIds(undefined), undefined);
    }

    private columnItems(column: AIColumnId): AIMenuItem[] {
        const definition = this.session.definition(column);
        if (definition === undefined) return [];
        const title = this.session.columnTitle(column);
        const scopes = definition.fillScopes ?? defaultScopes;
        const rowScope = this.session.currentConfig().rowScope?.();
        const items: AIMenuItem[] = [];
        if (rowScope !== undefined && scopes.includes(columnEmpty)) {
            items.push(
                this.fillItem(
                    "fill-column-empty",
                    n => `Fill empty cells in ${title} (${plural(n, "row")} in ${rowScope.label})`,
                    columnEmpty,
                    [column]
                )
            );
        }
        if (rowScope !== undefined && scopes.includes("column") && (definition.overwrite ?? "never") !== "never") {
            items.push(
                this.fillItem(
                    "fill-column",
                    n => `Fill every cell in ${title} (${plural(n, "row")} in ${rowScope.label})…`,
                    "column",
                    [column]
                )
            );
        }
        if (scopes.includes("selection")) {
            items.push(this.fillItem("fill-selection", n => `Fill selected cells (${n})`, "selection", [column]));
        }
        if (hasAutoApply(definition)) {
            const scope = rowScope !== undefined && scopes.includes(columnEmpty) ? columnEmpty : "selection";
            items.push(this.fillItem("fill-apply", () => "Fill and apply…", scope, [column], "apply"));
        }
        return [...items, ...this.resultItems([column], column)];
    }

    private cellItems(cell: readonly [AIRowId, AIColumnId]): AIMenuItem[] {
        const [rowId, columnId] = cell;
        if (this.session.definition(columnId) === undefined) return [];
        const items = [
            this.fillItem("fill-selection", n => `Fill selected cells (${n})`, "selection", undefined),
            this.fillItem(
                "fill-selection-empty",
                n => `Fill empty selected cells (${n})`,
                "selection-empty",
                undefined
            ),
        ];
        const selected = [...new Set(this.session.selectionCells(undefined).map(([, id]) => id))];
        if (selected.some(id => hasAutoApply(this.session.definition(id)))) {
            items.push(this.fillItem("fill-apply", () => "Fill and apply…", "selection", undefined, "apply"));
        }
        const refs = [{ rowId, columnId }];
        const status = this.session.engine?.getRecord(rowId, columnId)?.status;
        const noResult = status === undefined ? "This cell has no result" : undefined;
        const isSuggestion = status === "suggested" || status === "review";
        items.push(
            this.item(
                "accept",
                "Accept",
                () => this.accept(refs),
                noResult ?? (isSuggestion ? undefined : "No suggestion to accept")
            ),
            this.item(
                "reject",
                "Reject",
                () => this.reject(refs),
                noResult ??
                    (isSuggestion || status === "withheld" || status === "stale" ? undefined : "Nothing to reject")
            ),
            this.item("inspect", "Inspect…", () => this.openInspector(cell), noResult)
        );
        if (status === "stale" || status === "rejected") {
            items.push(this.item("rerun", "Re-run", () => this.rerun(rowId, columnId)));
        } else {
            items.push(
                this.item(
                    "retry",
                    "Retry",
                    () => this.session.rerun("error", { cells: [cell] }),
                    status === "error" ? undefined : "Nothing to retry"
                )
            );
        }
        if (this.session.runState().active.length > 0) {
            items.push(this.item("cancel", "Cancel", () => this.session.engine?.cancel()));
        }
        return items;
    }

    /** Re-runs a stale or rejected result. */
    rerun(rowId: AIRowId, columnId: AIColumnId): void {
        const status = this.session.engine?.getRecord(rowId, columnId)?.status;
        if (status === "stale") this.session.rerun("stale", { cells: [[rowId, columnId]] });
        else this.session.refill([{ rowId, columnId }]);
    }

    /**
     * "Edit manually": selects the cell and opens its normal editor, the way
     * the Enter key does, so the edit goes through the grid's usual editing path.
     */
    editManually(rowId: AIRowId, columnId: AIColumnId): void {
        const location = this.session.host.locate(rowId, columnId);
        this.close(true);
        if (location === undefined) return;
        this.session.select(cellSelection(location));
        window.setTimeout(() => {
            const grid = this.session.grid.current;
            grid?.focus();
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true })
            );
        }, 0);
    }
}

/**
 * The cells a plan would evaluate, and why an item is disabled: the plan's
 * error, `none` when nothing matched, or `skippedPrefix` and the skip reasons
 * when everything that matched is skipped.
 */
function planned(
    plan: AIFillPlan | undefined,
    none: string,
    skippedPrefix: string
): { count: number; reason: string | undefined } {
    const count = plan === undefined ? 0 : plan.cells.length + plan.failed.length;
    if (plan?.error !== undefined) return { count, reason: plan.error.message };
    if (count > 0) return { count, reason: undefined };
    const skipped = Object.entries(plan?.skipped ?? {}).map(([key, n]) => `${n} ${skipLabels[key as AISkipReason]}`);
    return { count, reason: skipped.length === 0 ? none : `${skippedPrefix}: ${skipped.join(", ")}` };
}
