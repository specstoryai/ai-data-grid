import { describe, expect, it } from "vitest";
import { GridCellKind, type TextCell } from "../../src/internal/data-grid/data-grid-types.js";
import { evaluateAIPolicy, type ChoiceAnswer, type ChoiceColumnDefinition } from "../../src/ai-fill/index.js";
import { AIFillStore, type AICurrentCell, type AIRequestTag } from "../../src/ai-fill/engine/store.js";
import type { ResultIdentity } from "../../src/ai-fill/policy/commit-guards.js";
import { persona, personaAnswer } from "./fixtures/definitions.js";

const identity: ResultIdentity = { questionFingerprint: "q", inputFingerprint: "i", model: "jev-latest" };

function text(data: string): TextCell {
    return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true };
}

const empty = text("");
const current: AICurrentCell = { identity, destination: empty };

function enqueue(store: AIFillStore, rowId: string, runId: string, columnId: string = "persona"): AIRequestTag {
    const record = store.enqueue({
        rowId,
        columnId,
        runId,
        scope: "selection",
        mode: "suggest",
        identity,
        destinationSnapshot: "",
        queuedAt: 0,
    });
    return { rowId, columnId, runId, requestSeq: record.requestSeq };
}

/** Resolves a request. `now` is the cell at response time; `"row-missing"` means its row is gone. */
function resolve(
    store: AIFillStore,
    tag: AIRequestTag,
    answer: ChoiceAnswer,
    now: AICurrentCell | "row-missing" = current
) {
    const definition: ChoiceColumnDefinition = persona;
    return store.resolve({
        ...tag,
        answer,
        receivedAt: 1,
        current: now === "row-missing" ? undefined : now,
        evaluate: destination =>
            evaluateAIPolicy({
                definition,
                answer,
                context: { rowId: tag.rowId, columnId: tag.columnId, destination },
            }),
    });
}

