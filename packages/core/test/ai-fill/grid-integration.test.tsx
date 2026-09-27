/* eslint-disable sonarjs/no-duplicate-string */
import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DataEditorProps, DataEditorRef } from "../../src/data-editor/data-editor.js";
import type { AIFillApi } from "../../src/ai-fill/config/api.js";
import type { AIFillError } from "../../src/ai-fill/config/results.js";
import type { AIFillConfig } from "../../src/ai-fill/config/types.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { persona } from "./fixtures/definitions.js";
import { gatedJev, type HarnessOptions, rangeSelection, renderAIGrid, settle } from "./fixtures/harness.js";

const spies = vi.hoisted(() => ({ coreProps: [] as unknown[], coreHandles: [] as unknown[] }));

vi.mock("../../src/common/resize-detector", () => ({
    useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
}));

// Records the props and the handle of the core grid.
vi.mock("../../src/data-editor/data-editor.js", async importOriginal => {
    const actual = await importOriginal<typeof import("../../src/data-editor/data-editor.js")>();
    const ReactModule = await import("react");
    const CoreSpy = ReactModule.forwardRef<DataEditorRef, Parameters<typeof actual.DataEditor>[0]>((props, ref) => {
        spies.coreProps.push(props);
        const capture = ReactModule.useCallback(
            (handle: DataEditorRef | null) => {
                if (handle !== null) spies.coreHandles.push(handle);
                if (typeof ref === "function") ref(handle);
                else if (ref !== null) ref.current = handle;
            },
            [ref]
        );
        return ReactModule.createElement(actual.DataEditor, { ...props, ref: capture });
    });
    return { ...actual, DataEditor: CoreSpy };
});

const core = () => spies.coreProps.at(-1) as DataEditorProps;
const coreHandle = () => spies.coreHandles.at(-1) as DataEditorRef;

beforeEach(() => {
    vi.useFakeTimers();
    spies.coreProps.length = 0;
    spies.coreHandles.length = 0;
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

type Jev = ReturnType<typeof gatedJev>;

function contacts(overrides: (jev: Jev) => Partial<AIFillConfig> = () => ({}), options: Partial<HarnessOptions> = {}) {
    const jev = gatedJev({ rules: contactRules });
    const h = renderAIGrid({
        rows: contactRows(),
        columns: contactColumns,
        aiFill: ({ getRowId }) => contactConfig(jev.connection, getRowId, overrides(jev)),
        ...options,
    });
    return { jev, h };
}

/** The draw calls on the grid canvas since the last clear. */
function drawCalls(canvas: HTMLCanvasElement): { type: string; props: Record<string, unknown> }[] {
    const ctx = canvas.getContext("2d") as unknown as {
        __getDrawCalls(): { type: string; props: Record<string, unknown> }[];
    };
    return ctx.__getDrawCalls();
}

function clearDrawCalls(canvas: HTMLCanvasElement): void {
    (canvas.getContext("2d") as unknown as { __clearDrawCalls(): void }).__clearDrawCalls();
}

function repaint(): void {
    act(() => {
        vi.advanceTimersByTime(50);
    });
}

describe("the aiFill prop (SPST-16 AC 1)", () => {
    test("ref.current.aiFill is undefined until the controller loads, then onReady fires once", async () => {
        const onReady = vi.fn<[AIFillApi], void>();
        const { h } = contacts(() => ({ onReady }));
        expect(h.ref.current).not.toBeNull();
        expect(h.ref.current?.aiFill).toBeUndefined();
        expect(onReady).not.toHaveBeenCalled();
        await settle();
        const api = h.ref.current?.aiFill;
        expect(api).toBeDefined();
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onReady).toHaveBeenCalledWith(api);
        // The rest of the handle is the core grid's.
        expect(h.ref.current?.updateCells).toBe(coreHandle().updateCells);
        // Re-renders don't fire it again.
        h.setSelection(rangeSelection(col.persona, 0));
        h.patch("r1", { notes: "x" });
        await settle();
        expect(onReady).toHaveBeenCalledTimes(1);
    });

    test("setting and clearing aiFill doesn't remount the grid; clearing aborts requests and drops results", async () => {
        const jev = gatedJev({ rules: contactRules });
        const h = renderAIGrid({ rows: contactRows(), columns: contactColumns });
        await settle();
        const canvas = h.canvas();
        expect(h.ref.current?.aiFill).toBeUndefined();

        const config = contactConfig(jev.connection, h.getRowId);
        h.setAIFill(config);
        await settle();
        expect(h.canvas()).toBe(canvas);
        const first = h.api();

        h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        first.fill("selection");
        await settle();
        expect(jev.waiting()).toBe(2);
        await jev.release(req => JSON.stringify(req.state).includes("Acme"));
        expect(first.getCellState("r1", "persona")?.status).toBe("suggested");

        h.setAIFill(undefined);
        await settle();
        expect(h.canvas()).toBe(canvas);
        expect(jev.waiting()).toBe(0); // the in-flight request was aborted
        expect(h.ref.current).not.toBeNull();
        expect(h.ref.current?.aiFill).toBeUndefined();
        expect(Object.keys(h.ref.current as object)).not.toContain("aiFill");
        expect(first.getCellState("r1", "persona")).toBeUndefined();

        h.setAIFill(config);
        await settle();
        expect(h.canvas()).toBe(canvas);
        expect(h.api().getCellState("r1", "persona")).toBeUndefined();
        expect(h.api().getRunState().active).toEqual([]);
        expect(h.edits).toEqual([]);
    });

    test("configuration issues are reported once through onError, and disable the column", async () => {
        const errors: AIFillError[] = [];
        const { h } = contacts(() => ({
            columns: { persona, missing: persona },
            onError: error => errors.push(error),
        }));
        await settle();
        h.patch("r1", { notes: "re-render" });
        await settle();
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ kind: "configuration", columnId: "missing" });
        expect(h.api().getRunState().issues).toHaveLength(1);
    });
});

