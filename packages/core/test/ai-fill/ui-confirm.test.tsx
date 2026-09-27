/* eslint-disable sonarjs/no-duplicate-string */
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AIFillConfig } from "../../src/ai-fill/config/types.js";
import { standardBeforeEach } from "../test-utils.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { persona } from "./fixtures/definitions.js";
import { gatedJev, type HarnessRow, rangeSelection, renderAIGrid, settle } from "./fixtures/harness.js";
import { definitions, dialog, gridFocused, gridKey, pick } from "./fixtures/ui.js";

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

/**
 * Six contacts: r1 and r4 are empty, r2 already has a persona, r3 is locked
 * (read-only), r5 hasn't loaded, and r6 has no company or title (missing input).
 */
function rows(): HarnessRow[] {
    const base = contactRows();
    return [
        base[0],
        { ...base[1], persona: "Economic buyer" },
        { ...base[2], locked: true },
        base[3],
        { id: "r5", loading: true },
        { id: "r6", company: "", title: "", notes: "", persona: "", seniority: "", ownsBudget: null },
    ];
}

function contacts(overrides: Partial<AIFillConfig> = {}, data: HarnessRow[] = rows()) {
    const jev = gatedJev({ rules: contactRules });
    const h = renderAIGrid({
        rows: data,
        columns: contactColumns,
        aiFill: ({ getRowId }) =>
            contactConfig(jev.connection, getRowId, {
                rowScope: () => ({ rows: "displayed", label: "filtered contacts" }),
                ...overrides,
                execution: { timeoutMs: 600_000, backoff: { jitter: 0 }, ...overrides.execution },
            }),
    });
    return { jev, h };
}

function openColumnMenu(h: ReturnType<typeof contacts>["h"], column: string): void {
    expect(h.api().openMenu({ column })).toBe(true);
}

describe("scope statement (§8.2, SPST-16 AC 4)", () => {
    test("above confirmAbove, the dialog states the scope and nothing is sent until it's confirmed", async () => {
        const { jev, h } = contacts({ execution: { confirmAbove: 1 } });
        await settle();
        openColumnMenu(h, "persona");
        await settle();
        await pick("Fill empty cells in persona (2 rows in filtered contacts)");

        const open = dialog() as HTMLElement;
        expect(open.getAttribute("aria-modal")).toBe("true");
        expect(within(open).getByRole("heading").textContent).toBe("Fill");
        expect(open.closest("#portal")).not.toBeNull();
        expect(open.classList.contains("click-outside-ignore")).toBe(true);
        // The counts match the data: r1 and r4 are evaluated; r2 populated, r3 read-only, r5 unloaded, r6 missing input.
        expect(definitions(open)).toEqual({
            Columns: "persona",
            Rows: "filtered contacts",
            "To evaluate": "2 cells",
            Skipped: "1 already have a value1 read-only1 not loaded yet1 missing input",
            Requests: "About 2",
            Writes: "None: results are suggestions until you accept them",
        });
        expect(jev.requests).toHaveLength(0);

        // Focus is on the confirm button; Esc cancels and returns focus to the grid.
        expect(document.activeElement?.textContent).toBe("Fill 2 cells");
        fireEvent.keyDown(open, { key: "Escape" });
        await settle();
        expect(dialog()).toBeNull();
        expect(gridFocused(h)).toBe(true);
        expect(jev.requests).toHaveLength(0);

        openColumnMenu(h, "persona");
        await settle();
        await pick("Fill empty cells in persona (2 rows in filtered contacts)");
        fireEvent.click(within(dialog() as HTMLElement).getByText("Fill 2 cells"));
        await settle();
        expect(dialog()).toBeNull();
        expect(jev.requests).toHaveLength(2);
        expect(jev.requests.map(request => JSON.stringify(request.state))).toEqual([
            expect.stringContaining("Acme"),
            expect.stringContaining("Umbrella"),
        ]);
    });

    test("at or below confirmAbove (default 100), a fill starts at once", async () => {
        const { jev, h } = contacts();
        await settle();
        openColumnMenu(h, "persona");
        await settle();
        await pick("Fill empty cells in persona (2 rows in filtered contacts)");
        expect(dialog()).toBeNull();
        expect(jev.requests).toHaveLength(2);
    });

    test('a "column" fill always asks, even for one cell, and counts populated cells as evaluated', async () => {
        const { jev, h } = contacts({
            columns: {
                persona: { ...persona, overwrite: "apply", fillScopes: ["column", "selection"] },
            },
        });
        await settle();
        openColumnMenu(h, "persona");
        await settle();
        await pick("Fill every cell in persona (3 rows in filtered contacts)…");
        const open = dialog() as HTMLElement;
        expect(definitions(open)["To evaluate"]).toBe("3 cells");
        expect(definitions(open).Skipped).toBe("1 read-only1 not loaded yet1 missing input");
        fireEvent.click(within(open).getByText("Cancel"));
        await settle();
        expect(jev.requests).toHaveLength(0);
    });

    test('"Fill and apply" always asks, and says results will be written', async () => {
        const { jev, h } = contacts({
            columns: { persona: { ...persona, policy: { autoApply: { minProbability: 0.8 } } } },
        });
        await settle();
        openColumnMenu(h, "persona");
        await settle();
        await pick("Fill and apply…");
        const open = dialog() as HTMLElement;
        expect(within(open).getByRole("heading").textContent).toBe("Fill and apply");
        expect(definitions(open).Writes).toBe("Results that pass the auto-apply policy are written to the grid");
        fireEvent.click(within(open).getByText("Fill and apply 2 cells"));
        await jev.release();
        // VP (0.9) passes autoApply and is written; Intern (none of the above) has no value to write.
        expect(h.row("r1").persona).toBe("Champion");
        expect(jev.requests).toHaveLength(2);
    });

    test("the fill shortcut asks above confirmAbove too; a fill that can't run explains why", async () => {
        const { jev, h } = contacts({ execution: { confirmAbove: 1, maxCellsPerRun: 2 } });
        await settle();
        h.setSelection(rangeSelection(col.persona, 0, 2, 4));
        await gridKey(h, { key: "f", keyCode: 70, ctrlKey: true, altKey: true });
        const open = dialog() as HTMLElement;
        // r1 and r4 × persona and seniority, plus r2's and r3's seniority: 6 cells, over maxCellsPerRun.
        expect(within(open).getByRole("alert").textContent).toBe(
            "This fill covers 6 cells; the limit is execution.maxCellsPerRun (2)"
        );
        expect(within(open).queryByText(/^Fill /)).toBeNull();
        fireEvent.click(within(open).getByText("Close"));
        await settle();
        expect(jev.requests).toHaveLength(0);
    });
});

