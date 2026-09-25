/* eslint-disable sonarjs/no-duplicate-string */
import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
} from "../../src/index.js";
import type { DataEditorRef } from "../../src/data-editor/data-editor.js";
import { Context, prep, sendClick, standardAfterEach, standardBeforeEach } from "../test-utils.js";

/**
 * The unconfigured-grid golden test (SPST-17, Amendment 1, A4).
 *
 * It was committed, with its snapshot, before `data-editor-all.tsx` gained the
 * `aiFill` prop. A `DataEditor` without `aiFill` must keep rendering, drawing
 * and calling back exactly as it did then, so the snapshot must stay
 * byte-identical.
 */

const spies = vi.hoisted(() => ({
    controllerImported: vi.fn(),
    coreProps: [] as Record<string, unknown>[],
    coreHandles: [] as unknown[],
}));

vi.mock("../../src/common/resize-detector", () => ({
    useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
}));

// Importing AI Fill's controller must never happen while `aiFill` is unset.
vi.mock("../../src/ai-fill/react/controller.js", () => {
    spies.controllerImported();
    return { default: () => null };
});

// Records the props and the ref handle of the core `DataEditor` that `DataEditor` (`DataEditorAll`) renders.
vi.mock("../../src/data-editor/data-editor.js", async importOriginal => {
    const actual = await importOriginal<typeof import("../../src/data-editor/data-editor.js")>();
    const ReactModule = await import("react");
    const CoreSpy = ReactModule.forwardRef<DataEditorRef, Parameters<typeof actual.DataEditor>[0]>((props, ref) => {
        spies.coreProps.push(props as unknown as Record<string, unknown>);
        const capture = ReactModule.useCallback(
            (handle: DataEditorRef | null) => {
                spies.coreHandles.push(handle);
                if (typeof ref === "function") ref(handle);
                else if (ref !== null) ref.current = handle;
            },
            [ref]
        );
        return ReactModule.createElement(actual.DataEditor, { ...props, ref: capture });
    });
    return { ...actual, DataEditor: CoreSpy };
});

const columns: GridColumn[] = [
    { id: "name", title: "Name", width: 120 },
    { id: "title", title: "Title", width: 120, hasMenu: true },
    { id: "notes", title: "Notes", width: 120 },
    { id: "score", title: "Score", width: 80 },
    { id: "flag", title: "Flag", width: 60 },
];

interface Row {
    name: string;
    title: string;
    notes: string;
    score: number;
    flag: boolean;
}

function makeRows(): Row[] {
    return Array.from({ length: 8 }, (_, i) => ({
        name: `Person ${i}`,
        title: i % 2 === 0 ? "VP Sales" : "Engineer",
        notes: "",
        score: i,
        flag: i % 3 === 0,
    }));
}

/** Turns callback arguments into small, stable, serializable values. */
function sanitize(value: unknown, depth: number = 0): unknown {
    if (depth > 6) return "[deep]";
    if (value === null || value === undefined) return value;
    if (typeof value === "function") return "[fn]";
    if (typeof value !== "object") return value;
    if (value instanceof CompactSelection) return { selection: value.toArray() };
    if (typeof Node !== "undefined" && value instanceof Node) return `[node ${value.nodeName}]`;
    if (typeof Event !== "undefined" && value instanceof Event) return `[event ${value.type}]`;
    if (Array.isArray(value)) return value.map(item => sanitize(item, depth + 1));
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
        if (key === "rawEvent" || key === "nativeEvent" || key === "ctx") continue;
        out[key] = sanitize((value as Record<string, unknown>)[key], depth + 1);
    }
    return out;
}

interface Harness {
    readonly log: string[];
    readonly props: () => DataEditorProps;
    readonly ref: React.RefObject<DataEditorRef | null>;
}

