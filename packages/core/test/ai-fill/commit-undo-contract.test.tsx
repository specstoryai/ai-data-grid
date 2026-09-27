/* eslint-disable sonarjs/no-duplicate-string */
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DataEditorProps, DataEditorRef } from "../../src/data-editor/data-editor.js";
import type { AICommitEvent } from "../../src/ai-fill/config/results.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import {
    emptySelection,
    gatedJev,
    type HarnessOptions,
    rangeSelection,
    renderAIGrid,
    settle,
} from "./fixtures/harness.js";

/**
 * The commit path's contract with the app's edit handlers and `useUndoRedo`
 * (SPST-17 A5): one `onCellsEdited(items)`, then, unless it returns `true`, one
 * `onCellEdited` per item in the same synchronous tick, after a selection
 * covering the written cells has been set when the grid had none.
 */

const spies = vi.hoisted(() => ({ coreProps: [] as unknown[] }));

vi.mock("../../src/common/resize-detector", () => ({
    useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
}));

vi.mock("../../src/data-editor/data-editor.js", async importOriginal => {
    const actual = await importOriginal<typeof import("../../src/data-editor/data-editor.js")>();
    const ReactModule = await import("react");
    const CoreSpy = ReactModule.forwardRef<DataEditorRef, Parameters<typeof actual.DataEditor>[0]>((props, ref) => {
        spies.coreProps.push(props);
        return ReactModule.createElement(actual.DataEditor, { ...props, ref });
    });
    return { ...actual, DataEditor: CoreSpy };
});

