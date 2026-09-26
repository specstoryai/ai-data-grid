/* eslint-disable sonarjs/no-duplicate-string */
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GridCellKind, type EditableGridCell, type Item } from "../../src/internal/data-grid/data-grid-types.js";
import type { DataEditorProps, DataEditorRef } from "../../src/data-editor/data-editor.js";
import type { AICommitEvent, AIFillError, AIResultEvent } from "../../src/ai-fill/config/results.js";
import type { AIFillConfig } from "../../src/ai-fill/config/types.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { persona } from "./fixtures/definitions.js";
import { gatedJev, rangeSelection, renderAIGrid, settle } from "./fixtures/harness.js";

const spies = vi.hoisted(() => ({ coreProps: [] as unknown[] }));

vi.mock("../../src/common/resize-detector", () => ({
    useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
}));

// Records the props the core grid receives, so a test can make an edit the way the grid does.
vi.mock("../../src/data-editor/data-editor.js", async importOriginal => {
    const actual = await importOriginal<typeof import("../../src/data-editor/data-editor.js")>();
    const ReactModule = await import("react");
    const CoreSpy = ReactModule.forwardRef<DataEditorRef, Parameters<typeof actual.DataEditor>[0]>((props, ref) => {
        spies.coreProps.push(props);
        return ReactModule.createElement(actual.DataEditor, { ...props, ref });
    });
    return { ...actual, DataEditor: CoreSpy };
});

