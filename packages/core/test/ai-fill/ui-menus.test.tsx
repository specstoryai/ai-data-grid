/* eslint-disable sonarjs/no-duplicate-string */
import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DataEditorProps, DataEditorRef } from "../../src/data-editor/data-editor.js";
import type { AIFillConfig } from "../../src/ai-fill/config/types.js";
import type { CellClickedEventArgs, HeaderClickedEventArgs } from "../../src/internal/data-grid/event-args.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { CompactSelection } from "../../src/index.js";
import { standardBeforeEach } from "../test-utils.js";
import { persona } from "./fixtures/definitions.js";
import { gatedJev, type HarnessOptions, rangeSelection, renderAIGrid, settle } from "./fixtures/harness.js";
import {
    clickHeaderMenu,
    gridFocused,
    gridKey,
    menu,
    menuItems,
    pick,
    rightClickCell,
    statusBar,
} from "./fixtures/ui.js";

const spies = vi.hoisted(() => ({ coreProps: [] as unknown[] }));

vi.mock("../../src/common/resize-detector", () => ({
    useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
}));

// Records the props that reach the core grid, so a test can call a composed handler with known arguments.
vi.mock("../../src/data-editor/data-editor.js", async importOriginal => {
    const actual = await importOriginal<typeof import("../../src/data-editor/data-editor.js")>();
    const ReactModule = await import("react");
    const CoreSpy = ReactModule.forwardRef<DataEditorRef, Parameters<typeof actual.DataEditor>[0]>((props, ref) => {
        spies.coreProps.push(props);
        return ReactModule.createElement(actual.DataEditor, { ...props, ref });
    });
    return { ...actual, DataEditor: CoreSpy };
});

const core = () => spies.coreProps.at(-1) as DataEditorProps;

