import * as React from "react";
import { act, render } from "@testing-library/react";
import { vi } from "vitest";
import {
    CompactSelection,
    DataEditor,
    type DataEditorProps,
    type EditableGridCell,
    type EditListItem,
    type GridCell,
    GridCellKind,
    type GridColumn,
    type GridSelection,
    type Item,
} from "../../../src/index.js";
import type { DataEditorRef } from "../../../src/data-editor/data-editor.js";
import type { AIFillApi } from "../../../src/ai-fill/config/api.js";
import type { AIFillConfig } from "../../../src/ai-fill/config/types.js";
import type { JevRequest, JevResponse } from "../../../src/ai-fill/contract/types.js";
import { createMockJev, type MockJevOptions } from "../../../src/ai-fill/testing/index.js";
import { Context, prep } from "../../test-utils.js";

/**
 * A `DataEditor` with the `aiFill` prop, for grid-level AI Fill tests. Rows are
 * synthetic and found by id; the display order (`view`) can be sorted,
 * filtered and changed from the test, the way an app would.
 */

export type FieldKind = "text" | "number" | "boolean";

export interface HarnessColumn {
    readonly id: string;
    readonly kind: FieldKind;
    /** Makes the column's cells read-only for the rows it returns true for. */
    readonly readonly?: (row: HarnessRow) => boolean;
}

export interface HarnessRow {
    readonly id: string;
    /** Makes every cell of the row a loading cell. */
    readonly loading?: boolean;
    readonly [field: string]: unknown;
}

export interface HarnessOptions {
    readonly rows: HarnessRow[];
    readonly columns: readonly HarnessColumn[];
    /** The AI Fill configuration, given the harness's `getRowId`. `undefined` renders without `aiFill`. */
    readonly aiFill?: (rows: { getRowId: (row: number) => string }) => AIFillConfig | undefined;
    /** Extra `DataEditor` props, and overrides. */
    readonly props?: Partial<DataEditorProps>;
    /**
     * `controlled` (default): the app holds the selection. `listen`: only
     * `onGridSelectionChange`. `uncontrolled`: neither `gridSelection` nor
     * `onGridSelectionChange`.
     */
    readonly selection?: "controlled" | "listen" | "uncontrolled";
    /** Pass `onCellsEdited` returning this value. Default: no `onCellsEdited`. */
    readonly onCellsEditedReturns?: boolean | undefined | "absent";
    /** Leave `onCellEdited` out. */
    readonly noOnCellEdited?: boolean;
}

export interface Harness {
    readonly ref: React.RefObject<DataEditorRef | null>;
    /** `ref.current.aiFill`, which must be loaded. */
    api(): AIFillApi;
    /** Every row, by id. */
    row(id: string): HarnessRow;
    /** The ids in display order. */
    view(): readonly string[];
    /** Re-orders or filters the displayed rows. */
    setView(ids: readonly string[]): void;
    /** Replaces rows' data outside the grid's edit handlers. */
    patch(id: string, fields: Record<string, unknown>): void;
    /** Removes a row. */
    remove(id: string): void;
    setAIFill(config: AIFillConfig | undefined): void;
    setSelection(selection: GridSelection): void;
    /** The selection the app holds (controlled mode). */
    selection(): GridSelection;
    /** The ordered log of app callbacks that change data or selection. */
    readonly log: string[];
    /** The `onCellEdited` / `onCellsEdited` calls, in order. */
    readonly edits: { readonly via: "onCellEdited" | "onCellsEdited"; readonly items: readonly EditListItem[] }[];
    /** The grid columns now, in display order. */
    columns(): readonly GridColumn[];
    /** Re-orders the columns, by id. */
    setColumnOrder(ids: readonly string[]): void;
    readonly getRowId: (row: number) => string;
    /** The grid canvas. */
    canvas(): HTMLCanvasElement;
}

export const emptySelection: GridSelection = {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: undefined,
};