describe("the scope changes while the dialog is open", () => {
    const applyConfig: Partial<AIFillConfig> = {
        columns: { persona: { ...persona, policy: { autoApply: { minProbability: 0.8 } } } },
    };
    const changedNotice = "The scope changed while this dialog was open. Check it and confirm again.";

    function liveRegion(): string | null | undefined {
        return document.querySelector("#portal .gdg-ai-sr")?.textContent;
    }

    test("rows added: confirming shows the new scope and asks again, and sends nothing until then", async () => {
        const { jev, h } = contacts(applyConfig, contactRows());
        h.setView(["r1"]);
        await settle();
        openColumnMenu(h, "persona");
        await settle();
        await pick("Fill and apply…");
        let open = dialog() as HTMLElement;
        expect(definitions(open)["To evaluate"]).toBe("1 cells");

        // A filter is cleared while the dialog is open: r1–r4 are displayed now.
        h.setView(["r1", "r2", "r3", "r4"]);
        await settle();
        expect(definitions(dialog() as HTMLElement)["To evaluate"]).toBe("1 cells");
        fireEvent.click(within(dialog() as HTMLElement).getByText("Fill and apply 1 cells"));
        await settle();

        open = dialog() as HTMLElement;
        expect(open).not.toBeNull();
        expect(within(open).getByText(changedNotice)).toBeTruthy();
        expect(definitions(open)["To evaluate"]).toBe("4 cells");
        expect(definitions(open).Requests).toBe("About 4");
        expect(liveRegion()).toBe("The scope changed while the dialog was open. Check it and confirm again");
        expect(open.contains(document.activeElement)).toBe(true);
        expect(document.activeElement?.textContent).toBe("Fill and apply 4 cells");
        expect(jev.requests).toHaveLength(0);
        expect(h.api().getRunState().active).toEqual([]);
        expect(h.row("r1").persona).toBe("");

        fireEvent.click(within(open).getByText("Fill and apply 4 cells"));
        await settle();
        expect(dialog()).toBeNull();
        expect(gridFocused(h)).toBe(true);
        expect(
            h
                .api()
                .getRunState()
                .active.map(run => run.total)
        ).toEqual([4]);
        await jev.release();
        expect(jev.requests).toHaveLength(4);
        expect(h.row("r1").persona).toBe("Champion");
    });

    test("same count, different cells: confirming asks again, and the fill covers the cells shown", async () => {
        const { jev, h } = contacts(applyConfig, contactRows());
        h.setView(["r1"]);
        await settle();
        openColumnMenu(h, "persona");
        await settle();
        await pick("Fill and apply…");
        h.setView(["r2"]);
        await settle();
        fireEvent.click(within(dialog() as HTMLElement).getByText("Fill and apply 1 cells"));
        await settle();

        const open = dialog() as HTMLElement;
        expect(within(open).getByText(changedNotice)).toBeTruthy();
        expect(definitions(open)["To evaluate"]).toBe("1 cells");
        expect(jev.requests).toHaveLength(0);

        fireEvent.click(within(open).getByText("Fill and apply 1 cells"));
        await settle();
        expect(dialog()).toBeNull();
        expect(jev.requests.map(request => JSON.stringify(request.state))).toEqual([expect.stringContaining("Globex")]);
        expect(JSON.stringify(jev.requests)).not.toContain("Acme");
    });

    test("rows removed: confirming from getMenuItems asks again; an unchanged scope then starts at once", async () => {
        const { jev, h } = contacts(applyConfig, contactRows());
        await settle();
        const item = h
            .api()
            .getMenuItems({ column: "persona" })
            .find(entry => entry.id === "fill-apply");
        act(() => item?.run());
        await settle();
        expect(definitions(dialog() as HTMLElement)["To evaluate"]).toBe("4 cells");

        h.setView(["r1", "r2"]);
        await settle();
        fireEvent.click(within(dialog() as HTMLElement).getByText("Fill and apply 4 cells"));
        await settle();
        const open = dialog() as HTMLElement;
        expect(within(open).getByText(changedNotice)).toBeTruthy();
        expect(definitions(open)["To evaluate"]).toBe("2 cells");
        expect(jev.requests).toHaveLength(0);

        fireEvent.click(within(open).getByText("Fill and apply 2 cells"));
        await settle();
        expect(dialog()).toBeNull();
        await jev.release();
        expect(jev.requests.map(request => JSON.stringify(request.state))).toEqual([
            expect.stringContaining("Acme"),
            expect.stringContaining("Globex"),
        ]);
    });
});
