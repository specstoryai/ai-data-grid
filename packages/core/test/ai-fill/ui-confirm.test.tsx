/* eslint-disable sonarjs/no-duplicate-string */
import { cleanup, fireEvent, within } from "@testing-library/react";
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

function contacts(overrides: Partial<AIFillConfig> = {}) {
    const jev = gatedJev({ rules: contactRules });
    const h = renderAIGrid({
        rows: rows(),
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
