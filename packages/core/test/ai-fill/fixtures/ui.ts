import { act, fireEvent, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { sendClick } from "../../test-utils.js";
import type { Harness } from "./harness.js";
import { settle } from "./harness.js";

/**
 * Helpers for the built-in UI tests. The harness grid has 100 px columns, a
 * 36 px header and 32 px rows.
 */

/** The middle of a cell, in client coordinates. */
export function cellPoint(col: number, row: number): { clientX: number; clientY: number } {
    return { clientX: col * 100 + 50, clientY: 36 + row * 32 + 16 };
}

/** Clicks a column's header ▾, the way a user does. */
export async function clickHeaderMenu(h: Harness, col: number): Promise<void> {
    const canvas = h.canvas();
    const point = { clientX: col * 100 + 90, clientY: 16 };
    fireEvent.pointerMove(canvas, point);
    await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
    });
    sendClick(canvas, point);
    await settle();
}

/** Right-clicks a cell. */
export async function rightClickCell(col: number, row: number): Promise<void> {
    const scroller = document.getElementsByClassName("dvn-scroller").item(0) as HTMLElement;
    fireEvent.contextMenu(scroller, cellPoint(col, row));
    await settle();
}

/** Presses a key on the grid, the way the focused grid receives it. */
export async function gridKey(h: Harness, init: KeyboardEventInit & { keyCode?: number }): Promise<void> {
    fireEvent.keyDown(h.canvas(), init);
    await settle();
}

/** The open AI menu, or `null`. */
export function menu(): HTMLElement | null {
    return screen.queryByRole("menu");
}

/** The open menu's items: the label (without the detail line), whether it's disabled, and the element. */
export function menuItems(): { label: string; disabled: boolean; element: HTMLElement }[] {
    const open = menu();
    if (open === null) throw new Error("no menu is open");
    return within(open)
        .getAllByRole("menuitem")
        .map(element => ({
            label: element.firstElementChild?.textContent ?? "",
            disabled: element.getAttribute("aria-disabled") === "true",
            element,
        }));
}

/** Clicks the open menu's item with this label. */
export async function pick(label: string): Promise<void> {
    const item = menuItems().find(entry => entry.label === label);
    if (item === undefined)
        throw new Error(
            `no menu item "${label}" in ${menuItems()
                .map(i => i.label)
                .join(", ")}`
        );
    fireEvent.click(item.element);
    await settle();
}

/** Whether the grid has keyboard focus. */
export function gridFocused(h: Harness): boolean {
    const active = document.activeElement;
    return active !== null && (active === h.canvas() || h.canvas().contains(active));
}

/** The open dialog (confirm or inspector), or `null`. */
export function dialog(): HTMLElement | null {
    return screen.queryByRole("dialog");
}

/** The built-in status bar inside the grid. */
export function statusBar(): HTMLElement | null {
    return document.querySelector(".gdg-ai-grid .gdg-ai-status");
}

/** A `<dl>` in a dialog, as `{ term: definition }`. */
export function definitions(root: HTMLElement): Record<string, string> {
    const out: Record<string, string> = {};
    for (const term of root.querySelectorAll("dt")) {
        out[term.textContent ?? ""] = term.nextElementSibling?.textContent ?? "";
    }
    return out;
}