/** Edits a cell the way the grid's overlay editor does: through the props the core grid received. */
function gridEdit(cell: Item, text: string): void {
    const props = spies.coreProps.at(-1) as DataEditorProps;
    const value: EditableGridCell = { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: true };
    act(() => {
        if (props.onCellsEdited?.([{ location: cell, value }]) !== true) props.onCellEdited?.(cell, value);
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    spies.coreProps.length = 0;
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

async function pendingFill(overrides: Partial<AIFillConfig> = {}, mode: "suggest" | "apply" = "suggest") {
    const jev = gatedJev({ rules: contactRules });
    const results: AIResultEvent[] = [];
    const errors: AIFillError[] = [];
    const commits: AICommitEvent[] = [];
    let config: AIFillConfig | undefined;
    const h = renderAIGrid({
        rows: contactRows(),
        columns: contactColumns,
        onCellsEditedReturns: undefined,
        aiFill: ({ getRowId }) => {
            config = contactConfig(jev.connection, getRowId, {
                onResult: event => results.push(event),
                onError: error => errors.push(error),
                onCommit: event => commits.push(event),
                ...overrides,
            });
            return config;
        },
    });
    await settle();
    h.setSelection(rangeSelection(col.persona, 0, 1, 4));
    const run = h.api().fill("selection", { mode });
    await settle();
    expect(jev.waiting()).toBe(4);
    return { jev, h, run, results, errors, commits, config: () => config as AIFillConfig };
}

describe("AI Fill in the grid: identity while pending (SPST-16 AC 5)", () => {
    test("sorting and filtering while pending: each value lands on its own row id", async () => {
        const { jev, h, results } = await pendingFill();
        // Reverse the order and filter r3 out.
        h.setView(["r4", "r2", "r1"]);
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.output?.value).toBe("Champion");
        expect(h.api().getCellState("r2", "persona")?.output?.value).toBe("ECON");
        // r3 isn't displayed, so accept-all writes r1 and r2 only (r3's answer is dropped; see below).
        h.api().accept({ column: "persona", filter: "eligible" });
        expect(h.row("r1").persona).toBe("Champion");
        expect(h.row("r2").persona).toBe("ECON");
        // The writes went to the rows' current display positions: r1 is row 2 and r2 row 1.
        expect(h.edits.filter(e => e.via === "onCellEdited").flatMap(e => e.items.map(i => i.location))).toEqual([
            [col.persona, 2],
            [col.persona, 1],
        ]);
        // r3 was filtered out when its answer arrived: like a deleted row, it is dropped and never written.
        expect(results.find(r => r.rowId === "r3")).toMatchObject({ status: "cancelled", reason: "row-missing" });
        h.setView(["r1", "r2", "r3", "r4"]);
        expect(h.api().getCellState("r3", "persona")).toBeUndefined();
        expect(h.row("r3").persona).toBe("");
    });

    test("a decided result on a filtered-out row keeps its record, and accept-all leaves it alone", async () => {
        const { jev, h } = await pendingFill();
        await jev.release();
        h.api().accept({ cells: [["r3", "persona"]] });
        h.setView(["r1", "r2", "r4"]);
        expect(h.api().accept({ column: "persona", filter: "all" })).toBeDefined();
        expect(h.api().getCellState("r3", "persona")?.status).toBe("accepted");
        cleanup();

        const again = await pendingFill();
        await again.jev.release();
        again.h.setView(["r1", "r2", "r4"]);
        again.h.api().accept({ column: "persona", filter: "all" });
        again.h.setView(["r1", "r2", "r3", "r4"]);
        expect(again.h.api().getCellState("r3", "persona")?.status).toBe("review");
        expect(again.h.row("r3").persona).toBe("");
    });

    test("column reorder while pending: the value lands on the right column", async () => {
        const { jev, h } = await pendingFill();
        h.setColumnOrder(["persona", "company", "title", "notes", "seniority", "ownsBudget"]);
        await jev.release();
        h.api().accept({ cells: [["r1", "persona"]] });
        expect(h.edits[0].items[0].location).toEqual([0, 0]);
        expect(h.row("r1").persona).toBe("Champion");
        expect(h.row("r1").company).toBe("Acme");
    });

    test("a row deleted while pending: nothing is written, with reason row-missing", async () => {
        const { jev, h, results } = await pendingFill();
        h.remove("r2");
        await jev.release();
        expect(h.api().getCellState("r2", "persona")).toBeUndefined();
        expect(results.find(r => r.rowId === "r2")).toMatchObject({ status: "cancelled", reason: "row-missing" });
        h.api().accept({ column: "persona", filter: "all" });
        expect(h.edits.flatMap(e => e.items).every(i => i.location[1] < 3)).toBe(true);
    });

    test("a source edit in the grid while pending: stale, and nothing is written", async () => {
        const { jev, h } = await pendingFill();
        gridEdit([col.title, 0], "CFO");
        expect(h.row("r1").title).toBe("CFO");
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("stale");
        expect(h.api().accept({ cells: [["r1", "persona"]] })).toBeUndefined();
        expect(h.row("r1").persona).toBe("");
    });

    test("a destination edit while pending: manual and stale, never auto-applied or accepted by accept-all", async () => {
        const { jev, h } = await pendingFill(
            { columns: { persona: { ...persona, policy: { autoApply: { minProbability: 0.5 } } } } },
            "apply"
        );
        gridEdit([col.persona, 0], "Typed by hand");
        await jev.release();
        const state = h.api().getCellState("r1", "persona");
        expect(state).toMatchObject({ status: "stale", manual: true });
        h.api().accept({ column: "persona", filter: "all" });
        expect(h.row("r1").persona).toBe("Typed by hand");
        // The other rows were auto-applied.
        expect(h.row("r2").persona).toBe("ECON");
    });

    test("a definition change while pending: stale", async () => {
        const { jev, h, config } = await pendingFill();
        const current = config();
        h.setAIFill({
            ...current,
            columns: { ...current.columns, persona: { ...persona, instructions: "Which persona is this?" } },
        });
        await settle();
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("stale");
        expect(h.api().accept({ cells: [["r1", "persona"]] })).toBeUndefined();
    });

    test("an AI column removed while pending: its responses are ignored", async () => {
        const { jev, h, config } = await pendingFill();
        const { persona: _removed, ...others } = config().columns;
        h.setAIFill({ ...config(), columns: others });
        await settle();
        await jev.release();
        expect(h.api().getCellState("r1", "persona")).toBeUndefined();
        expect(h.api().getRunState().cells).toEqual({});
        expect(h.edits).toEqual([]);
    });

    test("cancel mid-run: no writes, and the prior records come back", async () => {
        const { jev, h, run } = await pendingFill();
        await jev.release();
        // Filling again after the inputs changed puts the cell in flight again; cancelling brings back the result.
        h.patch("r1", { notes: "new note" });
        h.api().notifyRowsChanged(["r1"]);
        expect(h.api().getCellState("r1", "persona")?.status).toBe("suggested");
        h.patch("r1", { title: "VP Product" });
        h.api().notifyRowsChanged(["r1"]);
        expect(h.api().getCellState("r1", "persona")?.status).toBe("stale");
        const second = h.api().rerunStale();
        expect(second.runId).not.toBe(run.runId);
        await settle();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("pending");
        h.api().cancel(second.runId);
        await settle();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("stale");
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("stale");
        expect(h.edits).toEqual([]);
        expect((await second.done).cancelled).toBe(true);
    });

    test("retry after a failure: exactly one commit", async () => {
        const jev = gatedJev({ rules: contactRules, errors: [{ kind: "invalid-request", calls: [0] }] });
        const commits: AICommitEvent[] = [];
        const h = renderAIGrid({
            rows: contactRows(),
            columns: contactColumns,
            aiFill: ({ getRowId }) =>
                contactConfig(jev.connection, getRowId, {
                    columns: { persona: { ...persona, policy: { autoApply: { minProbability: 0.5 } } } },
                    onCommit: event => commits.push(event),
                }),
        });
        await settle();
        h.setSelection(rangeSelection(col.persona, 0, 1, 1));
        h.api().fill("selection", { mode: "apply" });
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("error");
        h.api().retry();
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("applied");
        h.api().retry();
        h.api().accept({ cells: [["r1", "persona"]] });
        await jev.release();
        expect(commits).toHaveLength(1);
        expect(h.edits).toHaveLength(1);
    });

    test("out-of-order responses: only the latest applies", async () => {
        const { jev, h } = await pendingFill();
        // Change the input while pending, then fill again: two requests for r1 are in flight.
        h.patch("r1", { title: "CFO" });
        h.api().notifyRowsChanged(["r1"]);
        h.setSelection(rangeSelection(col.persona, 0, 1, 1));
        h.api().fill("selection");
        await settle();
        // Answer the newest request first, then the older one.
        await jev.release(undefined, true);
        const state = h.api().getCellState("r1", "persona");
        expect(state?.status).toBe("suggested");
        expect(state?.output?.value).toBe("ECON");
    });

    test("notifyRowsChanged re-fingerprints rows, and a commit re-checks fingerprints anyway", async () => {
        const { jev, h } = await pendingFill();
        await jev.release();
        // An external change the app doesn't report: the commit still catches it.
        h.patch("r2", { title: "Engineer" });
        expect(h.api().getCellState("r2", "persona")?.status).toBe("suggested");
        expect(h.api().accept({ cells: [["r2", "persona"]] })).toBeUndefined();
        expect(h.api().getCellState("r2", "persona")?.status).toBe("stale");
        expect(h.row("r2").persona).toBe("");
        // Reported: the result becomes stale at once.
        h.patch("r1", { company: "Other" });
        h.api().notifyRowsChanged(["r1"]);
        expect(h.api().getCellState("r1", "persona")?.status).toBe("stale");
        // A destination changed outside the grid is manual.
        h.patch("r4", { persona: "Set elsewhere" });
        h.api().notifyRowsChanged();
        expect(h.api().getCellState("r4", "persona")).toMatchObject({ status: "stale", manual: true });
    });
});

describe("AI Fill in the grid: rows.getRowIndex", () => {
    test("is used for id → row, and an index that maps back to another id counts as a missing row", async () => {
        const jev = gatedJev({ rules: contactRules });
        let view: () => readonly string[] = () => [];
        // Right for every row but r2, which it places on r1's row.
        const getRowIndex = vi.fn((id: string): number | undefined => (id === "r2" ? 0 : view().indexOf(id)));
        const h = renderAIGrid({
            rows: contactRows(),
            columns: contactColumns,
            aiFill: ({ getRowId }) => ({ ...contactConfig(jev.connection, getRowId), rows: { getRowId, getRowIndex } }),
        });
        view = h.view;
        await settle();
        h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        const run = h.api().fill("selection");
        expect(getRowIndex).toHaveBeenCalledWith("r1");
        expect(getRowIndex).toHaveBeenCalledWith("r2");
        // r2 is treated as gone and skipped; a wrong index never redirects a read or a write.
        expect(run.cells).toBe(1);
        expect(run.skipped.unloaded).toBe(1);
        await jev.release();
        expect(h.api().getCellState("r2", "persona")).toBeUndefined();
        // r1 commits at the row getRowIndex gives, after a re-sort.
        h.setView(["r3", "r1", "r2", "r4"]);
        h.api().accept({ cells: [["r1", "persona"]] });
        expect(h.edits[0].items[0].location).toEqual([col.persona, 1]);
        expect(h.row("r1").persona).toBe("Champion");
    });
});