describe("composition (SPST-17 A1)", () => {
    test("app handlers are wrapped and still called; getCellContent and validateCell are never wrapped", async () => {
        const drawCell = vi.fn<Parameters<NonNullable<DataEditorProps["drawCell"]>>, void>((_args, draw) => draw());
        const drawHeader = vi.fn<Parameters<NonNullable<DataEditorProps["drawHeader"]>>, void>((_args, draw) => draw());
        const onHeaderMenuClick = vi.fn();
        const onHeaderContextMenu = vi.fn();
        const onCellContextMenu = vi.fn();
        const validateCell = vi.fn(() => true);
        const { h } = contacts(() => ({}), {
            props: { drawCell, drawHeader, onHeaderMenuClick, onHeaderContextMenu, onCellContextMenu, validateCell },
        });
        await settle();
        const p = core();
        expect(p.drawCell).not.toBe(drawCell);
        expect(p.drawHeader).not.toBe(drawHeader);
        expect(p.validateCell).toBe(validateCell);
        // The menu callbacks are wrapped for the built-in AI menus; ui-menus.test.tsx covers how they coexist.
        expect(p.onHeaderMenuClick).not.toBe(onHeaderMenuClick);
        expect(p.onHeaderContextMenu).not.toBe(onHeaderContextMenu);
        expect(p.onCellContextMenu).not.toBe(onCellContextMenu);
        expect(drawCell).toHaveBeenCalled();
        expect(drawHeader).toHaveBeenCalled();

        // AI columns get a menu; the app's column objects are otherwise unchanged.
        const appColumns = h.columns();
        expect(p.columns.map(c => c.hasMenu === true)).toEqual([false, false, false, true, true, true]);
        expect(p.columns[0]).toBe(appColumns[0]);

        // Wrappers keep their identity across renders while the app handler does.
        const wrappedDraw = p.drawCell;
        const wrappedColumns = p.columns;
        h.setSelection(rangeSelection(0, 0));
        await settle();
        expect(core().drawCell).toBe(wrappedDraw);
        expect(core().columns).toBe(wrappedColumns);
        expect(core().getCellContent).toBeDefined();
    });

    test("onCellsEdited returns the app's value, so true still suppresses the per-cell calls", async () => {
        const { h } = contacts(() => ({}), { onCellsEditedReturns: true });
        await settle();
        const value = { kind: "text", data: "x", displayData: "x", allowOverlay: true } as never;
        let returned: boolean | void | undefined;
        act(() => {
            returned = core().onCellsEdited?.([{ location: [col.notes, 0], value }]);
        });
        expect(returned).toBe(true);
        expect(h.log).toEqual(["onCellsEdited 1"]);
    });

    test("the selection passes through when the app controls it, and is held by AI Fill when it doesn't", async () => {
        const controlled = contacts();
        await settle();
        const selection = rangeSelection(col.persona, 1);
        controlled.h.setSelection(selection);
        expect(core().gridSelection).toBe(selection);
        expect(core().onGridSelectionChange).toBeDefined();
        cleanup();

        const uncontrolled = contacts(() => ({}), { selection: "uncontrolled" });
        await settle();
        // The grid reports a selection change, as it does when the user clicks a cell.
        const held = core();
        expect(held.gridSelection).toBeDefined();
        act(() => held.onGridSelectionChange?.(rangeSelection(col.persona, 1)));
        await settle();
        expect(core().gridSelection?.current?.cell).toEqual([col.persona, 1]);
        const run = uncontrolled.h.api().fill("selection");
        expect(run.cells).toBe(1);
        cleanup();

        // The app only listens: the grid holds the selection, and AI Fill observes what it reports.
        const listening = contacts(() => ({}), { selection: "listen" });
        await settle();
        expect(core().gridSelection).toBeUndefined();
        act(() => core().onGridSelectionChange?.(rangeSelection(col.persona, 0, 1, 3)));
        expect(listening.h.log.at(-1)).toBe(`onGridSelectionChange {"x":${col.persona},"y":0,"width":1,"height":3}`);
        expect(listening.h.api().fill("selection").cells).toBe(3);
    });

    test("onKeyDown: the app runs first, and preventDefault stops AI Fill's shortcuts", async () => {
        let prevent = true;
        const onKeyDown = vi.fn((event: { preventDefault(): void }) => {
            if (prevent) event.preventDefault();
        });
        const { jev, h } = contacts(() => ({}), { props: { onKeyDown } });
        await settle();
        h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        const canvas = h.canvas();
        // Ctrl+Alt+F fills the selection, unless the app handled the key.
        fireEvent.keyDown(canvas, { key: "f", keyCode: 70, ctrlKey: true, altKey: true });
        await settle();
        expect(onKeyDown).toHaveBeenCalledTimes(1);
        expect(jev.requests).toHaveLength(0);

        prevent = false;
        fireEvent.keyDown(canvas, { key: "f", keyCode: 70, ctrlKey: true, altKey: true });
        await settle();
        expect(jev.requests).toHaveLength(2);
        await jev.release();

        // Ctrl+Backspace rejects the selected suggestions, Ctrl+Enter accepts them.
        h.setSelection(rangeSelection(col.persona, 1));
        fireEvent.keyDown(canvas, { key: "Backspace", ctrlKey: true });
        expect(h.api().getCellState("r2", "persona")?.status).toBe("rejected");
        h.setSelection(rangeSelection(col.persona, 0));
        fireEvent.keyDown(canvas, { key: "Enter", ctrlKey: true });
        expect(h.row("r1").persona).toBe("Champion");
    });
});

