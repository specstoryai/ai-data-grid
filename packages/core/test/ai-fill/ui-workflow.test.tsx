/* eslint-disable sonarjs/no-duplicate-string */
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AICommitEvent } from "../../src/ai-fill/config/results.js";
import { standardBeforeEach } from "../test-utils.js";
import { contactColumns, contactConfig, contactRows, contactRules, col } from "./fixtures/contacts.js";
import { gatedJev, renderAIGrid, settle } from "./fixtures/harness.js";
import { clickHeaderMenu, dialog, pick, rightClickCell, statusBar } from "./fixtures/ui.js";

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

describe("SPST-16 AC 1: the full workflow with no app-built AI UI", () => {
    test("fill, review, accept, reject, choose, edit, then undo, from the grid's own UI", async () => {
        // A plain app: data, getCellContent, onCellEdited and a selection. Its only AI Fill code is the `aiFill` config.
        const jev = gatedJev({ rules: contactRules });
        const commits: AICommitEvent[] = [];
        const h = renderAIGrid({
            rows: contactRows(),
            columns: contactColumns,
            aiFill: ({ getRowId }) =>
                contactConfig(jev.connection, getRowId, {
                    rowScope: () => ({ rows: "displayed", label: "contacts" }),
                    // The app's own undo stack records commits; it builds no AI UI.
                    onCommit: event => commits.push(event),
                }),
        });
        await settle();

        // Fill: the header ▾ of the AI column.
        await clickHeaderMenu(h, col.persona);
        await pick("Fill empty cells in persona (4 rows in contacts)");
        expect(statusBar()?.textContent).toContain("Evaluating persona: 0 / 4");
        await jev.release();
        expect(statusBar()?.textContent).toContain("Done: 3 suggested · 1 review");
        // Nothing is written until someone decides.
        expect(h.edits).toHaveLength(0);

        // Review: "Review next" opens the inspector on the next result; choose another option there.
        fireEvent.click(within(statusBar() as HTMLElement).getByText("Review next"));
        await settle();
        let inspector = dialog() as HTMLElement;
        expect(within(inspector).getByRole("heading").textContent).toBe("persona: Suggested");
        fireEvent.change(within(inspector).getByLabelText("Choose a value"), { target: { value: "1" } });
        fireEvent.click(within(inspector).getByText("Write choice"));
        await settle();
        expect(h.row("r1").persona).toBe("ECON");

        // Accept from the cell menu.
        await rightClickCell(col.persona, 1);
        await pick("Accept");
        expect(h.row("r2").persona).toBe("ECON");

        // Reject from the cell menu: nothing is written.
        await rightClickCell(col.persona, 3);
        await pick("Reject");
        expect(h.api().getCellState("r4", "persona")?.status).toBe("rejected");
        expect(h.row("r4").persona).toBe("");

        // Edit manually, through the grid's normal editor.
        await rightClickCell(col.persona, 2);
        await pick("Inspect…");
        inspector = dialog() as HTMLElement;
        expect(within(inspector).getByRole("heading").textContent).toBe("persona: Needs review");
        fireEvent.click(within(inspector).getByText("Edit manually"));
        await settle();
        const editor = document.querySelector("#portal textarea") as HTMLTextAreaElement;
        fireEvent.change(editor, { target: { value: "Partner" } });
        fireEvent.keyDown(editor, { key: "Enter" });
        await settle();
        expect(h.row("r3").persona).toBe("Partner");

        // Undo the accept by row id, as the app's undo stack would; nothing is reapplied.
        const requests = jev.requests.length;
        const accept = commits.find(commit => commit.source === "accept");
        expect(accept?.edits.map(edit => edit.rowId)).toEqual(["r2"]);
        act(() => {
            h.api().revertCommit(accept?.commitId ?? "");
        });
        await settle();
        expect(h.row("r2").persona).toBe("");
        expect(h.api().getCellState("r2", "persona")?.status).toBe("accepted");
        expect(jev.requests.length).toBe(requests);
        expect(h.row("r1").persona).toBe("ECON");
    });
});