beforeEach(() => {
    standardBeforeEach();
    vi.useFakeTimers();
    spies.coreProps.length = 0;
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

/** Every column has a header menu, so non-AI columns reach the app's handler too. */
const menuColumns = contactColumns.map(c => ({ id: c.id, title: c.id, width: 100, hasMenu: true }));

const rowScope: AIFillConfig["rowScope"] = () => ({ rows: "displayed", label: "filtered contacts" });

function contacts(overrides: Partial<AIFillConfig> = {}, options: Partial<HarnessOptions> = {}) {
    const jev = gatedJev({ rules: contactRules });
    const h = renderAIGrid({
        rows: contactRows(),
        columns: contactColumns,
        aiFill: ({ getRowId }) => contactConfig(jev.connection, getRowId, { rowScope, ...overrides }),
        ...options,
    });
    return { jev, h };
}

const labels = () => menuItems().map(item => item.label);

describe("column menu (§8.1)", () => {
    test("the header ▾ on an AI column opens the AI menu with counts; other columns go to the app", async () => {
        const onHeaderMenuClick = vi.fn();
        const { jev, h } = contacts({}, { props: { columns: menuColumns, onHeaderMenuClick } });
        await settle();

        await clickHeaderMenu(h, col.company);
        expect(onHeaderMenuClick).toHaveBeenCalledWith(col.company, expect.anything());
        expect(menu()).toBeNull();

        await clickHeaderMenu(h, col.persona);
        expect(onHeaderMenuClick).toHaveBeenCalledTimes(1);
        expect(menu()?.getAttribute("aria-label")).toBe("AI Fill: persona");
        expect(labels()).toEqual([
            "Fill empty cells in persona (4 rows in filtered contacts)",
            "Fill selected cells (0)",
            "Accept 0 eligible",
            "Review 0",
            "Reject all suggestions",
            "Retry 0 failed",
            "Re-run 0 stale",
            "More options…",
        ]);
        expect(menuItems().map(item => item.disabled)).toEqual([false, true, true, true, true, true, true, false]);
        // The menu is in the portal and ignored by the grid's click-outside handling.
        expect(menu()?.closest("#portal")).not.toBeNull();
        expect(menu()?.classList.contains("click-outside-ignore")).toBe(true);
        expect(menu()?.classList.contains("gdg-ai-menu")).toBe(true);
        expect(jev.requests).toHaveLength(0);

        await pick("Fill empty cells in persona (4 rows in filtered contacts)");
        expect(menu()).toBeNull();
        expect(jev.requests).toHaveLength(4);
    });

    test("right-clicking an AI cell opens the cell menu; other cells go to the app", async () => {
        const onCellContextMenu = vi.fn();
        const { h } = contacts({}, { props: { onCellContextMenu } });
        await settle();

        await rightClickCell(col.company, 1);
        expect(onCellContextMenu).toHaveBeenCalledWith([col.company, 1], expect.anything());
        expect(menu()).toBeNull();

        await rightClickCell(col.persona, 1);
        expect(onCellContextMenu).toHaveBeenCalledTimes(1);
        expect(labels()).toEqual([
            "Fill selected cells (1)",
            "Fill empty selected cells (1)",
            "Accept",
            "Reject",
            "Inspect…",
            "Retry",
            "More options…",
        ]);
        // The grid selected the right-clicked cell, and the fill entries count it.
        expect(h.selection().current?.cell).toEqual([col.persona, 1]);
    });

    test("Shift+F10 and the ContextMenu key open the menu for the focused AI cell or the selected AI column", async () => {
        const { h } = contacts();
        await settle();
        h.setSelection(rangeSelection(col.persona, 0));
        await gridKey(h, { key: "F10", shiftKey: true });
        expect(labels()[0]).toBe("Fill selected cells (1)");
        expect(document.activeElement).toBe(menuItems()[0].element);

        fireEvent.keyDown(menu() as HTMLElement, { key: "Escape" });
        await settle();
        expect(menu()).toBeNull();
        expect(gridFocused(h)).toBe(true);

        await gridKey(h, { key: "ContextMenu" });
        expect(menu()).not.toBeNull();
    });
});

describe("coexistence with app menus", () => {
    const bounds = { x: 380, y: 0, width: 20, height: 36 };

    function cellEvent(
        cell: readonly [number, number]
    ): CellClickedEventArgs & { preventDefault: ReturnType<typeof vi.fn> } {
        return {
            kind: "cell",
            location: cell,
            bounds: { x: cell[0] * 100, y: 36 + cell[1] * 32, width: 100, height: 32 },
            localEventX: 10,
            localEventY: 10,
            isFillHandle: false,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            isTouch: false,
            isEdge: false,
            button: 2,
            buttons: 2,
            scrollEdge: [0, 0],
            preventDefault: vi.fn(),
        } as never;
    }

    test('"More options…" calls the app\'s handler with the original arguments', async () => {
        const onHeaderMenuClick = vi.fn();
        const onHeaderContextMenu = vi.fn();
        const onCellContextMenu = vi.fn();
        const { h } = contacts({}, { props: { onHeaderMenuClick, onHeaderContextMenu, onCellContextMenu } });
        await settle();

        act(() => core().onHeaderMenuClick?.(col.persona, bounds));
        await settle();
        expect(onHeaderMenuClick).not.toHaveBeenCalled();
        await pick("More options…");
        expect(menu()).toBeNull();
        expect(onHeaderMenuClick).toHaveBeenCalledTimes(1);
        expect(onHeaderMenuClick.mock.calls[0][0]).toBe(col.persona);
        expect(onHeaderMenuClick.mock.calls[0][1]).toBe(bounds);

        const headerEvent = { bounds, preventDefault: vi.fn() } as unknown as HeaderClickedEventArgs;
        act(() => core().onHeaderContextMenu?.(col.seniority, headerEvent));
        await settle();
        expect(headerEvent.preventDefault).toHaveBeenCalled();
        await pick("More options…");
        expect(onHeaderContextMenu.mock.calls[0][1]).toBe(headerEvent);

        const event = cellEvent([col.persona, 2]);
        act(() => core().onCellContextMenu?.([col.persona, 2], event));
        await settle();
        // The native context menu is suppressed for the AI menu.
        expect(event.preventDefault).toHaveBeenCalled();
        expect(onCellContextMenu).not.toHaveBeenCalled();
        await pick("More options…");
        expect(onCellContextMenu).toHaveBeenCalledTimes(1);
        expect(onCellContextMenu.mock.calls[0][0]).toEqual([col.persona, 2]);
        expect(onCellContextMenu.mock.calls[0][1]).toBe(event);
        // "More options…" leaves focus to the app's menu.
        expect(gridFocused(h)).toBe(false);

        // Without an app handler there's no "More options…".
        cleanup();
        const plain = contacts();
        await settle();
        act(() => core().onCellContextMenu?.([col.persona, 0], cellEvent([col.persona, 0])));
        await settle();
        expect(labels()).not.toContain("More options…");
        plain.h.api().cancel();
    });

    test("non-AI targets reach the app unchanged: same arguments, and the event is not prevented", async () => {
        const onHeaderMenuClick = vi.fn();
        const onCellContextMenu = vi.fn();
        contacts({}, { props: { onHeaderMenuClick, onCellContextMenu } });
        await settle();
        act(() => core().onHeaderMenuClick?.(col.title, bounds));
        expect(onHeaderMenuClick).toHaveBeenCalledWith(col.title, bounds);
        const event = cellEvent([col.notes, 1]);
        act(() => core().onCellContextMenu?.([col.notes, 1], event));
        expect(onCellContextMenu.mock.calls[0][1]).toBe(event);
        expect(event.preventDefault).not.toHaveBeenCalled();
        await settle();
        expect(menu()).toBeNull();
    });

    test('menus: "compose" never opens the built-in menu; the app renders api.getMenuItems', async () => {
        const onHeaderMenuClick = vi.fn();
        const onCellContextMenu = vi.fn();
        const { jev, h } = contacts(
            { menus: "compose" },
            { props: { columns: menuColumns, onHeaderMenuClick, onCellContextMenu } }
        );
        await settle();
        expect(core().onHeaderMenuClick).toBe(onHeaderMenuClick);
        expect(core().onCellContextMenu).toBe(onCellContextMenu);

        await clickHeaderMenu(h, col.persona);
        expect(onHeaderMenuClick).toHaveBeenCalledWith(col.persona, expect.anything());
        await rightClickCell(col.persona, 0);
        expect(onCellContextMenu).toHaveBeenCalledWith([col.persona, 0], expect.anything());
        await gridKey(h, { key: "F10", shiftKey: true });
        expect(menu()).toBeNull();
        expect(h.api().openMenu({ column: "persona" })).toBe(false);

        const items = h.api().getMenuItems({ column: "persona" });
        expect(items.map(item => item.id)).toEqual([
            "fill-column-empty",
            "fill-selection",
            "accept-eligible",
            "review-next",
            "reject-all",
            "retry-failed",
            "rerun-stale",
        ]);
        expect(items[0]).toMatchObject({
            label: "Fill empty cells in persona (4 rows in filtered contacts)",
            disabled: false,
        });
        // The right-click above selected the cell, so the selection fill counts it.
        expect(items[1]).toMatchObject({ label: "Fill selected cells (1)", disabled: false });
        expect(items[2]).toMatchObject({ disabled: true, disabledReason: "No suggestions ready to accept" });
        expect(
            h
                .api()
                .getMenuItems({ cell: ["r1", "persona"] })
                .map(item => item.id)
        ).toEqual(["fill-selection", "fill-selection-empty", "accept", "reject", "inspect", "retry"]);
        expect(h.api().getMenuItems({ column: "company" })).toEqual([]);
        // Building the items sends nothing; running one does.
        expect(jev.requests).toHaveLength(0);
        act(() => items[0].run());
        await settle();
        expect(jev.requests).toHaveLength(4);
        // A disabled item does nothing.
        act(() => items[2].run());
        await settle();
        expect(jev.requests).toHaveLength(4);
    });

    test('menus: "off" leaves the app\'s handlers, the API and the shortcuts', async () => {
        const onHeaderMenuClick = vi.fn();
        const { jev, h } = contacts({ menus: "off" }, { props: { columns: menuColumns, onHeaderMenuClick } });
        await settle();
        await clickHeaderMenu(h, col.persona);
        expect(onHeaderMenuClick).toHaveBeenCalledTimes(1);
        expect(menu()).toBeNull();
        h.setSelection(rangeSelection(col.persona, 0));
        await gridKey(h, { key: "F10", shiftKey: true });
        expect(menu()).toBeNull();
        await gridKey(h, { key: "f", keyCode: 70, ctrlKey: true, altKey: true });
        expect(jev.requests).toHaveLength(1);
    });
});

describe("menu entries", () => {
    test('"Fill and apply…" appears only for columns with autoApply, and "Cancel" only during a run', async () => {
        const { jev, h } = contacts({
            columns: {
                persona: { ...persona, policy: { autoApply: { minProbability: 0.95 } } },
                seniority: contactConfig({ mode: "custom", send: vi.fn() }, () => "").columns.seniority,
            },
        });
        await settle();
        expect(
            h
                .api()
                .getMenuItems({ column: "persona" })
                .map(item => item.id)
        ).toContain("fill-apply");
        expect(
            h
                .api()
                .getMenuItems({ column: "seniority" })
                .map(item => item.id)
        ).not.toContain("fill-apply");
        h.setSelection(rangeSelection(col.seniority, 0));
        expect(
            h
                .api()
                .getMenuItems({ cell: ["r1", "seniority"] })
                .map(item => item.id)
        ).not.toContain("fill-apply");
        h.setSelection(rangeSelection(col.persona, 0, 2, 1));
        expect(
            h
                .api()
                .getMenuItems({ cell: ["r1", "persona"] })
                .map(item => item.id)
        ).toContain("fill-apply");

        expect(
            h
                .api()
                .getMenuItems()
                .map(item => item.id)
        ).not.toContain("cancel");
        act(() => {
            h.api().fill("selection");
        });
        await settle();
        const cancel = h
            .api()
            .getMenuItems({ column: "persona" })
            .find(item => item.id === "cancel");
        expect(cancel?.label).toBe("Cancel");
        act(() => cancel?.run());
        await settle();
        expect(jev.waiting()).toBe(0);
        expect(h.api().getRunState().active).toHaveLength(0);
        expect(
            h
                .api()
                .getMenuItems()
                .map(item => item.id)
        ).not.toContain("cancel");
    });

    test("result entries count and act on the column's results", async () => {
        const { jev, h } = contacts();
        await settle();
        act(() => {
            h.api().fill("column-empty", { columns: ["persona"] });
        });
        await jev.release();
        // VP 0.9 and CFO 0.85 are suggested; Engineer 0.6 is review; Intern is none-of-the-above (suggested).
        const items = h.api().getMenuItems({ column: "persona" });
        expect(items.find(item => item.id === "accept-eligible")?.label).toBe("Accept 3 eligible");
        expect(items.find(item => item.id === "review-next")?.label).toBe("Review 1");
        act(() => items.find(item => item.id === "accept-eligible")?.run());
        await settle();
        expect(h.row("r1").persona).toBe("Champion");
        expect(h.row("r2").persona).toBe("ECON");
        // Review results are never included in "Accept N eligible".
        expect(h.row("r3").persona).toBe("");
        expect(h.api().getCellState("r3", "persona")?.status).toBe("review");

        act(() =>
            h
                .api()
                .getMenuItems({ column: "persona" })
                .find(item => item.id === "review-next")
                ?.run()
        );
        await settle();
        expect(h.selection().current?.cell).toEqual([col.persona, 2]);
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Needs review");
    });
});

describe("result entries and rows a filter hides", () => {
    const extraRows = [
        { id: "r5", company: "Hooli", title: "VP Ops", notes: "", persona: "", seniority: "", ownsBudget: null },
        { id: "r6", company: "Stark", title: "VP Eng", notes: "", persona: "", seniority: "", ownsBudget: null },
        { id: "r7", company: "Wayne", title: "Engineer", notes: "", persona: "", seniority: "", ownsBudget: null },
        { id: "r8", company: "Wonka", title: "Intern", notes: "", persona: "", seniority: "", ownsBudget: null },
        { id: "r9", company: "Tyrell", title: "CFO", notes: "", persona: "", seniority: "", ownsBudget: null },
    ];

    /**
     * Persona filled for `rows` of r1..r9 (every row by default). Persona shows
     * from confidence 0.5 and is ready from 0.88, so VP is suggested, CFO review
     * and Engineer withheld. The first and sixth requests (r1, r6) fail, and
     * the Interns (r4, r8) go stale.
     */
    async function filled(rows: readonly string[] | "displayed" = "displayed") {
        const jev = gatedJev({ rules: contactRules, errors: [{ kind: "invalid-request", calls: [0, 5] }] });
        const h = renderAIGrid({
            rows: [...contactRows(), ...extraRows],
            columns: contactColumns,
            aiFill: ({ getRowId }) =>
                contactConfig(jev.connection, getRowId, {
                    rowScope: () => ({ rows, label: "contacts" }),
                    columns: {
                        persona: {
                            ...persona,
                            policy: { show: { minConfidence: 0.5 }, ready: { minProbability: 0.88 } },
                        },
                    },
                }),
        });
        await settle();
        act(() => {
            h.api().fill("column-empty");
        });
        await jev.release();
        const ids = rows === "displayed" ? h.view() : rows;
        for (const id of ids) {
            if (h.row(id).title === "Intern") h.patch(id, { title: "Intern (summer)" });
        }
        h.api().notifyRowsChanged(ids.filter(id => h.row(id).title === "Intern (summer)"));
        await settle();
        return { jev, h };
    }

    const status = (h: Awaited<ReturnType<typeof filled>>["h"], rowId: string) =>
        h.api().getCellState(rowId, "persona")?.status;
    const byId = (items: readonly { id: string }[], id: string) => items.find(item => item.id === id);

    test("the counts cover displayed rows only, and each item runs what its label counts", async () => {
        const { jev, h } = await filled();
        expect(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].map(id => status(h, id))).toEqual([
            "error",
            "review",
            "withheld",
            "stale",
            "suggested",
            "error",
            "withheld",
            "stale",
            "review",
        ]);
        // The filter hides r1..r4: an error, a review, a withheld and a stale result.
        h.setView(["r5", "r6", "r7", "r8", "r9"]);
        await settle();

        const column = h.api().getMenuItems({ column: "persona" });
        expect(column.slice(2).map(item => [item.id, item.label, item.disabled])).toEqual([
            ["accept-eligible", "Accept 1 eligible", false],
            ["review-next", "Review 1", false],
            ["reject-all", "Reject all suggestions", false],
            ["retry-failed", "Retry 1 failed", false],
            ["rerun-stale", "Re-run 1 stale", false],
        ]);
        const grid = h.api().getMenuItems();
        expect(byId(grid, "retry-failed")).toMatchObject({ label: "Retry 1 failed", disabled: false });
        expect(byId(grid, "rerun-stale")).toMatchObject({ label: "Re-run 1 stale", disabled: false });
        expect(byId(grid, "review-next")).toMatchObject({ label: "Review next", disabled: false });
        // The built-in menu shows the same items, and building them sent nothing.
        const sent = jev.requests.length;
        act(() => {
            h.api().openMenu({ column: "persona" });
        });
        await settle();
        expect(menuItems().map(item => [item.label, item.disabled])).toEqual([
            ...column.map(item => [item.label, item.disabled]),
        ]);
        expect(jev.requests).toHaveLength(sent);

        // "Review 1" reaches r9, the displayed review result, and not the hidden r2.
        await pick("Review 1");
        expect(h.selection().current?.cell).toEqual([col.persona, 4]);
        fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
        await settle();

        // "Retry 1 failed" starts a run of one cell: r6. The hidden r1 keeps its error.
        act(() => {
            h.api().openMenu({ column: "persona" });
        });
        await settle();
        await pick("Retry 1 failed");
        expect(h.api().getRunState().active.map(run => run.total)).toEqual([1]);
        expect(jev.requests).toHaveLength(sent + 1);
        await jev.release();
        expect(status(h, "r6")).toBe("suggested");
        expect(status(h, "r1")).toBe("error");

        // "Re-run 1 stale" re-runs r8 only.
        act(() => {
            h.api().openMenu({ column: "persona" });
        });
        await settle();
        await pick("Re-run 1 stale");
        expect(h.api().getRunState().active.map(run => run.total)).toEqual([1]);
        expect(jev.requests).toHaveLength(sent + 2);
        await jev.release();
        expect(status(h, "r8")).not.toBe("stale");
        expect(status(h, "r4")).toBe("stale");
    });

    test('"Reject all suggestions" rejects what api.reject({ column, filter: "all" }) rejects', async () => {
        const first = await filled();
        first.h.setView(["r5", "r6", "r7", "r8", "r9"]);
        await settle();
        const expected = first.h.api().reject({ column: "persona", filter: "all" });
        const rejectedByApi = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].filter(
            id => status(first.h, id) === "rejected"
        );
        cleanup();

        const { h } = await filled();
        h.setView(["r5", "r6", "r7", "r8", "r9"]);
        await settle();
        act(() => byId(h.api().getMenuItems({ column: "persona" }), "reject-all")?.run());
        await settle();
        const rejected = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].filter(
            id => status(h, id) === "rejected"
        );
        // Suggested, review, withheld and stale, hidden rows included; the failed results stay.
        expect(rejected).toEqual(rejectedByApi);
        expect(rejected).toEqual(["r2", "r3", "r4", "r5", "r7", "r8", "r9"]);
        expect(expected).toBe(7);
        expect(byId(h.api().getMenuItems({ column: "persona" }), "reject-all")).toMatchObject({
            disabled: true,
            disabledReason: "Nothing to reject",
        });
    });

    test("results only on hidden rows leave the items disabled, in the menus and the status bar", async () => {
        const { jev, h } = await filled(["r1", "r2", "r3", "r4"]);
        expect(["r1", "r2", "r3", "r4"].map(id => status(h, id))).toEqual(["error", "review", "withheld", "stale"]);
        h.setView(["r5", "r6", "r7", "r8", "r9"]);
        await settle();

        const column = h.api().getMenuItems({ column: "persona" });
        expect(byId(column, "review-next")).toMatchObject({ label: "Review 0", disabled: true });
        expect(byId(column, "retry-failed")).toMatchObject({
            label: "Retry 0 failed",
            disabled: true,
            disabledReason: "Nothing to retry: 1 not loaded yet",
        });
        expect(byId(column, "rerun-stale")).toMatchObject({
            label: "Re-run 0 stale",
            disabled: true,
            disabledReason: "Nothing to re-run: 1 not loaded yet",
        });
        const grid = h.api().getMenuItems();
        expect(byId(grid, "review-next")).toMatchObject({ disabled: true, disabledReason: "Nothing to review" });
        expect(byId(grid, "retry-failed")).toMatchObject({ label: "Retry 0 failed", disabled: true });
        expect(byId(grid, "rerun-stale")).toMatchObject({ label: "Re-run 0 stale", disabled: true });

        // The status bar offers only enabled actions, so neither "Review next" nor "Retry failed".
        const bar = statusBar() as HTMLElement;
        expect(bar.textContent).toContain("Done:");
        expect(
            [...bar.querySelectorAll("button")].map(button => button.textContent).filter(text => text !== "×")
        ).toEqual([]);

        const sent = jev.requests.length;
        for (const item of [...column, ...grid]) act(() => item.run());
        await settle();
        expect(jev.requests).toHaveLength(sent);
    });
});

