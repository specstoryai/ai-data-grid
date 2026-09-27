/* eslint-disable sonarjs/no-duplicate-string */
import { cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AIFillConfig } from "../../src/ai-fill/config/types.js";
import { standardBeforeEach } from "../test-utils.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { gatedJev, rangeSelection, renderAIGrid, settle } from "./fixtures/harness.js";
import { dialog, gridFocused, gridKey, menu, menuItems } from "./fixtures/ui.js";

vi.mock("../../src/common/resize-detector", () => ({
    useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
}));

beforeEach(() => {
    standardBeforeEach();
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

function contacts(overrides: Partial<AIFillConfig> = {}) {
    const jev = gatedJev({ rules: contactRules });
    const h = renderAIGrid({
        rows: contactRows(),
        columns: contactColumns,
        aiFill: ({ getRowId }) => contactConfig(jev.connection, getRowId, overrides),
    });
    return { jev, h };
}

const fillKey = { key: "f", keyCode: 70, ctrlKey: true, altKey: true };

describe("keyboard-only workflow (§8.1, §8.5)", () => {
    test("open the menu, fill, inspect, accept, reject, Esc, with focus back on the grid each time", async () => {
        const { jev, h } = contacts();
        await settle();
        h.setSelection(rangeSelection(col.notes, 0));
        // Arrow to the persona cell, open the menu and fill it.
        await gridKey(h, { key: "ArrowRight" });
        expect(h.selection().current?.cell).toEqual([col.persona, 0]);
        await gridKey(h, { key: "F10", shiftKey: true });
        expect(document.activeElement).toBe(menuItems()[0].element);
        expect(menuItems()[0].label).toBe("Fill selected cells (1)");
        fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
        await settle();
        expect(menu()).toBeNull();
        expect(gridFocused(h)).toBe(true);
        await jev.release();

        // Inspect it and accept with Enter.
        await gridKey(h, { key: "ArrowDown", altKey: true });
        const inspector = dialog() as HTMLElement;
        expect(within(inspector).getByRole("heading").textContent).toBe("persona: Suggested");
        expect(document.activeElement).toBe(inspector);
        fireEvent.keyDown(inspector, { key: "Enter" });
        await settle();
        expect(dialog()).toBeNull();
        expect(gridFocused(h)).toBe(true);
        expect(h.row("r1").persona).toBe("Champion");

        // Next row: fill with the shortcut, then reject.
        await gridKey(h, { key: "ArrowDown" });
        await gridKey(h, fillKey);
        await jev.release();
        expect(h.api().getCellState("r2", "persona")?.status).toBe("suggested");
        await gridKey(h, { key: "Backspace", ctrlKey: true });
        expect(h.api().getCellState("r2", "persona")?.status).toBe("rejected");
        expect(h.row("r2").persona).toBe("");

        // Next row: fill, inspect, and leave the inspector with Esc.
        await gridKey(h, { key: "ArrowDown" });
        await gridKey(h, fillKey);
        await jev.release();
        await gridKey(h, { key: "ArrowDown", altKey: true });
        expect(dialog()).not.toBeNull();
        // Tab stays inside the dialog.
        const buttons = within(dialog() as HTMLElement).getAllByRole("button");
        (buttons.at(-1) as HTMLElement).focus();
        fireEvent.keyDown(dialog() as HTMLElement, { key: "Tab" });
        expect(dialog()?.contains(document.activeElement)).toBe(true);
        fireEvent.keyDown(dialog() as HTMLElement, { key: "Escape" });
        await settle();
        expect(dialog()).toBeNull();
        expect(gridFocused(h)).toBe(true);
        expect(h.api().getCellState("r3", "persona")?.status).toBe("review");

        // Ctrl+Enter accepts the selected suggestion, review included.
        await gridKey(h, { key: "Enter", ctrlKey: true });
        expect(h.row("r3").persona).toBe("Champion");

        // Screen readers hear what the actions did.
        expect(document.querySelector("#portal .gdg-ai-sr")?.textContent).toBe("Accepted 1 suggestion");
    });
});

describe("configurable shortcuts", () => {
    test("each shortcut can be rebound or turned off", async () => {
        const { jev, h } = contacts({ shortcuts: { inspect: "alt+i", accept: false, fill: "shift+alt+f" } });
        await settle();
        h.setSelection(rangeSelection(col.persona, 0));
        await gridKey(h, fillKey);
        expect(jev.requests).toHaveLength(0);
        await gridKey(h, { key: "F", keyCode: 70, shiftKey: true, altKey: true });
        expect(jev.requests).toHaveLength(1);
        await jev.release();

        await gridKey(h, { key: "ArrowDown", altKey: true });
        expect(dialog()).toBeNull();
        h.setSelection(rangeSelection(col.persona, 0));
        await gridKey(h, { key: "i", keyCode: 73, altKey: true });
        expect(dialog()).not.toBeNull();
        fireEvent.keyDown(dialog() as HTMLElement, { key: "Escape" });
        await settle();

        await gridKey(h, { key: "Enter", ctrlKey: true });
        expect(h.row("r1").persona).toBe("");
        // The ones left alone keep their defaults.
        await gridKey(h, { key: "Backspace", ctrlKey: true });
        expect(h.api().getCellState("r1", "persona")?.status).toBe("rejected");
    });

    test("shortcuts: false turns every shortcut off", async () => {
        const { jev, h } = contacts({ shortcuts: false });
        await settle();
        h.setSelection(rangeSelection(col.persona, 0));
        await gridKey(h, fillKey);
        await gridKey(h, { key: "F10", shiftKey: true });
        expect(jev.requests).toHaveLength(0);
        expect(menu()).toBeNull();
    });
});
