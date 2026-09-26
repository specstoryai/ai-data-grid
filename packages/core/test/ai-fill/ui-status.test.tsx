/* eslint-disable sonarjs/no-duplicate-string */
import * as React from "react";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AIFillStatus, type AIFillConfig } from "../../src/index.js";
import { standardBeforeEach } from "../test-utils.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { persona } from "./fixtures/definitions.js";
import { gatedJev, rangeSelection, renderAIGrid, settle } from "./fixtures/harness.js";
import { dialog, gridKey, statusBar } from "./fixtures/ui.js";

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

const buttons = (root: HTMLElement) =>
    within(root)
        .queryAllByRole("button")
        .map(button => button.textContent);

describe("status bar (§8.3)", () => {
    test("shows progress and Cancel during a run, then the summary and its actions", async () => {
        const { jev, h } = contacts();
        await settle();
        const bar = statusBar() as HTMLElement;
        // A polite live region that floats over the grid's bottom edge, inside the grid's own element.
        expect(bar.getAttribute("role")).toBe("status");
        expect(bar.getAttribute("aria-live")).toBe("polite");
        expect(bar.classList.contains("gdg-ai-status-floating")).toBe(true);
        expect(bar.textContent).toBe("");

        h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        act(() => {
            h.api().fill("selection");
        });
        await settle();
        expect(bar.textContent).toContain("Evaluating persona: 0 / 4");
        expect(buttons(bar)).toEqual(["Cancel"]);

        // The grid stays interactive during the run: keyboard navigation still moves the selection.
        await gridKey(h, { key: "ArrowDown" });
        expect(h.selection().current?.cell).toEqual([col.persona, 1]);

        await jev.release((_request, index) => index === 0);
        expect(bar.textContent).toContain("Evaluating persona: 1 / 4");
        await jev.release();
        expect(bar.textContent).toContain("Done: 3 suggested · 1 review · 0 withheld · 0 errors · 0 skipped");
        expect(buttons(bar)).toEqual(["Review next", "Accept 3 eligible", "×"]);

        fireEvent.click(within(bar).getByText("Accept 3 eligible"));
        await settle();
        expect(h.row("r1").persona).toBe("Champion");
        expect(h.row("r3").persona).toBe("");

        // "Review next" selects the review result and opens the inspector on it.
        fireEvent.click(within(bar).getByText("Review next"));
        await settle();
        expect(h.selection().current?.cell).toEqual([col.persona, 2]);
        expect(dialog()?.textContent).toContain("persona: Needs review");

        fireEvent.click(within(bar).getByLabelText("Dismiss"));
        await settle();
        expect(bar.textContent).toBe("");
    });

    test("Cancel stops the run and the summary says so; failures offer Retry failed", async () => {
        let fail = true;
        const jev = gatedJev({
            rules: [
                {
                    type: "choice",
                    answer: ({ state }) => {
                        if (fail && JSON.stringify(state).includes("CFO")) throw new Error("synthetic failure");
                        const rule = contactRules[0];
                        return typeof rule.answer === "function" ? rule.answer({ state } as never) : rule.answer;
                    },
                },
            ],
        });
        const h = renderAIGrid({
            rows: contactRows(),
            columns: contactColumns,
            aiFill: ({ getRowId }) =>
                contactConfig(jev.connection, getRowId, { execution: { maxRetries: 0, timeoutMs: 600_000 } }),
        });
        await settle();
        const bar = statusBar() as HTMLElement;
        h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        act(() => {
            h.api().fill("selection");
        });
        await settle();
        fireEvent.click(within(bar).getByText("Cancel"));
        await settle();
        expect(bar.textContent).toContain("Cancelled: ");
        expect(jev.waiting()).toBe(0);

        act(() => {
            h.api().fill("selection");
        });
        await jev.release();
        expect(bar.textContent).toContain("1 errors");
        expect(buttons(bar)).toContain("Retry 1 failed");
        fail = false;
        fireEvent.click(within(bar).getByText("Retry 1 failed"));
        await jev.release();
        expect(h.api().getCellState("r2", "persona")?.status).toBe("suggested");
    });

    test("after Fill and apply the summary counts what was applied first, and a blocked result as suggested", async () => {
        const jev = gatedJev({ rules: contactRules });
        const validateCell = vi.fn((_cell: unknown, value: { data?: unknown }) => value.data !== "ECON");
        const h = renderAIGrid({
            rows: contactRows(),
            columns: contactColumns,
            props: { validateCell },
            aiFill: ({ getRowId }) =>
                contactConfig(jev.connection, getRowId, {
                    columns: {
                        persona: {
                            ...persona,
                            policy: { ready: { minProbability: 0.8 }, autoApply: { minProbability: 0.85 } },
                        },
                    },
                }),
        });
        await settle();
        const bar = statusBar() as HTMLElement;
        h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        act(() => {
            h.api().fill("selection", { mode: "apply" });
        });
        await jev.release();
        expect(h.row("r1").persona).toBe("Champion");
        expect(bar.textContent).toContain(
            "Done: 1 applied · 2 suggested · 1 review · 0 withheld · 0 errors · 0 skipped"
        );
    });

    test("statusBar: false hides the built-in bar, and <AIFillStatus> works on its own", async () => {
        const { jev, h } = contacts({ statusBar: false });
        await settle();
        expect(statusBar()).toBeNull();

        const view = render(<AIFillStatus api={h.api()} className="app-status" />);
        await settle();
        const own = view.container.querySelector(".gdg-ai-status") as HTMLElement;
        expect(own.classList.contains("app-status")).toBe(true);
        expect(own.getAttribute("role")).toBe("status");

        h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        act(() => {
            h.api().fill("selection");
        });
        await settle();
        expect(own.textContent).toContain("Evaluating persona: 0 / 2");
        await jev.release();
        expect(own.textContent).toContain("Done: 2 suggested");

        // Before AI Fill has loaded there is no API, and nothing renders.
        const empty = render(<AIFillStatus api={undefined} />);
        expect(empty.container.innerHTML).toBe("");
    });
});
