import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/ai-fill/identity/canonical-json.js";
import { groupRequests, type RequestCell } from "../../src/ai-fill/engine/requests.js";
import type { JevQuestion, JevState } from "../../src/ai-fill/index.js";

function cell(rowId: string, columnId: string, state: JevState, model: string = "jev-latest"): RequestCell {
    const question: JevQuestion = { type: "noul", instructions: `Question for ${columnId}` };
    return { rowId, columnId, question, model, state, stateJson: canonicalJson(state) };
}

describe("groupRequests", () => {
    it("combines columns whose state is identical into one request, with question ids q0…qN", () => {
        const requests = groupRequests(
            [cell("r1", "a", { title: "VP", company: "Acme" }), cell("r1", "b", { company: "Acme", title: "VP" })],
            16
        );
        expect(requests).toHaveLength(1);
        expect(Object.keys(requests[0].request.questions)).toEqual(["q0", "q1"]);
        expect(requests[0].questions.map(q => [q.questionId, q.cell.columnId])).toEqual([
            ["q0", "a"],
            ["q1", "b"],
        ]);
        expect(requests[0].request.questions.q1).toEqual({ type: "noul", instructions: "Question for b" });
    });

    it("keeps different states, different models and different rows in separate requests", () => {
        const requests = groupRequests(
            [
                cell("r1", "a", { title: "VP" }),
                cell("r1", "b", { title: "CFO" }),
                cell("r1", "c", { title: "VP" }, "jev-preview"),
                cell("r2", "a", { title: "VP" }),
            ],
            16
        );
        expect(requests).toHaveLength(4);
        expect(requests.map(r => r.request.model)).toEqual(["jev-latest", "jev-latest", "jev-preview", "jev-latest"]);
        expect(requests.every(r => Object.keys(r.request.questions).length === 1)).toBe(true);
    });

    it("chunks a group at maxQuestionsPerRequest", () => {
        const cells = ["a", "b", "c", "d", "e"].map(column => cell("r1", column, "same state"));
        const requests = groupRequests(cells, 2);
        expect(requests.map(r => Object.keys(r.request.questions))).toEqual([["q0", "q1"], ["q0", "q1"], ["q0"]]);
        expect(requests.flatMap(r => r.questions.map(q => q.cell.columnId))).toEqual(["a", "b", "c", "d", "e"]);
    });
});