function renderGolden(): Harness {
    const log: string[] = [];
    const record = (name: string, ...args: unknown[]) => {
        log.push(`${name} ${JSON.stringify(sanitize(args))}`);
    };
    const ref = React.createRef<DataEditorRef | null>();
    let latestProps: DataEditorProps | undefined;

    const App: React.FC = () => {
        const [rows, setRows] = React.useState(makeRows);
        const [selection, setSelection] = React.useState<GridSelection>({
            columns: CompactSelection.empty(),
            rows: CompactSelection.empty(),
            current: undefined,
        });

        const getCellContent = React.useCallback(
            ([col, row]: Item): GridCell => {
                record("getCellContent", [col, row]);
                const data = rows[row];
                switch (columns[col].id) {
                    case "score":
                        return {
                            kind: GridCellKind.Number,
                            allowOverlay: true,
                            data: data.score,
                            displayData: String(data.score),
                        };
                    case "flag":
                        return { kind: GridCellKind.Boolean, allowOverlay: false, data: data.flag };
                    default: {
                        const text = data[columns[col].id as "name" | "title" | "notes"];
                        return { kind: GridCellKind.Text, allowOverlay: true, data: text, displayData: text };
                    }
                }
            },
            [rows]
        );

        const onCellEdited = React.useCallback((cell: Item, value: EditableGridCell) => {
            record("onCellEdited", cell, value);
            const [col, row] = cell;
            const id = columns[col].id as keyof Row;
            setRows(current =>
                current.map((r, i) => (i === row && value.data !== undefined ? { ...r, [id]: value.data } : r))
            );
        }, []);

        const props: DataEditorProps = {
            columns,
            rows: rows.length,
            getCellContent,
            getCellsForSelection: true,
            rowHeight: 32,
            headerHeight: 36,
            gridSelection: selection,
            onGridSelectionChange: React.useCallback((s: GridSelection) => {
                record("onGridSelectionChange", s);
                setSelection(s);
            }, []),
            drawCell: React.useCallback<NonNullable<DataEditorProps["drawCell"]>>((args, drawContent) => {
                record("drawCell", [args.col, args.row]);
                drawContent();
            }, []),
            drawHeader: React.useCallback<NonNullable<DataEditorProps["drawHeader"]>>((args, drawContent) => {
                record("drawHeader", args.columnIndex);
                drawContent();
            }, []),
            onHeaderMenuClick: React.useCallback((col: number, bounds: unknown) => {
                record("onHeaderMenuClick", col, bounds);
            }, []),
            onHeaderContextMenu: React.useCallback((col: number, event: unknown) => {
                record("onHeaderContextMenu", col, event);
            }, []),
            onCellContextMenu: React.useCallback((cell: Item, event: unknown) => {
                record("onCellContextMenu", cell, event);
            }, []),
            onCellsEdited: React.useCallback((items: readonly EditListItem[]) => {
                record("onCellsEdited", items);
                return undefined;
            }, []),
            onCellEdited,
            validateCell: React.useCallback((cell: Item, value: EditableGridCell, previous: GridCell) => {
                record("validateCell", cell, value, previous);
                return true;
            }, []),
            onKeyDown: React.useCallback((event: unknown) => {
                record("onKeyDown", event);
            }, []),
        };
        latestProps = props;
        return <DataEditor {...props} ref={ref} />;
    };

    render(<App />, { wrapper: Context });
    return {
        log,
        ref,
        props: () => {
            if (latestProps === undefined) throw new Error("not rendered");
            return latestProps;
        },
    };
}

interface DrawCall {
    readonly type: string;
    readonly props: unknown;
    readonly transform: readonly number[];
}

/** The draw calls `vitest-canvas-mock` recorded on every canvas in the document, one line per call. */
function canvasEvents(): unknown[] {
    return [...document.querySelectorAll("canvas")].map(canvas => {
        const ctx = canvas.getContext("2d") as unknown as { __getDrawCalls(): DrawCall[] } | null;
        return {
            testId: canvas.dataset.testid ?? null,
            width: canvas.width,
            height: canvas.height,
            drawCalls: (ctx?.__getDrawCalls() ?? []).map(
                call => `${call.type} ${JSON.stringify(sanitize(call.props))} [${call.transform.join(",")}]`
            ),
        };
    });
}

const cellX = (col: number) => columns.slice(0, col).reduce((sum, c) => sum + (c as { width: number }).width, 0) + 30;
const cellY = (row: number) => 36 + row * 32 + 16;

