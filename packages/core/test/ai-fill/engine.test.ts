import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridCellKind } from "../../src/internal/data-grid/data-grid-types.js";
import type {
    AIFillConfig,
    AIFillError,
    AIResultEvent,
    AIRunSummary,
    ChoiceColumnDefinition,
    JevRequest,
    JevResponse,
} from "../../src/ai-fill/index.js";
import { AIFillEngine, type AIRunHandle } from "../../src/ai-fill/engine/engine.js";
import { createMockJev, type MockJev, type MockJevOptions } from "../../src/ai-fill/testing/index.js";
import { ownsBudget, persona, personaAnswer, seniority } from "./fixtures/definitions.js";
import { contact, FakeGrid } from "./fixtures/grid.js";

/** Persona answers depend on the title: VPs are champions, CFOs economic buyers. */
const personaRule: NonNullable<MockJevOptions["rules"]>[number] = {
    instructions: /buyer persona/,
    answer: ({ state }) => {
        const title = JSON.stringify(state);
        if (title.includes("CFO")) return personaAnswer(0.85, 0.7, "economic");
        if (title.includes("VP")) return personaAnswer(0.9, 0.8, "champion");
        return personaAnswer(0.6, 0.4, "champion");
    },
};

const columns = {
    persona,
    seniority: { ...seniority, output: { store: "level-label" as const } },
    ownsBudget,
};

let grid: FakeGrid;
let jev: MockJev;
let events: {
    results: AIResultEvent[];
    errors: AIFillError[];
    ends: AIRunSummary[];
    starts: unknown[];
    progress: { done: number; total: number }[];
};

function setup(options: MockJevOptions = {}) {
    jev = createMockJev({ seed: 7, rules: [personaRule], ...options });
}

function config(overrides: Partial<AIFillConfig> = {}): AIFillConfig {
    return {
        connection: jev.connection,
        model: "jev-latest",
        rows: { getRowId: row => grid.view[row].id },
        columns,
        execution: { concurrency: 2, backoff: { jitter: 0 } },
        onResult: event => events.results.push(event),
        onError: error => events.errors.push(error),
        onRunEnd: summary => events.ends.push(summary),
        onRunStart: event => events.starts.push(event),
        onRunProgress: event => events.progress.push(event),
        ...overrides,
    };
}

function engine(overrides: Partial<AIFillConfig> = {}): AIFillEngine {
    return new AIFillEngine({ config: config(overrides), host: grid, isBrowser: false, random: () => 0 });
}

async function settle(handle: AIRunHandle): Promise<AIRunSummary> {
    await vi.runAllTimersAsync();
    return handle.done;
}

function status(e: AIFillEngine, rowId: string, columnId: string = "persona") {
    return e.getRecord(rowId, columnId)?.status;
}

