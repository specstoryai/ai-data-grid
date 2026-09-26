/* eslint-disable sonarjs/no-duplicate-string */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import {
    type EditableGridCell,
    GridCellKind,
    type Item,
    type ValidatedGridCell,
} from "../../src/internal/data-grid/data-grid-types.js";
import type { AICommitEvent, AIFillError } from "../../src/ai-fill/config/results.js";
import type { AIFillConfig, ChoiceColumnDefinition } from "../../src/ai-fill/config/types.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { persona, seniority } from "./fixtures/definitions.js";
import { gatedJev, type HarnessOptions, rangeSelection, renderAIGrid, settle } from "./fixtures/harness.js";

vi.mock("../../src/common/resize-detector", () => ({
    useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
}));

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

type Jev = ReturnType<typeof gatedJev>;

async function contacts(
    overrides: (jev: Jev) => Partial<AIFillConfig> = () => ({}),
    options: Partial<HarnessOptions> = {}
) {
    const jev = gatedJev({ rules: contactRules });
    const h = renderAIGrid({
        rows: contactRows(),
        columns: contactColumns,
        aiFill: ({ getRowId }) => contactConfig(jev.connection, getRowId, overrides(jev)),
        ...options,
    });
    await settle();
    return { jev, h };
}

describe("AI Fill in the grid: primitives end to end (SPST-16 AC 2)", () => {
    test("Choice, Score and Noul commit correctly typed values: option values, level mappings, 0 and false", async () => {
        const jev = gatedJev({ rules: contactRules });
        const commits: AICommitEvent[] = [];
        const h = renderAIGrid({
            rows: contactRows(),
            columns: [
                { id: "company", kind: "text" },
                { id: "title", kind: "text" },
                { id: "notes", kind: "text" },
                { id: "persona", kind: "text" },
                { id: "level", kind: "number" },
                { id: "levelLabel", kind: "text" },
                { id: "ownsBudget", kind: "boolean" },
            ],
            aiFill: ({ getRowId }) => ({
                connection: jev.connection,
                model: "jev-latest",
                rows: { getRowId },
                columns: {
                    persona,
                    level: { ...seniority, output: { store: "level" } },
                    levelLabel: { ...seniority, output: { store: "level-value" } },
                    ownsBudget: {
                        primitive: "noul",
                        instructions: "Does this contact own a budget?",
                        sources: ["title", "notes"],
                        output: {
                            store: "boolean",
                            bands: { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" },
                        },
                    },
                },
                onCommit: event => commits.push(event),
            }),
        });
        await settle();
        h.setSelection(rangeSelection(3, 0, 4, 4));
        const run = h.api().fill("selection");
        expect(run.cells).toBe(16);
        await jev.release();

        // Accept everything that was suggested (review results are left for later).
        for (const column of ["persona", "level", "levelLabel", "ownsBudget"]) {
            h.api().accept({ column, filter: "eligible" });
        }

        expect(h.row("r1").persona).toBe("Champion"); // label, as no value is configured
        expect(h.row("r2").persona).toBe("ECON"); // the option's configured value
        expect(h.row("r3").level).toBe(0); // a real 0, not empty
        expect(h.row("r1").level).toBe(3);
        expect(h.row("r1").levelLabel).toBe("exec");
        expect(h.row("r3").levelLabel).toBe("ic");
        expect(h.row("r2").ownsBudget).toBe(true);
        expect(h.row("r3").ownsBudget).toBe(false); // 0.02: a strong no is a value
        // 0.5 is between the bands: review, never written as false.
        expect(h.api().getCellState("r1", "ownsBudget")?.status).toBe("review");
        expect(h.row("r1").ownsBudget).toBeNull();
        // The Intern's persona is "none of the above", a semantic outcome without a value: accepted, nothing written.
        expect(h.api().getCellState("r4", "persona")?.status).toBe("accepted");
        expect(h.row("r4").persona).toBe("");

        const levelEdit = commits.flatMap(c => c.edits).find(e => e.rowId === "r3" && e.columnId === "level");
        expect(levelEdit?.next).toMatchObject({ kind: GridCellKind.Number, data: 0, displayData: "0" });
        const budgetEdit = commits.flatMap(c => c.edits).find(e => e.rowId === "r3" && e.columnId === "ownsBudget");
        expect(budgetEdit?.next).toMatchObject({ kind: GridCellKind.Boolean, data: false });
        expect(budgetEdit?.previous).toMatchObject({ kind: GridCellKind.Boolean, data: null });
    });

    test("a value that doesn't fit the destination is a type-mismatch error, and nothing is written", async () => {
        const jev = gatedJev({ rules: contactRules });
        const errors: AIFillError[] = [];
        const h = renderAIGrid({
            rows: contactRows(),
            columns: contactColumns,
            aiFill: ({ getRowId }) => ({
                connection: jev.connection,
                model: "jev-latest",
                rows: { getRowId },
                // A Choice (string values) into a Boolean column.
                columns: { ownsBudget: persona },
                onError: error => errors.push(error),
            }),
        });
        await settle();
        h.setSelection(rangeSelection(col.ownsBudget, 0, 1, 2));
        h.api().fill("selection");
        await jev.release();
        const state = h.api().getCellState("r1", "ownsBudget");
        expect(state?.status).toBe("error");
        expect(state?.error?.kind).toBe("type-mismatch");
        expect(h.api().accept({ cells: [["r1", "ownsBudget"]] })).toBeUndefined();
        expect(h.edits).toEqual([]);
        expect(h.row("r1").ownsBudget).toBeNull();
    });

    test("a toCell that no longer fits at commit time blocks the commit as type-mismatch", async () => {
        const errors: AIFillError[] = [];
        let fits = true;
        const { jev, h } = await contacts(() => ({
            columns: {
                persona: {
                    ...persona,
                    output: {
                        toCell: (value, current) =>
                            fits && current.kind === GridCellKind.Text
                                ? { ...current, data: String(value), displayData: String(value) }
                                : undefined,
                    },
                } as ChoiceColumnDefinition,
            },
            onError: error => errors.push(error),
        }));
        h.setSelection(rangeSelection(col.persona, 0, 1, 1));
        h.api().fill("selection");
        await jev.release();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("suggested");
        fits = false;
        expect(h.api().accept({ cells: [["r1", "persona"]] })).toBeUndefined();
        expect(h.api().getCellState("r1", "persona")?.blocked?.reason).toBe("type-mismatch");
        expect(errors.map(e => e.kind)).toContain("type-mismatch");
        expect(h.edits).toEqual([]);
    });
});

describe("AI Fill in the grid: scopes and skip reasons (§8.2)", () => {
    test("selection-empty skips populated, read-only, unloaded, not-applicable and missing-input cells", async () => {
        const rows = contactRows();
        rows[0] = { ...rows[0], persona: "Champion" }; // populated
        rows[1] = { ...rows[1], locked: true }; // read-only persona
        rows[2] = { ...rows[2], loading: true }; // unloaded
        rows.push({ id: "r5", company: "", title: "", notes: "", persona: "", seniority: "", ownsBudget: null }); // no input
        rows.push({
            id: "r6",
            company: "Hooli",
            title: "Board",
            notes: "",
            persona: "",
            seniority: "",
            ownsBudget: null,
        });
        const jev = gatedJev({ rules: contactRules });
        const h = renderAIGrid({
            rows,
            columns: contactColumns,
            aiFill: ({ getRowId }) =>
                contactConfig(jev.connection, getRowId, {
                    columns: {
                        persona: { ...persona, applies: ctx => ctx.rowId !== "r6" },
                    },
                }),
        });
        await settle();
        h.setSelection(rangeSelection(col.persona, 0, 1, 6));
        const run = h.api().fill("selection-empty");
        expect(run.error).toBeUndefined();
        expect(run.cells).toBe(1); // only r4
        expect(run.skipped).toEqual({
            populated: 1,
            "read-only": 1,
            unloaded: 1,
            "missing-input": 1,
            "not-applicable": 1,
        });
        await jev.release();
        expect(jev.requests).toHaveLength(1);

        // Filling the same cells again is served from what is already decided.
        const again = h.api().fill("selection-empty");
        expect(again.cells).toBe(0);
        expect(again.skipped.cached).toBe(1);
        await settle();
        expect(jev.requests).toHaveLength(1);
    });

    test("column-empty needs rowScope, and covers only the displayed rows", async () => {
        const { jev, h } = await contacts();
        const without = h.api().fill("column-empty", { columns: ["persona"] });
        expect(without.error?.kind).toBe("configuration");
        expect(jev.requests).toHaveLength(0);

        cleanup();
        const scoped = await contacts(() => ({ rowScope: () => ({ rows: "displayed", label: "filtered contacts" }) }));
        // Filter r2 out of the view.
        scoped.h.setView(["r1", "r3", "r4"]);
        const run = scoped.h.api().fill("column-empty", { columns: ["persona"] });
        expect(run.cells).toBe(3);
        await scoped.jev.release();
        expect(scoped.h.api().getCellState("r2", "persona")).toBeUndefined();
        expect(scoped.jev.requests.map(r => JSON.stringify(r.state))).not.toContainEqual(
            expect.stringContaining("Globex")
        );
    });

    test("column is offered only when the column lists it", async () => {
        const { h } = await contacts(() => ({ rowScope: () => ({ rows: "displayed", label: "contacts" }) }));
        const run = h.api().fill("column", { columns: ["persona"] });
        expect(run.cells).toBe(0);
        expect(run.skipped["not-applicable"]).toBe(4);
    });

    test("an explicit rowScope list covers the listed rows that are displayed", async () => {
        const { jev, h } = await contacts(() => ({ rowScope: () => ({ rows: ["r2", "r3"], label: "two contacts" }) }));
        const run = h.api().fill("column-empty", { columns: ["persona"] });
        expect(run.cells).toBe(2);
        await jev.release();
        expect(h.api().getCellState("r1", "persona")).toBeUndefined();
        expect(h.api().getCellState("r2", "persona")?.status).toBe("suggested");
    });
});

describe("AI Fill in the grid: accept, reject and commit guards (SPST-16 AC 4)", () => {
    async function filled(
        overrides: (jev: Jev) => Partial<AIFillConfig> = () => ({}),
        options: Partial<HarnessOptions> = {}
    ) {
        const setup = await contacts(overrides, options);
        setup.h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        setup.h.api().fill("selection");
        await setup.jev.release();
        return setup;
    }

    test("accept one, accept selected and accept all eligible; review is never in accept-all", async () => {
        const { h } = await filled();
        // r1 champion 0.9 and r2 economic 0.85 are suggested; r3 champion 0.6 is review.
        expect(h.api().getCellState("r3", "persona")?.status).toBe("review");

        expect(h.api().accept({ cells: [["r1", "persona"]] })).toBeDefined();
        expect(h.row("r1").persona).toBe("Champion");

        // Accept all eligible writes r2 but not the review result r3.
        h.api().accept({ column: "persona", filter: "eligible" });
        expect(h.row("r2").persona).toBe("ECON");
        expect(h.row("r3").persona).toBe("");
        expect(h.api().getCellState("r3", "persona")?.status).toBe("review");

        // Accepting the selection includes the review result, because the user picked it.
        h.setSelection(rangeSelection(col.persona, 2, 1, 1));
        h.api().accept({ selection: true });
        expect(h.row("r3").persona).toBe("Champion");
        expect(h.api().getCellState("r3", "persona")?.status).toBe("accepted");
    });

    test("reject writes nothing, and a withheld result can't be written", async () => {
        const { h } = await filled(() => ({
            columns: { persona: { ...persona, policy: { show: { minProbability: 0.8 } } } },
        }));
        expect(h.api().getCellState("r3", "persona")?.status).toBe("withheld");
        expect(h.api().accept({ cells: [["r3", "persona"]] })).toBeUndefined();
        expect(h.api().reject({ cells: [["r1", "persona"]] })).toBe(1);
        expect(h.api().getCellState("r1", "persona")?.status).toBe("rejected");
        expect(h.api().accept({ cells: [["r1", "persona"]] })).toBeUndefined();
        expect(h.edits).toEqual([]);
        expect(h.row("r1").persona).toBe("");
        expect(h.row("r3").persona).toBe("");
    });

    test("overwrite: never skips populated cells, suggest writes them only on accept, apply auto-applies them", async () => {
        const rows = contactRows().map(r => ({ ...r, persona: "Old" }));
        const autoApply = { minProbability: 0.85 };

        // never
        let setup = await contacts(() => ({}), { rows });
        setup.h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        let run = setup.h.api().fill("selection");
        expect(run.cells).toBe(0);
        expect(run.skipped.populated).toBe(2);
        cleanup();

        // suggest: evaluated in the selection scope, never auto-applied, written by accept.
        setup = await contacts(
            () => ({
                columns: {
                    persona: { ...persona, overwrite: "suggest", policy: { autoApply } },
                },
            }),
            { rows }
        );
        setup.h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        run = setup.h.api().fill("selection", { mode: "apply" });
        expect(run.cells).toBe(2);
        await setup.jev.release();
        expect(setup.h.row("r1").persona).toBe("Old");
        expect(setup.h.api().getCellState("r1", "persona")?.status).toBe("suggested");
        setup.h.api().accept({ cells: [["r1", "persona"]] });
        expect(setup.h.row("r1").persona).toBe("Champion");
        // selection-empty never touches populated cells, whatever the policy.
        expect(setup.h.api().fill("selection-empty").skipped.populated).toBe(2);
        cleanup();

        // apply: auto-applied in "Fill and apply".
        setup = await contacts(
            () => ({
                columns: { persona: { ...persona, overwrite: "apply", policy: { autoApply } } },
            }),
            { rows }
        );
        setup.h.setSelection(rangeSelection(col.persona, 0, 1, 2));
        setup.h.api().fill("selection", { mode: "apply" });
        await setup.jev.release();
        expect(setup.h.row("r1").persona).toBe("Champion");
        expect(setup.h.row("r2").persona).toBe("ECON");
        expect(setup.h.api().getCellState("r1", "persona")?.status).toBe("applied");
    });

    test("a cell that became read-only blocks the commit; nothing is written", async () => {
        const errors: AIFillError[] = [];
        const { h } = await filled(() => ({ onError: error => errors.push(error) }));
        h.patch("r1", { locked: true });
        expect(h.api().accept({ cells: [["r1", "persona"]] })).toBeUndefined();
        const state = h.api().getCellState("r1", "persona");
        expect(state?.status).toBe("suggested");
        expect(state?.blocked?.reason).toBe("read-only");
        expect(errors.at(-1)).toMatchObject({ kind: "commit-blocked", cells: [["r1", "persona"]] });
        expect(h.edits).toEqual([]);
    });

    test("validateCell false blocks the commit, and a coerced cell is written", async () => {
        const validateCell = vi.fn((_cell: Item, value: EditableGridCell): boolean | ValidatedGridCell => {
            if (value.data === "ECON") return false;
            if (value.data === "Champion") {
                return { kind: GridCellKind.Text, data: "CHAMPION", displayData: "CHAMPION", allowOverlay: true };
            }
            return true;
        });
        const { h } = await filled(() => ({}), { props: { validateCell } });
        h.api().accept({ column: "persona", filter: "eligible" });
        expect(h.row("r1").persona).toBe("CHAMPION");
        expect(h.row("r2").persona).toBe("");
        expect(h.api().getCellState("r2", "persona")?.blocked?.reason).toBe("validation");
        expect(validateCell).toHaveBeenCalledWith(
            [col.persona, 0],
            expect.objectContaining({ data: "Champion" }),
            expect.objectContaining({ data: "" })
        );
    });

    test("onCommit carries the previous and next cells, and the metadata", async () => {
        const commits: AICommitEvent[] = [];
        const { h } = await filled(() => ({ onCommit: event => commits.push(event) }));
        const commitId = h.api().accept({ cells: [["r1", "persona"]] });
        expect(commits).toHaveLength(1);
        expect(commits[0]).toMatchObject({
            commitId,
            source: "accept",
            edits: [
                {
                    rowId: "r1",
                    columnId: "persona",
                    location: [col.persona, 0],
                    previous: { data: "" },
                    next: { data: "Champion" },
                    metadata: { rowId: "r1", columnId: "persona", requestedModel: "jev-latest" },
                },
            ],
        });
        expect(h.api().getCellState("r1", "persona")?.commitId).toBe(commitId);
        // Accepting again writes nothing.
        expect(h.api().accept({ cells: [["r1", "persona"]] })).toBeUndefined();
        expect(h.edits).toHaveLength(1);
    });

    test("auto-apply happens only in Fill and apply, and only for candidates that pass every guard", async () => {
        const autoApply = { minProbability: 0.85 };
        const policy = { ready: { minProbability: 0.8 }, autoApply };
        const validateCell = vi.fn((_cell: unknown, value: { data?: unknown }) => value.data !== "ECON");

        // Suggest mode: nothing is written.
        let setup = await contacts(() => ({ columns: { persona: { ...persona, policy } } }));
        setup.h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        setup.h.api().fill("selection");
        await setup.jev.release();
        expect(setup.h.edits).toEqual([]);
        expect(setup.h.api().getCellState("r1", "persona")?.status).toBe("suggested");
        cleanup();

        // Fill and apply: r1 (0.9) is applied, r2 (0.85) fails validateCell and stays suggested, r3 is review.
        setup = await contacts(() => ({ columns: { persona: { ...persona, policy } } }), { props: { validateCell } });
        setup.h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        setup.h.api().fill("selection", { mode: "apply" });
        await setup.jev.release();
        expect(setup.h.row("r1").persona).toBe("Champion");
        expect(setup.h.api().getCellState("r1", "persona")?.status).toBe("applied");
        expect(setup.h.row("r2").persona).toBe("");
        expect(setup.h.api().getCellState("r2", "persona")).toMatchObject({
            status: "suggested",
            blocked: { reason: "validation" },
        });
        expect(setup.h.api().getCellState("r3", "persona")?.status).toBe("review");
        expect(setup.h.row("r3").persona).toBe("");
    });

    test("a grid without edit handlers can't commit", async () => {
        const { h } = await filled(() => ({}), { noOnCellEdited: true });
        expect(h.api().accept({ cells: [["r1", "persona"]] })).toBeUndefined();
        expect(h.api().getCellState("r1", "persona")?.blocked?.reason).toBe("read-only");
    });
});

describe("AI Fill in the grid: column targets (§3.1)", () => {
    /** Persona and seniority filled for every row; the first request of each column (r1) fails. */
    async function filledColumns(overrides: Partial<AIFillConfig> = {}) {
        const jev = gatedJev({ rules: contactRules, errors: [{ kind: "invalid-request", calls: [0, 4] }] });
        const h = renderAIGrid({
            rows: contactRows(),
            columns: contactColumns,
            aiFill: ({ getRowId }) => contactConfig(jev.connection, getRowId, overrides),
        });
        await settle();
        for (const column of [col.persona, col.seniority]) {
            h.setSelection(rangeSelection(column, 0, 1, 4));
            h.api().fill("selection");
            await jev.release();
        }
        return { jev, h };
    }

    /** Makes r2's results stale: its title changes outside the grid. */
    function staleR2(h: Awaited<ReturnType<typeof filledColumns>>["h"]): void {
        h.patch("r2", { title: "Director" });
        h.api().notifyRowsChanged(["r2"]);
    }

    test("retry with filter all re-runs the failed cells of that column only; eligible and review select nothing", async () => {
        const { jev, h } = await filledColumns();
        expect(h.api().getCellState("r1", "persona")?.status).toBe("error");
        expect(h.api().getCellState("r1", "seniority")?.status).toBe("error");
        const sent = jev.requests.length;

        for (const filter of ["eligible", "review"] as const) {
            expect(h.api().retry({ column: "persona", filter })).toMatchObject({ cells: 0, requests: 0 });
        }
        expect(jev.requests).toHaveLength(sent);

        expect(h.api().retry({ column: "persona", filter: "all" })).toMatchObject({ cells: 1, requests: 1 });
        await jev.release();
        expect(jev.requests).toHaveLength(sent + 1);
        expect(h.api().getCellState("r1", "persona")?.status).toBe("suggested");
        expect(h.api().getCellState("r1", "seniority")?.status).toBe("error");
    });

    test("rerunStale with filter all re-runs the stale cells of that column only; eligible and review select nothing", async () => {
        const { jev, h } = await filledColumns();
        staleR2(h);
        expect(h.api().getCellState("r2", "persona")?.status).toBe("stale");
        expect(h.api().getCellState("r2", "seniority")?.status).toBe("stale");
        const sent = jev.requests.length;

        for (const filter of ["eligible", "review"] as const) {
            expect(h.api().rerunStale({ column: "seniority", filter })).toMatchObject({ cells: 0, requests: 0 });
        }
        expect(jev.requests).toHaveLength(sent);

        expect(h.api().rerunStale({ column: "seniority", filter: "all" })).toMatchObject({ cells: 1, requests: 1 });
        await jev.release();
        expect(jev.requests).toHaveLength(sent + 1);
        expect(h.api().getCellState("r2", "seniority")?.status).toBe("suggested");
        expect(h.api().getCellState("r2", "persona")?.status).toBe("stale");
        expect(h.api().getCellState("r1", "seniority")?.status).toBe("error");
    });

    test("a column-target retry sends no request for a row that isn't displayed", async () => {
        const { jev, h } = await filledColumns();
        h.setView(["r2", "r3", "r4"]);
        const sent = jev.requests.length;
        const run = h.api().retry({ column: "persona", filter: "all" });
        expect(run).toMatchObject({ cells: 0, requests: 0, skipped: { unloaded: 1 } });
        await jev.release();
        expect(jev.requests).toHaveLength(sent);
        expect(h.api().getCellState("r1", "persona")?.status).toBe("error");
    });

    test("reject with filter all covers withheld and stale results; eligible and review narrow it", async () => {
        // Persona shows only 0.8 and up, so r3 (0.6) is withheld.
        const { h } = await filledColumns({
            columns: {
                persona: { ...persona, policy: { show: { minProbability: 0.8 } } },
                seniority: { ...seniority, output: { store: "level-label" } },
            },
        });
        staleR2(h);
        expect(h.api().getCellState("r3", "persona")?.status).toBe("withheld");
        expect(h.api().getCellState("r4", "persona")?.status).toBe("suggested");

        expect(h.api().reject({ column: "persona", filter: "review" })).toBe(0);
        expect(h.api().reject({ column: "persona", filter: "eligible" })).toBe(1);
        expect(h.api().getCellState("r4", "persona")?.status).toBe("rejected");

        // r2 is stale and r3 withheld; r1 failed, which reject never covers.
        expect(h.api().reject({ column: "persona", filter: "all" })).toBe(2);
        expect(h.api().getCellState("r2", "persona")?.status).toBe("rejected");
        expect(h.api().getCellState("r3", "persona")?.status).toBe("rejected");
        expect(h.api().getCellState("r1", "persona")?.status).toBe("error");
        expect(h.api().getCellState("r3", "seniority")?.status).toBe("suggested");
        expect(h.edits).toEqual([]);
    });

    test("clear with filter all drops every clearable result in the column and leaves in-flight cells waiting", async () => {
        const { jev, h } = await filledColumns();
        staleR2(h);
        h.patch("r4", { title: "Intern VP" });
        h.api().notifyRowsChanged(["r4"]);
        h.api().rerunStale({ cells: [["r4", "persona"]] });
        await settle();
        expect(h.api().getCellState("r4", "persona")?.status).toBe("pending");

        h.api().clear({ column: "persona", filter: "all" });
        // The failed, stale and review results are gone; the in-flight cell is still waiting.
        for (const rowId of ["r1", "r2", "r3"]) expect(h.api().getCellState(rowId, "persona")).toBeUndefined();
        expect(h.api().getCellState("r4", "persona")?.status).toBe("pending");
        expect(h.api().getCellState("r1", "seniority")?.status).toBe("error");
        expect(h.api().getCellState("r2", "seniority")?.status).toBe("stale");

        await jev.release();
        expect(h.api().getCellState("r4", "persona")?.status).toBe("suggested");
        expect(h.edits).toEqual([]);
    });
});
