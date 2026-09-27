import type { JevQuestion, JevRequest, JevState } from "../contract/types.js";
import type { AIColumnId, AIRowId } from "../config/results.js";

/** What request building needs to know about one cell. */
export interface RequestCell {
    readonly rowId: AIRowId;
    readonly columnId: AIColumnId;
    readonly question: JevQuestion;
    /** The requested model. */
    readonly model: string;
    readonly state: JevState;
    /** The canonical JSON of `state`. */
    readonly stateJson: string;
}

/** One request to send, and which cell each question id belongs to. */
export interface PlannedRequest<C extends RequestCell> {
    readonly request: JevRequest;
    readonly questions: readonly { readonly questionId: string; readonly cell: C }[];
}

/**
 * Groups cells into requests (SPST-17 §6.2). Cells of the same row whose
 * canonical state and requested model are identical share one request, with
 * one question per cell, chunked at `maxQuestions`. Rows are never packed
 * together. Question ids are `q0`…`qN` within each request. Order follows the
 * first appearance of each group.
 */
export function groupRequests<C extends RequestCell>(cells: readonly C[], maxQuestions: number): PlannedRequest<C>[] {
    const groups = new Map<string, C[]>();
    for (const cell of cells) {
        const key = JSON.stringify([cell.rowId, cell.model, cell.stateJson]);
        const group = groups.get(key);
        if (group === undefined) groups.set(key, [cell]);
        else group.push(cell);
    }
    const size = Math.max(1, Math.floor(maxQuestions));
    const requests: PlannedRequest<C>[] = [];
    for (const group of groups.values()) {
        for (let start = 0; start < group.length; start += size) {
            const chunk = group.slice(start, start + size);
            const questions = chunk.map((cell, i) => ({ questionId: `q${i}`, cell }));
            requests.push({
                request: {
                    state: chunk[0].state,
                    model: chunk[0].model,
                    questions: Object.fromEntries(questions.map(q => [q.questionId, q.cell.question])),
                },
                questions,
            });
        }
    }
    return requests;
}