describe("DataEditor without aiFill (golden)", () => {
    beforeEach(() => {
        standardBeforeEach();
        spies.controllerImported.mockClear();
        spies.coreProps.length = 0;
        spies.coreHandles.length = 0;
    });

    afterEach(() => {
        standardAfterEach();
    });

    test("renders, draws and calls back exactly as before", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        vi.useFakeTimers();
        const harness = renderGolden();
        prep(false);

        const canvas = screen.getByTestId("data-grid-canvas");

        // A click on a cell.
        sendClick(canvas, { clientX: cellX(0), clientY: cellY(1) });
        act(() => {
            vi.runAllTimers();
        });

        // Keys.
        fireEvent.keyDown(canvas, { key: "ArrowRight" });
        fireEvent.keyDown(canvas, { key: "ArrowDown" });
        act(() => {
            vi.runAllTimers();
        });

        // An overlay edit: typing opens the editor, Enter commits.
        fireEvent.keyDown(canvas, { keyCode: 74, key: "j" });
        await act(async () => {
            await vi.dynamicImportSettled();
            vi.runAllTimers();
        });
        const overlay = screen.getByDisplayValue("j");
        fireEvent.keyDown(overlay, { key: "Enter" });
        act(() => {
            vi.runAllTimers();
        });

        // A paste at the current cell.
        sendClick(canvas, { clientX: cellX(0), clientY: cellY(1) });
        act(() => {
            vi.runAllTimers();
        });
        vi.spyOn(document, "activeElement", "get").mockImplementation(() => canvas);
        fireEvent.paste(window);
        vi.useRealTimers();
        await act(() => new Promise(resolve => window.setTimeout(resolve, 10)));
        vi.useFakeTimers();
        act(() => {
            vi.runAllTimers();
        });

        // A header menu click.
        fireEvent.pointerMove(canvas, { clientX: cellX(1) + 80, clientY: 18 });
        act(() => {
            vi.advanceTimersByTime(100);
        });
        sendClick(canvas, { clientX: cellX(1) + 80, clientY: 18 });
        act(() => {
            vi.runAllTimers();
        });

        // Context menus on a header and on a cell.
        const scroller = document.getElementsByClassName("dvn-scroller").item(0);
        expect(scroller).not.toBeNull();
        fireEvent.contextMenu(scroller as Element, { clientX: cellX(2), clientY: 18 });
        fireEvent.contextMenu(scroller as Element, { clientX: cellX(2), clientY: cellY(3) });
        act(() => {
            vi.runAllTimers();
        });

        const names = new Set(harness.log.map(line => line.slice(0, line.indexOf(" "))));
        for (const name of [
            "getCellContent",
            "drawCell",
            "drawHeader",
            "onGridSelectionChange",
            "onKeyDown",
            "validateCell",
            "onCellsEdited",
            "onCellEdited",
            "onHeaderMenuClick",
            "onHeaderContextMenu",
            "onCellContextMenu",
        ]) {
            expect(names, name).toContain(name);
        }

        expect({
            dom: document.body.innerHTML,
            canvas: canvasEvents(),
            callbacks: harness.log,
        }).toMatchSnapshot();

        // No AI module was loaded, and nothing was fetched.
        expect(spies.controllerImported).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();

        // `ref.current` is the core grid's own handle, with no `aiFill` key.
        const handle = harness.ref.current;
        expect(handle).not.toBeNull();
        expect(handle).toBe(spies.coreHandles.at(-1));
        expect(Object.keys(handle as object)).not.toContain("aiFill");

        // Every prop the app passed reaches the core grid unchanged, with the same identity.
        const appProps = harness.props() as unknown as Record<string, unknown>;
        const coreProps = spies.coreProps.at(-1) ?? {};
        for (const [key, value] of Object.entries(appProps)) {
            expect(coreProps[key], key).toBe(value);
        }
        expect(Object.keys(coreProps).sort()).toEqual(
            [...Object.keys(appProps), "headerIcons", "imageWindowLoader", "renderers"].sort()
        );
        fetchSpy.mockRestore();
    });
});