describe("AIFillStore", () => {
    it("settles a record only with the request it is waiting for", () => {
        const store = new AIFillStore();
        const tag = enqueue(store, "r1", "run-1");
        expect(store.markPending(tag, 5)).toBe(true);
        expect(store.get("r1", "persona")?.status).toBe("pending");

        const outcome = resolve(store, tag, personaAnswer(0.9, 0.8));
        expect(outcome.applied).toBe(true);
        const record = store.get("r1", "persona");
        expect(record?.status).toBe("suggested");
        expect(record?.answer).toMatchObject({ probabilities: { champion: 0.9 } });
        expect(record?.timings).toEqual({ queuedAt: 0, sentAt: 5, receivedAt: 1 });
        expect(resolve(store, tag, personaAnswer(0.9, 0.8))).toEqual({ applied: false, reason: "not-in-flight" });
    });

    it("never attaches a response to another cell", () => {
        const store = new AIFillStore();
        const r1 = enqueue(store, "r1", "run-1");
        const r2 = enqueue(store, "r2", "run-1");
        // A response tagged for r1 carries r1's ids; r2's record is untouched.
        resolve(store, r1, personaAnswer(0.9, 0.8));
        expect(store.get("r2", "persona")?.status).toBe("queued");
        expect(store.get("r2", "persona")?.answer).toBeUndefined();
        // A tag with r2's ids but r1's sequence number is rejected.
        expect(resolve(store, { ...r1, rowId: "r2" }, personaAnswer(0.9, 0.8))).toEqual({
            applied: false,
            reason: "superseded",
        });
        expect(store.get("r2", "persona")?.requestSeq).toBe(r2.requestSeq);
    });

    it("ignores out-of-order responses: an older request can't overwrite a newer one", () => {
        const store = new AIFillStore();
        const first = enqueue(store, "r1", "run-1");
        const second = enqueue(store, "r1", "run-2");
        expect(second.requestSeq).toBeGreaterThan(first.requestSeq);

        expect(resolve(store, second, personaAnswer(0.6, 0.5, "economic")).applied).toBe(true);
        expect(resolve(store, first, personaAnswer(0.99, 0.99))).toEqual({ applied: false, reason: "superseded" });
        expect(store.get("r1", "persona")?.answer).toMatchObject({ choice: "economic" });

        // And the other way round: the older response arriving first is ignored too.
        const third = enqueue(store, "r1", "run-3");
        expect(resolve(store, second, personaAnswer(0.9, 0.9))).toEqual({ applied: false, reason: "superseded" });
        expect(resolve(store, third, personaAnswer(0.9, 0.9)).applied).toBe(true);
    });

    it("ignores a response whose run id doesn't match, even with the same sequence number", () => {
        const store = new AIFillStore();
        const tag = enqueue(store, "r1", "run-1");
        expect(resolve(store, { ...tag, runId: "run-2" }, personaAnswer(0.9, 0.8))).toEqual({
            applied: false,
            reason: "superseded",
        });
    });

    it("restores the previous record on cancel, and ignores late responses", () => {
        const store = new AIFillStore();
        const first = enqueue(store, "r1", "run-1");
        resolve(store, first, personaAnswer(0.9, 0.8));
        const retry = enqueue(store, "r1", "run-2");
        const fresh = enqueue(store, "r2", "run-2");

        expect(store.cancelRun("run-2")).toEqual([
            { rowId: "r1", columnId: "persona" },
            { rowId: "r2", columnId: "persona" },
        ]);
        expect(store.get("r1", "persona")?.status).toBe("suggested");
        expect(store.get("r1", "persona")?.runId).toBe("run-1");
        expect(store.get("r2", "persona")).toBeUndefined();

        expect(resolve(store, retry, personaAnswer(0.5, 0.5, "economic")).applied).toBe(false);
        expect(resolve(store, fresh, personaAnswer(0.5, 0.5, "economic"))).toEqual({
            applied: false,
            reason: "no-record",
        });
        expect(store.get("r1", "persona")?.answer).toMatchObject({ choice: "champion" });
    });

    it("stores an answer as stale when the input changed, and stale and manual when the destination did", () => {
        const store = new AIFillStore();
        const a = enqueue(store, "r1", "run-1");
        resolve(store, a, personaAnswer(0.9, 0.8), {
            identity: { ...identity, inputFingerprint: "other" },
            destination: empty,
        });
        expect(store.get("r1", "persona")).toMatchObject({ status: "stale" });
        expect(store.get("r1", "persona")?.manual).toBeUndefined();
        expect(store.get("r1", "persona")?.answer).toBeDefined();

        const b = enqueue(store, "r2", "run-1");
        resolve(store, b, personaAnswer(0.9, 0.8), { identity, destination: text("typed by hand") });
        expect(store.get("r2", "persona")).toMatchObject({ status: "stale", manual: true });
    });

    it("stores the response as stale when a source changed while pending", () => {
        const store = new AIFillStore();
        const tag = enqueue(store, "r1", "run-1");
        expect(store.markSourceChanged(tag)).toBe(true);
        resolve(store, tag, personaAnswer(0.9, 0.8));
        expect(store.get("r1", "persona")?.status).toBe("stale");
    });

    it("drops the record when the row no longer exists", () => {
        const store = new AIFillStore();
        const tag = enqueue(store, "r1", "run-1");
        expect(resolve(store, tag, personaAnswer(0.9, 0.8), "row-missing")).toEqual({
            applied: true,
            record: undefined,
        });
        expect(store.get("r1", "persona")).toBeUndefined();
    });

    it("marks a decided record stale on a source edit, and manual and stale on a destination edit", () => {
        const store = new AIFillStore();
        resolve(store, enqueue(store, "r1", "run-1"), personaAnswer(0.9, 0.8));
        resolve(store, enqueue(store, "r2", "run-1"), personaAnswer(0.9, 0.8));
        store.markSourceChanged({ rowId: "r1", columnId: "persona" });
        store.markDestinationEdited({ rowId: "r2", columnId: "persona" });
        expect(store.get("r1", "persona")?.status).toBe("stale");
        expect(store.get("r2", "persona")).toMatchObject({ status: "stale", manual: true });
    });

    it("keeps failures with their error, and a retry gets a new sequence number", () => {
        const store = new AIFillStore();
        const tag = enqueue(store, "r1", "run-1");
        store.fail({ ...tag, receivedAt: 1, error: { kind: "timeout", message: "late", retryable: true } });
        expect(store.get("r1", "persona")).toMatchObject({ status: "error", error: { kind: "timeout" } });
        const retry = enqueue(store, "r1", "run-2");
        expect(retry.requestSeq).toBeGreaterThan(tag.requestSeq);
        expect(store.get("r1", "persona")?.previous?.status).toBe("error");
    });

    it("commits a result once; a second commit is refused", () => {
        const store = new AIFillStore();
        resolve(store, enqueue(store, "r1", "run-1"), personaAnswer(0.9, 0.8));
        const ref = { rowId: "r1", columnId: "persona" };
        expect(store.canCommit(ref)).toBe(true);
        expect(store.commit([ref], "commit-1", "accepted").committed).toHaveLength(1);
        expect(store.canCommit(ref)).toBe(false);
        expect(store.commit([ref], "commit-2", "accepted")).toEqual({ committed: [], alreadyCommitted: [ref] });
        expect(store.get("r1", "persona")).toMatchObject({ status: "accepted", commitId: "commit-1" });
    });

    it("rejects only decided or stale records, and re-evaluates only stored answers", () => {
        const store = new AIFillStore();
        resolve(store, enqueue(store, "r1", "run-1"), personaAnswer(0.9, 0.8));
        enqueue(store, "r2", "run-1");
        const refs = [
            { rowId: "r1", columnId: "persona" },
            { rowId: "r2", columnId: "persona" },
        ];
        expect(
            store.reevaluate(refs[1], () => ({
                status: "error",
                error: { kind: "timeout", message: "", retryable: true },
            }))
        ).toBe(false);
        expect(store.reject(refs).map(record => record.rowId)).toEqual(["r1"]);
        expect(store.get("r1", "persona")?.status).toBe("rejected");
        expect(store.get("r2", "persona")?.status).toBe("queued");
    });

    it("notifies listeners of the cells that changed", () => {
        const store = new AIFillStore();
        const changes: string[] = [];
        const unsubscribe = store.subscribe(refs => changes.push(...refs.map(ref => `${ref.rowId}/${ref.columnId}`)));
        const tag = enqueue(store, "r1", "run-1");
        store.markPending(tag, 1);
        unsubscribe();
        store.cancelRun("run-1");
        expect(changes).toEqual(["r1/persona", "r1/persona"]);
    });
});
