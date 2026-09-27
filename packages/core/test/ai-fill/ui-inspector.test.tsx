/* eslint-disable sonarjs/no-duplicate-string */
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AICommitEvent } from "../../src/ai-fill/config/results.js";
import type { AIFillConfig } from "../../src/ai-fill/config/types.js";
import { sendClick, standardBeforeEach } from "../test-utils.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { persona } from "./fixtures/definitions.js";
import { gatedJev, rangeSelection, renderAIGrid, settle } from "./fixtures/harness.js";
import { cellPoint, definitions, dialog, gridFocused, gridKey } from "./fixtures/ui.js";

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

/** The contacts grid with every AI cell of r1–r4 filled and answered. */
async function filled(overrides: Partial<AIFillConfig> = {}) {
    const jev = gatedJev({ rules: contactRules });
    const commits: AICommitEvent[] = [];
    const h = renderAIGrid({
        rows: contactRows(),
        columns: contactColumns,
        aiFill: ({ getRowId }) =>
            contactConfig(jev.connection, getRowId, { onCommit: event => commits.push(event), ...overrides }),
    });
    await settle();
    h.setSelection(rangeSelection(col.persona, 0, 3, 4));
    act(() => {
        h.api().fill("selection");
    });
    await jev.release();
    return { jev, h, commits };
}

function inspect(h: Awaited<ReturnType<typeof filled>>["h"], cell: readonly [string, string]): HTMLElement {
    let opened = false;
    act(() => {
        opened = h.api().openInspector(cell);
    });
    expect(opened).toBe(true);
    return dialog() as HTMLElement;
}

/** The bars in the inspector, as "label p" strings. */
function bars(root: HTMLElement): string[] {
    const cells = [...root.querySelectorAll(".gdg-ai-bars > span")];
    const out: string[] = [];
    for (let i = 0; i < cells.length; i += 3) out.push(`${cells[i].textContent} ${cells[i + 2].textContent}`);
    return out;
}

describe("inspector content (§8.5)", () => {
    test("Choice: value, decision with the exact value and threshold, ranked alternatives, confidence, model", async () => {
        const { jev, h } = await filled();
        const calls = jev.send.mock.calls.length;
        const open = inspect(h, ["r3", "persona"]);
        expect(open.getAttribute("role")).toBe("dialog");
        expect(open.classList.contains("gdg-ai-inspector")).toBe(true);
        expect(open.closest("#portal")).not.toBeNull();
        expect(within(open).getByRole("heading").textContent).toBe("persona: Needs review");
        const facts = definitions(open);
        expect(facts.Suggested).toBe("Champion");
        expect(facts.Decision).toContain("0.6");
        expect(facts.Decision).toContain("minProbability 0.6, threshold 0.8");
        // The versioned model id that answered (the mock's), not the requested alias.
        expect(facts.Model).toBe("jev-mock-1.0.0");
        expect(open.querySelector("time")?.getAttribute("dateTime")).toMatch(/^\d{4}-\d\d-\d\dT/);
        // Every option, ranked by probability, with the selected one marked.
        expect(bars(open)).toEqual([
            "Champion 0.6",
            "Economic buyer 0.4",
            "user 0",
            "None of the above 0",
            "Not enough information 0",
        ]);
        expect(open.querySelector(".gdg-ai-selected")?.textContent).toBe("Champion");
        // Confidence is shown separately and labelled as model confidence, never as accuracy.
        expect(open.textContent).toContain(
            "Model confidence 0.4. Probability and confidence are model outputs, not measured accuracy."
        );
        // The inspector selected the cell; opening it sent nothing.
        expect(h.selection().current?.cell).toEqual([col.persona, 2]);
        expect(jev.send.mock.calls.length).toBe(calls);
    });

    test("alternatives follow presentation.alternatives", async () => {
        const { h } = await filled({
            columns: {
                persona: {
                    ...persona,
                    policy: { ready: { minProbability: 0.8 } },
                    presentation: { alternatives: { count: 1, minProbability: 0.1 } },
                },
            },
        });
        expect(bars(inspect(h, ["r3", "persona"]))).toEqual(["Champion 0.6", "Economic buyer 0.4"]);
    });

    test("Score: the rubric legend with each level's probability, and the confidence", async () => {
        const { h } = await filled();
        const open = inspect(h, ["r1", "seniority"]);
        expect(definitions(open).Suggested).toBe("Executive");
        expect(open.textContent).toContain("Score 3 on a 0–3 rubric");
        expect(bars(open)).toEqual(["0: IC 0", "1: Manager 0", "2: Director 0.1", "3: Executive 0.9"]);
        expect(open.querySelector(".gdg-ai-selected")?.textContent).toBe("3: Executive");
        expect(open.textContent).toContain("Model confidence 0.9");
    });

    test("Noul: the probability and its band; no confidence is invented", async () => {
        const { h } = await filled();
        let open = inspect(h, ["r1", "ownsBudget"]);
        expect(within(open).getByRole("heading").textContent).toBe("ownsBudget: Needs review");
        expect(definitions(open).Suggested).toBe("Uncertain (no value to write)");
        expect(bars(open)).toEqual(["Probability of yes 0.5"]);
        expect(open.textContent).toContain("Band: Uncertain (between 0.2 and 0.8: review)");
        expect(open.textContent).not.toContain("confidence");
        open = inspect(h, ["r2", "ownsBudget"]);
        expect(open.textContent).toContain("Band: Yes (at or above 0.8)");
        open = inspect(h, ["r3", "ownsBudget"]);
        // A strong no is a usable value, not an error.
        expect(within(open).getByRole("heading").textContent).toBe("ownsBudget: Suggested");
        expect(open.textContent).toContain("Band: No (at or below 0.2)");
    });

    test("a withheld result explains why, and offers only Choose, Reject and Edit manually", async () => {
        const { h } = await filled({
            columns: { persona: { ...persona, policy: { show: { minProbability: 0.8 } } } },
        });
        const open = inspect(h, ["r3", "persona"]);
        expect(within(open).getByRole("heading").textContent).toBe("persona: Withheld");
        expect(definitions(open).Decision).toContain("minProbability 0.6, threshold 0.8");
        expect((within(open).getByText("Accept") as HTMLButtonElement).disabled).toBe(true);
        expect((within(open).getByText("Reject") as HTMLButtonElement).disabled).toBe(false);
        expect(within(open).getByLabelText("Choose a value")).toBeDefined();
    });

    test("openInspector returns false for a cell without a result or one that isn't displayed", async () => {
        const { h } = await filled();
        let result = true;
        act(() => {
            result = h.api().openInspector(["r1", "company"]);
        });
        expect(result).toBe(false);
        h.setView(["r1", "r2"]);
        act(() => {
            result = h.api().openInspector(["r3", "persona"]);
        });
        expect(result).toBe(false);
        expect(dialog()).toBeNull();
    });
});