beforeEach(() => {
    vi.useFakeTimers();
    grid = new FakeGrid([
        contact("r1", "VP Sales"),
        contact("r2", "CFO"),
        contact("r3", "Engineer"),
        contact("r4", "VP Marketing"),
    ]);
    events = { results: [], errors: [], ends: [], starts: [], progress: [] };
    setup();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("fill", () => {
    it("evaluates Choice, Score and Noul and settles typed results with metadata", async () => {
        const e = engine();
        const summary = await settle(
            e.fill({ cells: grid.cells("persona", "seniority", "ownsBudget"), scope: "selection-empty" })
        );
        expect(summary.cancelled).toBe(false);
        const total = Object.values(summary.counts).reduce((sum, n) => sum + (n ?? 0), 0);
        expect(total).toBe(12);
        expect(summary.counts.error).toBeUndefined();

        const record = e.getRecord("r2", "persona");
        expect(record).toMatchObject({ status: "suggested", output: { value: "ECON", display: "Economic buyer" } });
        expect(e.getRecord("r1", "seniority")?.answer?.type).toBe("score");
        expect(e.getRecord("r1", "ownsBudget")?.answer?.type).toBe("noul");

        const event = events.results.find(r => r.rowId === "r2" && r.columnId === "persona");
        expect(event).toMatchObject({
            runId: summary.runId,
            requestedModel: "jev-latest",
            model: "jev-mock-1.0.0",
            status: "suggested",
            decision: { status: "suggested" },
        });
        expect(event?.questionFingerprint).toMatch(/^[\da-f]{8}$/);
        expect(event?.inputFingerprint).toMatch(/^[\da-f]{8}$/);
        expect(event?.timings.receivedAt).toBeGreaterThanOrEqual(event?.timings.queuedAt ?? 0);
    });

    it("sends the configured model as given and records the model id that answered", async () => {
        setup({ model: requested => (requested === "jev-preview" ? "jev-9.9.9-preview" : requested) });
        const e = engine({ model: "jev-preview" });
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        expect(jev.calls[0].request?.model).toBe("jev-preview");
        expect(e.getRecord("r1", "persona")?.answer?.model).toBe("jev-9.9.9-preview");
        expect(events.results[0]).toMatchObject({ requestedModel: "jev-preview", model: "jev-9.9.9-preview" });
    });

    it("fires the lifecycle callbacks in order", async () => {
        const e = engine();
        const summary = await settle(e.fill({ cells: grid.cells("persona"), scope: "selection" }));
        expect(events.starts).toEqual([{ runId: summary.runId, columnIds: ["persona"], cells: 4, apply: false }]);
        expect(events.progress.at(-1)).toEqual({ runId: summary.runId, done: 4, total: 4 });
        expect(events.results).toHaveLength(4);
        expect(events.ends).toEqual([summary]);
    });

    it("reports withheld and review results through onResult too", async () => {
        const e = engine({
            columns: {
                persona: { ...persona, policy: { show: { minProbability: 0.8 }, ready: { minProbability: 0.88 } } },
            },
        });
        await settle(e.fill({ cells: grid.cells("persona"), scope: "selection" }));
        expect(Object.fromEntries(events.results.map(r => [r.rowId, r.status]))).toEqual({
            r1: "suggested",
            r2: "review",
            r3: "withheld",
            r4: "suggested",
        });
        expect(events.results.find(r => r.rowId === "r3")?.decision?.reason.message).toContain(
            "0.6 < show.minProbability 0.8"
        );
    });

    it("marks apply candidates in a Fill and apply run", async () => {
        const e = engine({
            columns: { persona: { ...persona, policy: { autoApply: { minProbability: 0.9 } } } },
        });
        await settle(e.fill({ cells: grid.cells("persona"), scope: "selection-empty", mode: "apply" }));
        expect(e.getRecord("r1", "persona")).toMatchObject({
            status: "suggested",
            mode: "apply",
            decision: { status: "apply-candidate" },
        });
        expect(e.getRecord("r2", "persona")?.decision?.status).toBe("suggested");
        expect(events.starts[0]).toMatchObject({ apply: true });
    });
});

describe("request building", () => {
    it("combines identical-state columns into one request, and keeps different states apart", async () => {
        const shared = engine({ rowState: ({ rowId }) => ({ title: grid.byId(rowId).title }) });
        await settle(
            shared.fill({
                cells: [
                    ["r1", "persona"],
                    ["r1", "seniority"],
                    ["r1", "ownsBudget"],
                ],
                scope: "selection",
            })
        );
        expect(jev.calls).toHaveLength(1);
        expect(Object.keys(jev.calls[0].request?.questions ?? {})).toEqual(["q0", "q1", "q2"]);

        jev.reset();
        // Without rowState, each column's state is built from its own sources, which differ.
        const separate = engine();
        await settle(
            separate.fill({
                cells: [
                    ["r1", "persona"],
                    ["r1", "seniority"],
                    ["r1", "ownsBudget"],
                ],
                scope: "selection",
            })
        );
        expect(jev.calls).toHaveLength(3);
    });

    it("chunks at maxQuestionsPerRequest", async () => {
        const e = engine({
            rowState: ({ rowId }) => ({ title: grid.byId(rowId).title }),
            execution: { maxQuestionsPerRequest: 2 },
        });
        await settle(
            e.fill({
                cells: [
                    ["r1", "persona"],
                    ["r1", "seniority"],
                    ["r1", "ownsBudget"],
                ],
                scope: "selection",
            })
        );
        expect(jev.calls.map(call => Object.keys(call.request?.questions ?? {}).length)).toEqual([2, 1]);
    });

    it("never packs rows together", async () => {
        const e = engine({ rowState: () => ({ same: "state" }) });
        await settle(
            e.fill({
                cells: [
                    ["r1", "persona"],
                    ["r2", "persona"],
                ],
                scope: "selection",
            })
        );
        expect(jev.calls).toHaveLength(2);
    });

    it("reports input-too-large before sending anything", async () => {
        const e = engine({ execution: { maxStateChars: 10 } });
        const plan = e.plan({ cells: [["r1", "persona"]], scope: "selection" });
        expect(plan.requests).toBe(0);
        await settle(e.run(plan));
        expect(jev.calls).toHaveLength(0);
        expect(e.getRecord("r1", "persona")).toMatchObject({
            status: "error",
            error: { kind: "input-too-large", retryable: false },
        });
        expect(events.errors.map(error => error.kind)).toEqual(["input-too-large"]);
    });

    it("never exceeds the concurrency limit", async () => {
        grid = new FakeGrid(Array.from({ length: 12 }, (_, i) => contact(`r${i}`, `VP ${i}`)));
        setup({ latencyMs: 100 });
        let active = 0;
        let maxActive = 0;
        const send = async (request: JevRequest, signal: AbortSignal): Promise<JevResponse> => {
            active++;
            maxActive = Math.max(maxActive, active);
            try {
                return await jev.send(request, signal);
            } finally {
                active--;
            }
        };
        const e = engine({ connection: { mode: "custom", send }, execution: { concurrency: 3 } });
        const summary = await settle(e.fill({ cells: grid.cells("persona"), scope: "selection" }));
        expect(summary.counts.suggested).toBe(12);
        expect(jev.calls).toHaveLength(12);
        expect(maxActive).toBe(3);
    });
});

describe("cache and dedup", () => {
    it("serves a repeated fill from the cache with no request", async () => {
        const e = engine();
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        e.reject([{ rowId: "r1", columnId: "persona" }]);
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        expect(jev.calls).toHaveLength(1);
        expect(status(e, "r1")).toBe("suggested");
    });

    it("joins a request already in flight instead of sending another", async () => {
        setup({ latencyMs: 500 });
        const e = engine();
        const first = e.fill({ cells: [["r1", "persona"]], scope: "selection" });
        await vi.advanceTimersByTimeAsync(100);
        const second = e.fill({ cells: [["r1", "persona"]], scope: "selection" });
        expect(e.plan({ cells: [["r2", "persona"]], scope: "selection" }).requests).toBe(1);
        const [a, b] = await Promise.all([settle(first), settle(second)]);
        expect(jev.calls).toHaveLength(1);
        // The first run's record was superseded by the second; the answer lands once.
        expect(a.counts).toEqual({ cancelled: 1 });
        expect(b.counts).toEqual({ suggested: 1 });
    });

    it("skips cells that already have a decided result with the same identity", async () => {
        const e = engine();
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        const plan = e.plan({ cells: [["r1", "persona"]], scope: "selection" });
        expect(plan.cells).toHaveLength(0);
        expect(plan.skipped).toEqual({ cached: 1 });
    });
});

describe("failures", () => {
    it("aborts the whole run on a 401 with a single authentication error", async () => {
        setup({ errors: [{ kind: "authentication" }] });
        const e = engine({ execution: { concurrency: 1 } });
        const summary = await settle(e.fill({ cells: grid.cells("persona"), scope: "selection" }));
        expect(jev.calls).toHaveLength(1);
        expect(events.errors).toHaveLength(1);
        expect(events.errors[0]).toMatchObject({ kind: "authentication", retryable: false, httpStatus: 401 });
        expect(events.errors[0].cells).toHaveLength(4);
        expect(summary.counts).toEqual({ error: 4 });
        expect(events.ends).toHaveLength(1);
        expect(grid.view.map(row => e.getRecord(row.id, "persona")?.error?.kind)).toEqual([
            "authentication",
            "authentication",
            "authentication",
            "authentication",
        ]);
    });

    it("gives a retryable rate-limit error after retries and pauses the queue for the server's delay", async () => {
        setup({ errors: [{ kind: "rate-limit", calls: [0, 1], retryAfterMs: 2000 }] });
        const e = engine({ execution: { concurrency: 1, maxRetries: 1 } });
        const handle = e.fill({
            cells: [
                ["r1", "persona"],
                ["r2", "persona"],
            ],
            scope: "selection",
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(jev.calls).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(2000);
        expect(jev.calls).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(e.getRecord("r1", "persona")?.error).toMatchObject({
            kind: "rate-limit",
            retryable: true,
            httpStatus: 429,
            requestId: "mock-1",
        });
        // The queue stays paused for the server's 2 s delay after the final 429.
        await vi.advanceTimersByTimeAsync(1998);
        expect(jev.calls).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(2);
        expect(jev.calls).toHaveLength(3);
        const summary = await settle(handle);
        expect(summary.counts).toEqual({ error: 1, suggested: 1 });
    });

    it("gives a retryable overloaded error after retries on 529", async () => {
        setup({ errors: [{ kind: "overloaded" }] });
        const e = engine({ execution: { maxRetries: 1 } });
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        expect(jev.calls).toHaveLength(2);
        expect(e.getRecord("r1", "persona")?.error).toMatchObject({
            kind: "overloaded",
            retryable: true,
            httpStatus: 529,
        });
    });

    it.each([
        ["timeout", "timeout", true],
        ["network", "network", true],
        ["invalid-request", "invalid-request", false],
        ["configuration", "configuration", false],
        ["input-too-large", "input-too-large", false],
    ] as const)("reports an injected %s failure as a %s error", async (kind, expected, retryable) => {
        setup({ errors: [{ kind }] });
        const e = engine({ execution: { maxRetries: 0, timeoutMs: 1000 } });
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        const error = e.getRecord("r1", "persona")?.error;
        expect(error).toMatchObject({ kind: expected, retryable, cells: [["r1", "persona"]] });
        expect(error?.message).not.toBe("");
        expect(events.errors.map(err => err.kind)).toEqual([expected]);
    });

    it("gives an evaluation error when the answer for a question id is missing", async () => {
        setup({ errors: [{ kind: "evaluation" }] });
        const e = engine();
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        expect(e.getRecord("r1", "persona")?.error).toMatchObject({ kind: "evaluation", retryable: true });
        expect(e.getRecord("r1", "persona")?.error?.message).toContain("q0");
    });

    it("gives a malformed error for an answer that fails parseJevAnswer", async () => {
        setup({ errors: [{ kind: "malformed" }] });
        const e = engine();
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        expect(e.getRecord("r1", "persona")?.error).toMatchObject({ kind: "malformed", retryable: false });
    });

    it("gives type-mismatch and policy-callback errors from the policy step", async () => {
        const throwing: ChoiceColumnDefinition = {
            ...persona,
            policy: {
                decide: () => {
                    throw new Error("boom");
                },
            },
        };
        setup({ rules: [personaRule, { instructions: /own a budget/, answer: { type: "noul", noul: 0.95 } }] });
        const e = engine({
            columns: {
                persona: throwing,
                ownsBudget: { ...ownsBudget, output: { ...ownsBudget.output, store: "label" } },
            },
        });
        await settle(
            e.fill({
                cells: [
                    ["r1", "persona"],
                    ["r1", "ownsBudget"],
                ],
                scope: "selection",
            })
        );
        expect(e.getRecord("r1", "persona")?.error?.kind).toBe("policy-callback");
        // The label "Yes" can't be written into a boolean cell.
        expect(e.getRecord("r1", "ownsBudget")?.error).toMatchObject({ kind: "type-mismatch", retryable: false });
        expect(events.errors.map(error => error.kind).sort()).toEqual(["policy-callback", "type-mismatch"]);
    });

    it("keeps partial successes, retries only the failed cells, and never commits twice", async () => {
        setup({ errors: [{ kind: "invalid-request", calls: [1] }] });
        const e = engine({ execution: { concurrency: 1 } });
        const summary = await settle(
            e.fill({
                cells: [
                    ["r1", "persona"],
                    ["r2", "persona"],
                    ["r4", "persona"],
                ],
                scope: "selection",
            })
        );
        expect(summary.counts).toEqual({ suggested: 2, error: 1 });

        const edit = (rowId: string) => ({
            rowId,
            columnId: "persona",
            location: [3, grid.view.findIndex(r => r.id === rowId)] as const,
            previous: { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: true } as const,
            next: { kind: GridCellKind.Text, data: "Champion", displayData: "Champion", allowOverlay: true } as const,
        });
        const onCommit = vi.fn();
        e.setConfig(config({ onCommit }));
        const first = e.recordCommit({ source: "accept", edits: [edit("r1")] });
        expect(first.committed).toEqual([{ rowId: "r1", columnId: "persona" }]);
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0][0]).toMatchObject({
            commitId: first.commitId,
            source: "accept",
            edits: [{ rowId: "r1", columnId: "persona", metadata: { model: "jev-mock-1.0.0" } }],
        });

        await settle(e.retry());
        expect(jev.calls).toHaveLength(4);
        expect(jev.calls[3].request?.state).toEqual({ company: "Example Co", title: "CFO" });
        expect(status(e, "r2")).toBe("suggested");
        expect(status(e, "r1")).toBe("accepted");

        const again = e.recordCommit({ source: "accept", edits: [edit("r1")] });
        expect(again).toEqual({
            commitId: undefined,
            committed: [],
            alreadyCommitted: [{ rowId: "r1", columnId: "persona" }],
        });
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(events.errors.at(-1)).toMatchObject({ kind: "commit-blocked", cells: [["r1", "persona"]] });
    });

    it("reports a grid-level configuration problem without sending anything", async () => {
        const e = engine({ model: "" });
        const plan = e.plan({ cells: grid.cells("persona"), scope: "selection" });
        expect(plan.error).toMatchObject({ kind: "configuration" });
        expect(plan.error?.message).toContain("model");
        const summary = await settle(e.run(plan));
        expect(summary.counts).toEqual({});
        expect(jev.calls).toHaveLength(0);
        expect(events.errors).toHaveLength(1);
        expect(events.starts).toHaveLength(0);
    });

    it("refuses direct mode in a browser without dangerouslyAllowBrowser, with no request", async () => {
        const fetch = vi.fn(jev.fetch);
        const e = new AIFillEngine({
            config: config({ connection: { mode: "direct", apiKey: "test-key", fetch } }),
            host: grid,
            isBrowser: true,
        });
        const plan = e.plan({ cells: [["r1", "persona"]], scope: "selection" });
        expect(plan.error?.kind).toBe("configuration");
        expect(plan.error?.message).toContain("dangerouslyAllowBrowser");
        await settle(e.run(plan));
        expect(fetch).not.toHaveBeenCalled();
    });

    it("refuses a fill over maxCellsPerRun", () => {
        const e = engine({ execution: { maxCellsPerRun: 3 } });
        expect(e.plan({ cells: grid.cells("persona"), scope: "selection" }).error?.message).toContain("maxCellsPerRun");
    });
});

describe("cancel, retry and out-of-order responses", () => {
    it("cancel drops the queue, aborts the request and ignores late responses", async () => {
        setup({ latencyMs: 1000 });
        const e = engine({ execution: { concurrency: 1 } });
        const handle = e.fill({ cells: grid.cells("persona"), scope: "selection" });
        await vi.advanceTimersByTimeAsync(500);
        e.cancel(handle.runId);
        const summary = await handle.done;
        expect(summary).toMatchObject({ cancelled: true, counts: { cancelled: 4 } });
        expect(events.ends).toEqual([summary]);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(jev.calls).toHaveLength(1);
        expect(jev.calls[0].status).toBe("aborted");
        expect(events.results).toHaveLength(0);
        expect(grid.view.map(row => e.getRecord(row.id, "persona"))).toEqual([
            undefined,
            undefined,
            undefined,
            undefined,
        ]);
    });

    it("ignores a late response from a send that can't be aborted", async () => {
        let deliver: (response: JevResponse) => void = () => undefined;
        const send = (request: JevRequest) =>
            new Promise<JevResponse>(resolve => {
                deliver = response => resolve(response);
                void request;
            });
        const e = engine({ connection: { mode: "custom", send } });
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        const handle = e.fill({ cells: [["r2", "persona"]], scope: "selection" });
        await vi.advanceTimersByTimeAsync(10);
        e.cancel(handle.runId);
        deliver({ model: "jev-1.13.0", answers: { q0: personaAnswer(0.9, 0.9) } });
        await vi.runAllTimersAsync();
        expect(e.getRecord("r2", "persona")).toBeUndefined();
        expect(events.results.filter(r => r.rowId === "r2")).toEqual([]);
    });

    it("keeps the earlier result when a re-run is cancelled", async () => {
        setup({ latencyMs: 1000 });
        const e = engine();
        await settle(e.fill({ cells: [["r1", "persona"]], scope: "selection" }));
        grid.byId("r1").title = "CFO";
        e.markEdited([{ rowId: "r1", columnId: "title" }]);
        expect(status(e, "r1")).toBe("stale");
        const rerun = e.rerunStale();
        await vi.advanceTimersByTimeAsync(10);
        expect(status(e, "r1")).toBe("pending");
        e.cancel(rerun.runId);
        expect(status(e, "r1")).toBe("stale");
    });

    it("applies the newest request's answer and ignores an older one that arrives later", async () => {
        setup({ latencyMs: call => (call.index === 0 ? 3000 : 100) });
        const e = engine();
        const slow = e.fill({ cells: [["r1", "persona"]], scope: "selection" });
        await vi.advanceTimersByTimeAsync(10);
        grid.byId("r1").title = "CFO";
        e.markEdited([{ rowId: "r1", columnId: "title" }]);
        const fast = e.fill({ cells: [["r1", "persona"]], scope: "selection" });
        await vi.advanceTimersByTimeAsync(200);
        expect(e.getRecord("r1", "persona")).toMatchObject({ status: "suggested", answer: { choice: "economic" } });
        await vi.advanceTimersByTimeAsync(3000);
        expect((await slow.done).counts).toEqual({ cancelled: 1 });
        expect((await fast.done).counts).toEqual({ suggested: 1 });
        expect(e.getRecord("r1", "persona")?.answer).toMatchObject({ choice: "economic" });
        expect(jev.calls).toHaveLength(2);
    });
});

describe("identity and staleness", () => {
    it("lands a result on the right row after the view is re-sorted while pending", async () => {
        setup({ latencyMs: 500 });
        const e = engine();
        const handle = e.fill({
            cells: [
                ["r1", "persona"],
                ["r2", "persona"],
            ],
            scope: "selection",
        });
        await vi.advanceTimersByTimeAsync(100);
        grid.view = [...grid.view].reverse();
        await settle(handle);
        expect(e.getRecord("r1", "persona")?.answer).toMatchObject({ choice: "champion" });
        expect(e.getRecord("r2", "persona")?.answer).toMatchObject({ choice: "economic" });
    });

    it("drops the result of a row deleted while pending, with onResult reason row-missing", async () => {
        setup({ latencyMs: 500 });
        const e = engine();
        const handle = e.fill({ cells: [["r1", "persona"]], scope: "selection" });
        await vi.advanceTimersByTimeAsync(100);
        grid.view = grid.view.filter(row => row.id !== "r1");
        const summary = await settle(handle);
        expect(e.getRecord("r1", "persona")).toBeUndefined();
        expect(events.results).toEqual([
            expect.objectContaining({ rowId: "r1", columnId: "persona", status: "cancelled", reason: "row-missing" }),
        ]);
        expect(summary.counts).toEqual({ cancelled: 1 });
    });

    it("stores a response as stale when a source was edited while pending", async () => {
        setup({ latencyMs: 500 });
        const e = engine();
        const handle = e.fill({ cells: [["r1", "persona"]], scope: "selection" });
        await vi.advanceTimersByTimeAsync(100);
        grid.byId("r1").title = "CFO";
        e.markEdited([{ rowId: "r1", columnId: "title" }]);
        await settle(handle);
        expect(e.getRecord("r1", "persona")).toMatchObject({ status: "stale", answer: { choice: "champion" } });
    });

    it("stores a response as stale even without markEdited, because the input is re-fingerprinted", async () => {
        setup({ latencyMs: 500 });
        const e = engine();
        const handle = e.fill({ cells: [["r1", "persona"]], scope: "selection" });
        await vi.advanceTimersByTimeAsync(100);
        grid.byId("r1").title = "CFO";
        await settle(handle);
        expect(status(e, "r1")).toBe("stale");
    });

    it("marks the record manual and stale when the destination was edited while pending", async () => {
        setup({ latencyMs: 500 });
        const e = engine();
        const handle = e.fill({ cells: [["r1", "persona"]], scope: "selection" });
        await vi.advanceTimersByTimeAsync(100);
        grid.byId("r1").persona = "Typed by hand";
        e.markEdited([{ rowId: "r1", columnId: "persona" }]);
        await settle(handle);
        expect(e.getRecord("r1", "persona")).toMatchObject({ status: "stale", manual: true });
    });

    it("re-fingerprints rows on notifyRowsChanged", async () => {
        const e = engine();
        await settle(
            e.fill({
                cells: [
                    ["r1", "persona"],
                    ["r2", "persona"],
                ],
                scope: "selection",
            })
        );
        grid.byId("r1").title = "CFO";
        grid.view = grid.view.filter(row => row.id !== "r2");
        e.notifyRowsChanged();
        expect(status(e, "r1")).toBe("stale");
        expect(e.getRecord("r2", "persona")).toBeUndefined();
        expect(events.results.at(-1)).toMatchObject({ rowId: "r2", status: "cancelled", reason: "row-missing" });
    });
});

describe("configuration changes", () => {
    it("re-evaluates stored answers synchronously, with no request, when only policy, format, presentation or decide change", async () => {
        let sends = 0;
        const send = (request: JevRequest, signal: AbortSignal) => {
            sends++;
            return jev.send(request, signal);
        };
        const base = config({ connection: { mode: "custom", send } });
        const e = new AIFillEngine({ config: base, host: grid, isBrowser: false });
        await settle(
            e.fill({
                cells: [
                    ["r1", "persona"],
                    ["r2", "persona"],
                ],
                scope: "selection",
            })
        );
        expect(sends).toBe(2);
        expect([status(e, "r1"), status(e, "r2")]).toEqual(["suggested", "suggested"]);

        const withPolicy = { ...persona, policy: { show: { minProbability: 0.88 } } };
        e.setConfig({ ...base, columns: { ...columns, persona: withPolicy } });
        expect([status(e, "r1"), status(e, "r2")]).toEqual(["suggested", "withheld"]);

        const withFormat = { ...withPolicy, output: { format: (value: unknown) => `→ ${String(value)}` } };
        e.setConfig({ ...base, columns: { ...columns, persona: withFormat } });
        expect(e.getRecord("r1", "persona")?.output?.display).toBe("→ Champion");

        const withPresentation = { ...withFormat, presentation: { showProbability: true } };
        e.setConfig({ ...base, columns: { ...columns, persona: withPresentation } });
        expect(status(e, "r1")).toBe("suggested");

        const withDecide: ChoiceColumnDefinition = {
            ...withPresentation,
            policy: { ...withPresentation.policy, decide: () => ({ status: "review", reason: "check" }) },
        };
        e.setConfig({ ...base, columns: { ...columns, persona: withDecide } });
        expect(e.getRecord("r1", "persona")?.decision).toMatchObject({ status: "review", reason: { code: "decide" } });
        expect(sends).toBe(2);
    });

    it("marks results stale when the question or model changes, and drops removed columns", async () => {
        const e = engine();
        await settle(
            e.fill({
                cells: [
                    ["r1", "persona"],
                    ["r1", "ownsBudget"],
                ],
                scope: "selection",
            })
        );
        const calls = jev.calls.length;
        e.setConfig(config({ columns: { ...columns, persona: { ...persona, instructions: "Which persona fits?" } } }));
        expect(status(e, "r1")).toBe("stale");
        e.setConfig(config({ columns: { persona, seniority: columns.seniority } }));
        expect(e.getRecord("r1", "ownsBudget")).toBeUndefined();
        e.setConfig(config({ model: "jev-preview", columns: { persona, seniority: columns.seniority } }));
        expect(status(e, "r1")).toBe("stale");
        expect(jev.calls).toHaveLength(calls);
    });
});

describe("plan", () => {
    it("counts every skip reason and doesn't widen the scope", () => {
        const rows = [
            contact("filled", "VP"),
            contact("locked", "VP"),
            contact("loading", "VP"),
            contact("excluded", "VP"),
            contact("empty", ""),
            contact("ok", "VP"),
        ];
        rows[0].persona = "Champion";
        rows[1].lockedPersona = true;
        rows[2].loading = true;
        rows[5].company = "Example Co";
        rows[4].company = "";
        grid = new FakeGrid(rows);
        const e = engine({
            columns: { ...columns, persona: { ...persona, applies: ({ rowId }) => rowId !== "excluded" } },
        });
        const plan = e.plan({
            cells: [...grid.cells("persona"), ["ok", "not-an-ai-column"]],
            scope: "selection-empty",
        });
        expect(plan.cells.map(cell => cell.rowId)).toEqual(["ok"]);
        expect(plan.skipped).toEqual({
            populated: 1,
            "read-only": 1,
            unloaded: 1,
            "not-applicable": 1,
            "missing-input": 1,
        });
        expect(plan.columnIds).toEqual(["persona"]);
        expect(plan.requests).toBe(1);
        expect(jev.calls).toHaveLength(0);
    });

    it("evaluates populated cells only where the overwrite policy and scope allow it", () => {
        grid.byId("r1").persona = "Champion";
        const never = engine();
        expect(never.plan({ cells: [["r1", "persona"]], scope: "selection" }).skipped).toEqual({ populated: 1 });
        const suggest = engine({ columns: { persona: { ...persona, overwrite: "suggest" } } });
        expect(suggest.plan({ cells: [["r1", "persona"]], scope: "selection" }).cells).toHaveLength(1);
        expect(suggest.plan({ cells: [["r1", "persona"]], scope: "selection-empty" }).skipped).toEqual({
            populated: 1,
        });
    });

    it("skips a scope the column doesn't allow", () => {
        const e = engine();
        expect(e.plan({ cells: [["r1", "persona"]], scope: "column" }).skipped).toEqual({ "not-applicable": 1 });
    });

    it("turns a throwing state accessor into a configuration error for the cell", async () => {
        const e = engine({
            columns: {
                persona: {
                    ...persona,
                    state: () => {
                        throw new Error("no data");
                    },
                },
            },
        });
        const plan = e.plan({ cells: [["r1", "persona"]], scope: "selection" });
        expect(plan.failed).toHaveLength(1);
        await settle(e.run(plan));
        expect(e.getRecord("r1", "persona")?.error).toMatchObject({ kind: "configuration", columnId: "persona" });
        expect(jev.calls).toHaveLength(0);
    });

    it("makes no request and reads no row until a fill starts", () => {
        const e = engine();
        e.subscribe(() => undefined);
        expect(jev.calls).toHaveLength(0);
        expect(grid.reads).toBe(0);
    });
});

describe("reject", () => {
    it("marks suggestions rejected, calls onReject and writes nothing", async () => {
        const onReject = vi.fn();
        const e = engine({ onReject });
        await settle(
            e.fill({
                cells: [
                    ["r1", "persona"],
                    ["r2", "persona"],
                ],
                scope: "selection",
            })
        );
        expect(e.reject([{ rowId: "r1", columnId: "persona" }])).toEqual([{ rowId: "r1", columnId: "persona" }]);
        expect(status(e, "r1")).toBe("rejected");
        expect(onReject).toHaveBeenCalledWith({
            cells: [expect.objectContaining({ rowId: "r1", columnId: "persona", metadata: expect.anything() })],
        });
        expect(grid.byId("r1").persona).toBe("");
    });
});