describe("menu keyboard (§8.1)", () => {
    test("arrow keys, Home, End, type-ahead, Enter and Space; Esc and Tab close and return focus", async () => {
        const { jev, h } = contacts();
        await settle();
        h.setSelection(rangeSelection(col.persona, 0));
        await gridKey(h, { key: "F10", shiftKey: true });
        const items = () => menuItems().map(item => item.element);
        const key = async (k: string) => {
            fireEvent.keyDown(document.activeElement as HTMLElement, { key: k });
            await settle();
        };
        expect(menu()?.getAttribute("role")).toBe("menu");
        expect(document.activeElement).toBe(items()[0]);
        await key("ArrowDown");
        expect(document.activeElement).toBe(items()[1]);
        await key("ArrowUp");
        await key("ArrowUp");
        expect(document.activeElement).toBe(items().at(-1));
        await key("Home");
        expect(document.activeElement).toBe(items()[0]);
        await key("End");
        expect(document.activeElement).toBe(items().at(-1));
        await key("i");
        expect(document.activeElement?.textContent).toBe("Inspect…This cell has no result");
        // Type-ahead moves to the next item starting with the letter, wrapping around.
        await key("r");
        expect(document.activeElement?.firstElementChild?.textContent).toBe("Retry");
        await key("r");
        expect(document.activeElement?.firstElementChild?.textContent).toBe("Reject");
        // Enter on a disabled item does nothing.
        await key("Enter");
        expect(menu()).not.toBeNull();
        await key("Tab");
        expect(menu()).toBeNull();
        expect(gridFocused(h)).toBe(true);

        await gridKey(h, { key: "F10", shiftKey: true });
        await key(" ");
        expect(menu()).toBeNull();
        expect(jev.requests).toHaveLength(1);
        expect(gridFocused(h)).toBe(true);
    });

    test("a click outside closes the menu without taking focus", async () => {
        const { h } = contacts();
        await settle();
        h.setSelection(rangeSelection(col.persona, 0));
        await gridKey(h, { key: "F10", shiftKey: true });
        const outside = document.createElement("button");
        document.body.append(outside);
        outside.focus();
        fireEvent.pointerDown(outside);
        await settle();
        expect(menu()).toBeNull();
        expect(document.activeElement).toBe(outside);
        outside.remove();
    });

    test("a whole selected AI column opens the column menu from the keyboard", async () => {
        const { h } = contacts();
        await settle();
        h.setSelection({
            ...rangeSelection(col.seniority, 0),
            columns: CompactSelection.fromSingleSelection(col.seniority),
        });
        await gridKey(h, { key: "ContextMenu" });
        expect(menu()?.getAttribute("aria-label")).toBe("AI Fill: seniority");
        expect(labels()[0]).toBe("Fill empty cells in seniority (4 rows in filtered contacts)");
    });
});