/** A selection of one rectangle. */
export function rangeSelection(x: number, y: number, width: number = 1, height: number = 1): GridSelection {
    return {
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: { cell: [x, y], range: { x, y, width, height }, rangeStack: [] },
    };
}

function cellFor(column: HarnessColumn, row: HarnessRow): GridCell {
    if (row.loading === true) return { kind: GridCellKind.Loading, allowOverlay: false };
    const value = row[column.id];
    const readonly = column.readonly?.(row) === true;
    switch (column.kind) {
        case "number":
            return {
                kind: GridCellKind.Number,
                data: value as number | undefined,
                displayData: value === undefined ? "" : String(value),
                allowOverlay: true,
                readonly,
            };
        case "boolean":
            return { kind: GridCellKind.Boolean, data: value as boolean | null, allowOverlay: false, readonly };
        case "text": {
            const text = (value as string | undefined) ?? "";
            return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: true, readonly };
        }
    }
}

export function renderAIGrid(options: HarnessOptions): Harness {
    const log: string[] = [];
    const edits: Harness["edits"] = [];
    const ref = React.createRef<DataEditorRef | null>();
    const gridColumn = (c: HarnessColumn): GridColumn => ({ id: c.id, title: c.id, width: 100 });
    let specs: readonly HarnessColumn[] = options.columns;
    let columns: GridColumn[] = specs.map(gridColumn);
    const store = new Map(options.rows.map(r => [r.id, r]));
    let order: string[] = options.rows.map(r => r.id);
    let currentSelection: GridSelection = emptySelection;
    const getRowId = (row: number) => order[row];
    let controls:
        | {
              readonly refresh: () => void;
              readonly setAIFill: (config: AIFillConfig | undefined) => void;
              readonly setSelection: (selection: GridSelection) => void;
          }
        | undefined;

    const writeCell = ([col, row]: Item, value: EditableGridCell) => {
        const id = order[row];
        const existing = store.get(id);
        if (existing === undefined) return;
        store.set(id, { ...existing, [columns[col].id as string]: value.data });
    };

    const App: React.FC = () => {
        const [tick, setTick] = React.useState(0);
        const [aiFill, setAIFill] = React.useState<AIFillConfig | undefined>(() => options.aiFill?.({ getRowId }));
        const [selection, setSelection] = React.useState<GridSelection>(emptySelection);
        const refresh = React.useCallback(() => setTick(t => t + 1), []);
        controls = { refresh, setAIFill, setSelection };
        currentSelection = selection;

        const rows = order.length;
        const getCellContent = React.useCallback(
            ([col, row]: Item): GridCell => {
                const r = store.get(order[row]);
                if (r === undefined) return { kind: GridCellKind.Loading, allowOverlay: false };
                return cellFor(specs[col], r);
            },
            // The data lives outside React; the tick gives the callback a new identity after each change.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [tick]
        );

        const onCellEdited = React.useCallback(
            (cell: Item, value: EditableGridCell) => {
                log.push(`onCellEdited ${JSON.stringify(cell)} ${JSON.stringify(value.data)}`);
                edits.push({ via: "onCellEdited", items: [{ location: cell, value }] });
                writeCell(cell, value);
                refresh();
            },
            [refresh]
        );
        const onCellsEdited = React.useCallback(
            (items: readonly EditListItem[]) => {
                log.push(`onCellsEdited ${items.length}`);
                edits.push({ via: "onCellsEdited", items });
                if (options.onCellsEditedReturns === true) {
                    for (const item of items) writeCell(item.location, item.value);
                    refresh();
                }
                return options.onCellsEditedReturns as boolean | undefined;
            },
            [refresh]
        );
        const onGridSelectionChange = React.useCallback((s: GridSelection) => {
            log.push(`onGridSelectionChange ${JSON.stringify(s.current?.range ?? null)}`);
            currentSelection = s;
            setSelection(s);
        }, []);

        const mode = options.selection ?? "controlled";
        return (
            <DataEditor
                columns={columns}
                rows={rows}
                getCellContent={getCellContent}
                rowHeight={32}
                headerHeight={36}
                {...(options.noOnCellEdited === true ? {} : { onCellEdited })}
                {...(options.onCellsEditedReturns === "absent" || !("onCellsEditedReturns" in options)
                    ? {}
                    : { onCellsEdited })}
                {...(mode === "controlled" ? { gridSelection: selection } : {})}
                {...(mode === "uncontrolled" ? {} : { onGridSelectionChange })}
                {...options.props}
                aiFill={aiFill}
                ref={ref}
            />
        );
    };

    render(<App />, { wrapper: Context });
    prep(false);

    const need = () => {
        if (controls === undefined) throw new Error("not rendered");
        return controls;
    };

    return {
        ref,
        api: () => {
            const api = ref.current?.aiFill;
            if (api === undefined) throw new Error("AI Fill isn't loaded");
            return api;
        },
        row: id => {
            const r = store.get(id);
            if (r === undefined) throw new Error(`no row ${id}`);
            return r;
        },
        view: () => order,
        setView: ids => {
            order = [...ids];
            act(() => need().refresh());
        },
        patch: (id, fields) => {
            store.set(id, { ...(store.get(id) as HarnessRow), ...fields });
            act(() => need().refresh());
        },
        remove: id => {
            store.delete(id);
            order = order.filter(o => o !== id);
            act(() => need().refresh());
        },
        setAIFill: config => act(() => need().setAIFill(config)),
        setSelection: selection => act(() => need().setSelection(selection)),
        selection: () => currentSelection,
        log,
        edits,
        columns: () => columns,
        setColumnOrder: ids => {
            specs = ids.map(id => options.columns.find(c => c.id === id) as HarnessColumn);
            columns = specs.map(gridColumn);
            act(() => need().refresh());
        },
        getRowId,
        canvas: () => {
            const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="data-grid-canvas"]');
            if (canvas === null) throw new Error("no canvas");
            return canvas;
        },
    };
}