describe("rendering", () => {
    test("drawCell draws the AI overlay after the cell's content, and repaints only changed cells", async () => {
        const { jev, h } = contacts();
        await settle();
        h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        h.api().fill("selection");
        await settle();
        const updateCells = vi.spyOn(coreHandle(), "updateCells");
        await jev.release();
        // One repaint for the two settled cells, at their display locations.
        const repainted = updateCells.mock.calls.flatMap(call => call[0].map(c => c.cell));
        expect(repainted).toEqual(
            expect.arrayContaining([
                [col.persona, 0],
                [col.persona, 1],
            ])
        );
        expect(repainted.every(([c]) => c === col.persona)).toBe(true);

        const canvas = h.canvas();
        clearDrawCalls(canvas);
        act(() => {
            coreHandle().updateCells([{ cell: [col.persona, 0] }]);
        });
        repaint();
        const texts = drawCalls(canvas)
            .filter(call => call.type === "fillText")
            .map(call => call.props.text);
        expect(texts).toContain("Champion");
        expect(texts).toContain("✦");
    });

    test("the AI column header gets a badge after the app's header", async () => {
        contacts();
        await settle();
        // The header is drawn on its own canvas: the badge follows each AI column's title, and only those.
        const header = [...document.querySelectorAll("canvas")].find(canvas =>
            drawCalls(canvas).some(call => call.type === "fillText" && call.props.text === "company")
        );
        expect(header).toBeDefined();
        const texts = drawCalls(header as HTMLCanvasElement)
            .filter(call => call.type === "fillText")
            .map(call => call.props.text);
        const firstPass = texts.slice(0, texts.indexOf("company", 1) > 0 ? texts.indexOf("company", 1) : undefined);
        expect(firstPass).toEqual(["company", "title", "notes", "persona", "✦", "seniority", "✦", "ownsBudget", "✦"]);
    });
});