beforeEach(() => {
    vi.useFakeTimers();
    spies.coreProps.length = 0;
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

/** Fills the persona column for every row (through `rowScope`, so no selection is needed) and settles it. */
async function filled(options: Partial<HarnessOptions> = {}) {
    const jev = gatedJev({ rules: contactRules });
    const commits: AICommitEvent[] = [];
    const h = renderAIGrid({
        rows: contactRows(),
        columns: contactColumns,
        aiFill: ({ getRowId }) =>
            contactConfig(jev.connection, getRowId, {
                rowScope: () => ({ rows: "displayed", label: "contacts" }),
                onCommit: event => commits.push(event),
            }),
        ...options,
    });
    await settle();
    h.api().fill("column-empty", { columns: ["persona"] });
    await jev.release();
    // r1 and r2 are suggested (eligible); r3 is review; r4 is a semantic outcome.
    h.log.length = 0;
    h.edits.length = 0;
    return { jev, h, commits };
}

describe("commit batch contract (A5)", () => {
    test("a bulk accept makes N synchronous onCellEdited calls in one task", async () => {
        const { h } = await filled();
        h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        h.log.length = 0;
        const commitId = h.api().accept({ selection: true });
        // Everything happened inside accept(): no timer or microtask ran in between.
        expect(commitId).toBeDefined();
        expect(h.log).toEqual([
            `onCellEdited [${col.persona},0] "Champion"`,
            `onCellEdited [${col.persona},1] "ECON"`,
            `onCellEdited [${col.persona},2] "Champion"`,
        ]);
    });

    test("onCellsEdited gets the whole batch first; returning true suppresses the per-cell calls", async () => {
        let setup = await filled({ onCellsEditedReturns: undefined });
        setup.h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        setup.h.log.length = 0;
        setup.h.api().accept({ column: "persona", filter: "eligible" });
        expect(setup.h.log).toEqual([
            "onCellsEdited 2",
            `onCellEdited [${col.persona},0] "Champion"`,
            `onCellEdited [${col.persona},1] "ECON"`,
        ]);
        cleanup();

        setup = await filled({ onCellsEditedReturns: true });
        setup.h.setSelection(rangeSelection(col.persona, 0, 1, 4));
        setup.h.log.length = 0;
        setup.h.api().accept({ column: "persona", filter: "eligible" });
        expect(setup.h.log).toEqual(["onCellsEdited 2"]);
        expect(setup.h.row("r1").persona).toBe("Champion");
        expect(setup.h.row("r2").persona).toBe("ECON");
    });

    test("without a selection, one covering the written cells is set before the edits", async () => {
        const { h } = await filled();
        h.setSelection(emptySelection);
        h.log.length = 0;
        h.api().accept({ column: "persona", filter: "eligible" });
        expect(h.log).toEqual([
            `onGridSelectionChange {"x":${col.persona},"y":0,"width":1,"height":2}`,
            `onCellEdited [${col.persona},0] "Champion"`,
            `onCellEdited [${col.persona},1] "ECON"`,
        ]);
    });

    test("with an earlier selection, the selection is left alone", async () => {
        const { h } = await filled();
        const earlier = rangeSelection(col.title, 3);
        h.setSelection(earlier);
        h.log.length = 0;
        h.api().accept({ column: "persona", filter: "eligible" });
        expect(h.log.some(line => line.startsWith("onGridSelectionChange"))).toBe(false);
        expect(h.selection()).toBe(earlier);
        expect(h.log).toHaveLength(2);
    });

    test("when the app only listens, the selection goes to its onGridSelectionChange first, once", async () => {
        const { h } = await filled({ selection: "listen" });
        h.api().accept({ cells: [["r1", "persona"]] });
        expect(h.log).toEqual([
            `onGridSelectionChange {"x":${col.persona},"y":0,"width":1,"height":1}`,
            `onCellEdited [${col.persona},0] "Champion"`,
        ]);
        // That selection is now the grid's as far as AI Fill knows, so the next commit doesn't set another.
        h.log.length = 0;
        h.api().accept({ cells: [["r2", "persona"]] });
        expect(h.log).toEqual([`onCellEdited [${col.persona},1] "ECON"`]);
    });

    test("when AI Fill holds the selection, it sets its own before the edits", async () => {
        const { h } = await filled({ selection: "uncontrolled" });
        const before = spies.coreProps.length;
        h.api().accept({ column: "persona", filter: "eligible" });
        await settle();
        expect(spies.coreProps.length).toBeGreaterThan(before);
        const held = (spies.coreProps.at(-1) as DataEditorProps).gridSelection;
        expect(held?.current?.range).toEqual({ x: col.persona, y: 0, width: 1, height: 2 });
    });
});

describe("revertCommit", () => {
    test("restores the previous values by row id after a re-sort, through the same batch path", async () => {
        const { h, commits } = await filled({ onCellsEditedReturns: undefined });
        const commitId = h.api().accept({ column: "persona", filter: "eligible" }) as string;
        expect(commits.at(-1)?.commitId).toBe(commitId);
        h.setView(["r4", "r3", "r2", "r1"]);
        h.log.length = 0;
        expect(h.api().revertCommit(commitId)).toBe(2);
        expect(h.row("r1").persona).toBe("");
        expect(h.row("r2").persona).toBe("");
        // Written at the rows' new positions, as one batch.
        expect(h.log).toEqual([
            "onCellsEdited 2",
            `onCellEdited [${col.persona},3] ""`,
            `onCellEdited [${col.persona},2] ""`,
        ]);
        // A commit is reverted once.
        expect(h.api().revertCommit(commitId)).toBe(0);
        // The results stay accepted: nothing is suggested again.
        expect(h.api().getCellState("r1", "persona")?.status).toBe("accepted");
    });

    test("doesn't overwrite a newer edit, and skips rows that are gone", async () => {
        const { h } = await filled();
        const commitId = h.api().accept({ column: "persona", filter: "eligible" }) as string;
        h.patch("r1", { persona: "Edited later" });
        h.remove("r2");
        expect(h.api().revertCommit(commitId)).toBe(0);
        expect(h.row("r1").persona).toBe("Edited later");
        expect(h.api().revertCommit("commit-unknown")).toBe(0);
    });
});
