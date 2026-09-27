import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import {
    DataEditor,
    type AIFillConfig,
    type DataEditorRef,
    type EditableGridCell,
    type GridCell,
    GridCellKind,
    type GridColumn,
    type GridSelection,
    type Item,
    CompactSelection,
} from "@specstory/ai-data-grid";
import { createMockJev } from "@specstory/ai-data-grid/testing";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useUndoRedo } from "../src/index.js";

/**
 * AI Fill's bulk accept with the real `useUndoRedo`, wired the standard way
 * (SPST-17 A5): accept-all is one undo step, undo restores every cell, redo
 * reapplies them once, and no suggestion is reapplied. Rows and answers are
 * synthetic.
 */

const columns: GridColumn[] = [
    { id: "title", title: "Title", width: 120 },
    { id: "persona", title: "Persona", width: 120 },
];

const initial = [
    { id: "a", title: "VP Sales", persona: "" },
    { id: "b", title: "CFO", persona: "" },
    { id: "c", title: "Engineer", persona: "" },
];

const jev = createMockJev({
    rules: [
        {
            type: "choice",
            answer: ({ state }) => {
                const economic = JSON.stringify(state).includes("CFO");
                return {
                    type: "choice",
                    choice: economic ? "economic" : "champion",
                    probabilities: economic ? { champion: 0.1, economic: 0.9 } : { champion: 0.9, economic: 0.1 },
                    confidence: 0.8,
                };
            },
        },
    ],
});

interface Harness {
    readonly ref: React.RefObject<DataEditorRef | null>;
    readonly personas: () => string[];
    readonly undo: () => void;
    readonly redo: () => void;
    readonly canUndo: () => boolean;
    readonly canRedo: () => boolean;
    readonly select: (selection: GridSelection) => void;
}

function renderGrid(): Harness {
    const ref = React.createRef<DataEditorRef | null>();
    let rows = initial.map(r => ({ ...r }));
    let latest: ReturnType<typeof useUndoRedo> | undefined;

    const App: React.FC = () => {
        const [, setTick] = React.useState(0);
        const getCellContent = React.useCallback(([col, row]: Item): GridCell => {
            const value = rows[row][columns[col].id as "title" | "persona"];
            return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
        }, []);
        const setCellValue = React.useCallback(([col, row]: Item, value: EditableGridCell) => {
            rows = rows.map((r, i) => (i === row ? { ...r, [columns[col].id as string]: value.data } : r));
            setTick(t => t + 1);
        }, []);
        const undo = useUndoRedo(ref as React.RefObject<DataEditorRef>, getCellContent, setCellValue);
        latest = undo;
        const aiFill = React.useMemo<AIFillConfig>(
            () => ({
                connection: jev.connection,
                model: "jev-latest",
                rows: { getRowId: row => rows[row].id },
                rowScope: () => ({ rows: "displayed", label: "contacts" }),
                columns: {
                    persona: {
                        primitive: "choice",
                        instructions: "Which buyer persona is this contact?",
                        sources: ["title"],
                        options: {
                            champion: { description: "Drives the purchase", label: "Champion" },
                            economic: { description: "Owns the budget", label: "Economic buyer" },
                        },
                    },
                },
            }),
            []
        );
        return (
            <DataEditor
                ref={ref}
                columns={columns}
                rows={rows.length}
                getCellContent={getCellContent}
                onCellEdited={undo.onCellEdited}
                gridSelection={undo.gridSelection ?? undefined}
                onGridSelectionChange={undo.onGridSelectionChange}
                aiFill={aiFill}
            />
        );
    };

    render(<App />);
    const hook = () => {
        if (latest === undefined) throw new Error("not rendered");
        return latest;
    };
    return {
        ref,
        personas: () => rows.map(r => r.persona),
        undo: () => act(() => hook().undo()),
        redo: () => act(() => hook().redo()),
        canUndo: () => hook().canUndo,
        canRedo: () => hook().canRedo,
        select: selection => act(() => hook().onGridSelectionChange(selection)),
    };
}

async function flush(): Promise<void> {
    await act(async () => {
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(50);
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(50);
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    jev.reset();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("AI Fill bulk accept with useUndoRedo", () => {
    // One test (source's count is fixed at 9), run without and then with an earlier grid selection.
    test("accept-all is one undo step, undo restores every cell, redo reapplies once, with or without a selection", async () => {
        for (const select of [false, true]) {
            cleanup();
            jev.reset();
            await roundTrip(select);
        }
    });
});

async function roundTrip(select: boolean): Promise<void> {
    const h = renderGrid();
    await flush();
    const api = h.ref.current?.aiFill;
    expect(api).toBeDefined();
    if (api === undefined) return;

    const run = api.fill("column-empty");
    expect(run.cells).toBe(3);
    await flush();
    expect(api.getCellState("a", "persona")?.status).toBe("suggested");
    expect(jev.calls).toHaveLength(3);

    if (select) {
        h.select({
            columns: CompactSelection.empty(),
            rows: CompactSelection.empty(),
            current: { cell: [0, 2], range: { x: 0, y: 2, width: 1, height: 1 }, rangeStack: [] },
        });
    }

    expect(h.canUndo()).toBe(false);
    expect(api.accept({ column: "persona", filter: "eligible" })).toBeDefined();
    await flush();
    expect(h.personas()).toEqual(["Champion", "Economic buyer", "Champion"]);
    expect(h.canUndo()).toBe(true);

    // One undo restores every cell, and leaves nothing more to undo.
    h.undo();
    await flush();
    expect(h.personas()).toEqual(["", "", ""]);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(true);
    // Nothing is suggested or written again.
    expect(api.getCellState("a", "persona")?.status).toBe("accepted");
    expect(api.accept({ column: "persona", filter: "all" })).toBeUndefined();
    await flush();
    expect(h.personas()).toEqual(["", "", ""]);

    // Redo reapplies them once.
    h.redo();
    await flush();
    expect(h.personas()).toEqual(["Champion", "Economic buyer", "Champion"]);
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
    expect(jev.calls).toHaveLength(3);
}