describe("inspector actions commit through the grid's edit path", () => {
    test("Enter accepts; Esc closes; focus returns to the grid", async () => {
        const { h, commits } = await filled();
        let open = inspect(h, ["r3", "persona"]);
        expect(document.activeElement).toBe(open);
        fireEvent.keyDown(open, { key: "Escape" });
        await settle();
        expect(dialog()).toBeNull();
        expect(gridFocused(h)).toBe(true);

        open = inspect(h, ["r3", "persona"]);
        fireEvent.keyDown(open, { key: "Enter" });
        await settle();
        expect(dialog()).toBeNull();
        expect(h.row("r3").persona).toBe("Champion");
        expect(h.log.filter(line => line.startsWith("onCellEdited"))).toEqual([
            `onCellEdited [${col.persona},2] "Champion"`,
        ]);
        expect(commits.at(-1)?.source).toBe("accept");
        expect(gridFocused(h)).toBe(true);
    });

    test("Reject writes nothing; Re-run evaluates the rejected result again", async () => {
        const { jev, h } = await filled();
        const open = inspect(h, ["r1", "persona"]);
        fireEvent.click(within(open).getByText("Reject"));
        await settle();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("rejected");
        expect(h.row("r1").persona).toBe("");
        expect(h.edits).toHaveLength(0);

        fireEvent.click(within(inspect(h, ["r1", "persona"])).getByText("Re-run"));
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("suggested");
    });

    test("Choose writes a configured option, level or Yes/No through the same commit path", async () => {
        const { h, commits } = await filled();
        let open = inspect(h, ["r3", "persona"]);
        const select = within(open).getByLabelText("Choose a value") as HTMLSelectElement;
        expect([...select.options].map(option => option.textContent)).toEqual([
            "Choose…",
            "Champion",
            "Economic buyer",
            "user",
        ]);
        // "None of the above" is a semantic outcome without a value, so there is nothing to write for it.
        fireEvent.change(select, { target: { value: "1" } });
        fireEvent.click(within(open).getByText("Write choice"));
        await settle();
        expect(h.row("r3").persona).toBe("ECON");
        expect(commits.at(-1)).toMatchObject({ source: "choose", edits: [{ rowId: "r3", columnId: "persona" }] });
        expect(h.api().getCellState("r3", "persona")?.status).toBe("accepted");

        open = inspect(h, ["r1", "seniority"]);
        fireEvent.change(within(open).getByLabelText("Choose a value"), { target: { value: "1" } });
        fireEvent.click(within(open).getByText("Write choice"));
        await settle();
        expect(h.row("r1").seniority).toBe("Manager");

        open = inspect(h, ["r1", "ownsBudget"]);
        const yesNo = within(open).getByLabelText("Choose a value") as HTMLSelectElement;
        expect([...yesNo.options].map(option => option.textContent)).toEqual(["Choose…", "Yes", "No"]);
        fireEvent.change(yesNo, { target: { value: "1" } });
        fireEvent.click(within(open).getByText("Write choice"));
        await settle();
        expect(h.row("r1").ownsBudget).toBe(false);
    });

    test("Choose still runs the commit guards: validateCell can block it", async () => {
        const jev = gatedJev({ rules: contactRules });
        const h = renderAIGrid({
            rows: contactRows(),
            columns: contactColumns,
            aiFill: ({ getRowId }) => contactConfig(jev.connection, getRowId),
            props: { validateCell: (_cell, value) => value.data !== "ECON" },
        });
        await settle();
        h.setSelection(rangeSelection(col.persona, 2));
        act(() => {
            h.api().fill("selection");
        });
        await jev.release();
        const open = inspect(h, ["r3", "persona"]);
        fireEvent.change(within(open).getByLabelText("Choose a value"), { target: { value: "1" } });
        fireEvent.click(within(open).getByText("Write choice"));
        await settle();
        expect(h.row("r3").persona).toBe("");
        expect(h.api().getCellState("r3", "persona")?.blocked?.reason).toBe("validation");
    });

    test("Retry re-runs a failed cell; Re-run re-runs a stale one", async () => {
        let fail = true;
        const jev = gatedJev({
            rules: [
                {
                    type: "choice",
                    answer: request => {
                        if (fail) throw new Error("synthetic failure");
                        const rule = contactRules[0];
                        return typeof rule.answer === "function" ? rule.answer(request as never) : rule.answer;
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
        h.setSelection(rangeSelection(col.persona, 0));
        act(() => {
            h.api().fill("selection");
        });
        await jev.release();
        let open = inspect(h, ["r1", "persona"]);
        expect(within(open).getByRole("heading").textContent).toBe("persona: Error");
        expect(definitions(open).Error).toContain("synthetic failure");
        fail = false;
        fireEvent.click(within(open).getByText("Retry"));
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("suggested");

        // A source edit makes the result stale; Re-run asks again with the new input.
        h.patch("r1", { title: "CFO" });
        act(() => h.api().notifyRowsChanged(["r1"]));
        await settle();
        open = inspect(h, ["r1", "persona"]);
        expect(within(open).getByRole("heading").textContent).toBe(
            "persona: Stale: the inputs or the definition changed"
        );
        const requests = jev.requests.length;
        fireEvent.click(within(open).getByText("Re-run"));
        await jev.release();
        expect(jev.requests.length).toBe(requests + 1);
        expect(h.api().getCellState("r1", "persona")?.output?.display).toBe("Economic buyer");
    });

    test("Edit manually closes the inspector and opens the cell's normal editor", async () => {
        const { h } = await filled();
        const open = inspect(h, ["r3", "persona"]);
        fireEvent.click(within(open).getByText("Edit manually"));
        await settle();
        expect(dialog()).toBeNull();
        const editor = document.querySelector("#portal textarea") as HTMLTextAreaElement | null;
        expect(editor).not.toBeNull();
        expect(h.selection().current?.cell).toEqual([col.persona, 2]);
    });

    test("a click on the cell's AI marker opens the inspector; a click elsewhere in the cell doesn't", async () => {
        const { h } = await filled();
        const canvas = h.canvas();
        const { clientY } = cellPoint(col.persona, 2);
        sendClick(canvas, { clientX: col.persona * 100 + 40, clientY });
        await settle();
        expect(dialog()).toBeNull();
        sendClick(canvas, { clientX: col.persona * 100 + 95, clientY });
        await settle();
        expect(within(dialog() as HTMLElement).getByRole("heading").textContent).toBe("persona: Needs review");
    });

    test("Alt+ArrowDown opens the inspector for the focused cell, and falls through when it has no result", async () => {
        const { h } = await filled();
        h.setSelection(rangeSelection(col.persona, 1));
        await gridKey(h, { key: "ArrowDown", altKey: true });
        expect(within(dialog() as HTMLElement).getByRole("heading").textContent).toBe("persona: Suggested");
        fireEvent.keyDown(dialog() as HTMLElement, { key: "Escape" });
        await settle();
        h.setSelection(rangeSelection(col.company, 1));
        await gridKey(h, { key: "ArrowDown", altKey: true });
        expect(dialog()).toBeNull();
    });
});