describe("no inference without an explicit trigger (§6.1, §4.5)", () => {
    test("painting, scrolling, selection, sorting, hovering, the inspector and the menus make zero transport calls", async () => {
        const { jev, h } = contacts();
        await settle();
        h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        h.api().fill("selection");
        await jev.release();
        const calls = jev.send.mock.calls.length;

        const canvas = h.canvas();
        for (let i = 0; i < 3; i++) {
            act(() => {
                coreHandle().updateCells([{ cell: [col.persona, i] }]);
            });
            repaint();
        }
        const scroller = document.getElementsByClassName("dvn-scroller").item(0) as HTMLElement;
        fireEvent.scroll(scroller, { target: { scrollTop: 64 } });
        repaint();
        fireEvent.pointerMove(canvas, { clientX: 330, clientY: 100 });
        repaint();
        h.setSelection(rangeSelection(col.persona, 2, 1, 2));
        h.setView(["r4", "r3", "r2", "r1"]);
        h.setView(["r1", "r2"]);
        h.api().getCellState("r1", "persona");
        h.api().getRunState();
        act(() => {
            expect(h.api().openInspector(["r1", "persona"])).toBe(true);
        });
        act(() => {
            expect(h.api().openMenu({ column: "persona" })).toBe(true);
        });
        h.api().getMenuItems({ column: "persona" });
        h.api().getMenuItems({ cell: ["r1", "persona"] });
        h.api().getMenuItems();
        await settle();
        expect(document.querySelector('[role="menu"]')).not.toBeNull();
        expect(jev.send.mock.calls.length).toBe(calls);
    });

    test("changing only the policy re-decides from the stored answers with zero calls", async () => {
        const jev = gatedJev({ rules: contactRules });
        const h = renderAIGrid({ rows: contactRows(), columns: contactColumns });
        const base = contactConfig(jev.connection, h.getRowId);
        h.setAIFill(base);
        await settle();
        h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        h.api().fill("selection");
        await jev.release();
        const calls = jev.send.mock.calls.length;
        expect(h.api().getCellState("r2", "persona")?.status).toBe("suggested");

        h.setAIFill({
            ...base,
            columns: { ...base.columns, persona: { ...persona, policy: { show: { minProbability: 0.88 } } } },
        });
        await settle();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("suggested"); // 0.9
        expect(h.api().getCellState("r2", "persona")?.status).toBe("withheld"); // 0.85
        expect(jev.send.mock.calls.length).toBe(calls);
    });
});