/** Waits for the lazily loaded controller and lets pending work settle. */
export async function settle(): Promise<void> {
    await act(async () => {
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(20);
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(20);
    });
}

/**
 * A Jev that holds every request until the test releases it. It answers with
 * {@link createMockJev}, and counts every request.
 */
export function gatedJev(options: MockJevOptions = {}) {
    const mock = createMockJev(options);
    const waiting: {
        readonly request: JevRequest;
        readonly resolve: (response: JevResponse) => void;
        readonly reject: (error: unknown) => void;
    }[] = [];
    const requests: JevRequest[] = [];
    let open = false;
    const send = vi.fn((request: JevRequest, signal?: AbortSignal): Promise<JevResponse> => {
        requests.push(request);
        if (open) return mock.send(request, signal);
        return new Promise<JevResponse>((resolve, reject) => {
            const entry = { request, resolve, reject };
            waiting.push(entry);
            signal?.addEventListener("abort", () => {
                const index = waiting.indexOf(entry);
                if (index >= 0) waiting.splice(index, 1);
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
            });
        });
    });
    return {
        connection: { mode: "custom" as const, send },
        send,
        requests,
        /** Requests still held. */
        waiting: () => waiting.length,
        /** Answers the held requests `pick` selects (default: all), in the order given. */
        async release(pick?: (request: JevRequest, index: number) => boolean, reverse: boolean = false) {
            // Without `pick`, requests sent while releasing (queued behind the concurrency limit) are released too.
            for (let round = 0; round < 100; round++) {
                const selected = waiting.filter((entry, i) => pick === undefined || pick(entry.request, i));
                if (selected.length === 0) break;
                if (reverse) selected.reverse();
                for (const entry of selected) {
                    waiting.splice(waiting.indexOf(entry), 1);
                    void mock.send(entry.request).then(entry.resolve, entry.reject);
                }
                await settle();
                if (pick !== undefined) break;
            }
        },
        /** Answers every request from now on without holding it. */
        async open() {
            open = true;
            await this.release();
        },
    };
}
