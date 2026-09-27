import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseJevAnswer, type JevQuestion, type JevRequest, type JevResponse } from "../../src/ai-fill/index.js";
import { buildQuestion } from "../../src/ai-fill/identity/fingerprints.js";
import { createJevTransport } from "../../src/ai-fill/transport/client.js";
import { createMockJev, type MockJevOptions } from "../../src/ai-fill/testing/index.js";
import { choiceRequest, choiceResponse } from "./fixtures/jev-contract.js";
import { ownsBudget, persona, seniority } from "./fixtures/definitions.js";

const questions: Record<string, JevQuestion> = {
    q0: buildQuestion(persona),
    q1: buildQuestion(seniority),
    q2: buildQuestion(ownsBudget),
};

function request(state: unknown = { title: "VP Finance", company: "Example Co" }): JevRequest {
    return { state: state as JevRequest["state"], model: "jev-latest", questions };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

async function run<T>(promise: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return promise;
}

describe("createMockJev", () => {
    it("is deterministic: the same seed gives the same answers, whatever the call order", async () => {
        const a = createMockJev({ seed: 42 });
        const b = createMockJev({ seed: 42 });
        await run(b.send(request({ title: "Other" })));
        const first = await run(a.send(request()));
        const second = await run(b.send(request()));
        expect(second.answers).toEqual(first.answers);
        const other = await run(createMockJev({ seed: 43 }).send(request()));
        expect(other.answers).not.toEqual(first.answers);
    });

    it("answers every primitive in shapes that pass parseJevAnswer", async () => {
        const jev = createMockJev({ seed: "shapes" });
        for (let i = 0; i < 50; i++) {
            const response = await run(jev.send(request({ n: i })));
            for (const [id, question] of Object.entries(questions)) {
                const parsed = parseJevAnswer(response.answers[id], question, response.model);
                expect(parsed.ok, `${id} #${i}: ${parsed.ok ? "" : parsed.reason}`).toBe(true);
            }
        }
    });

    it("reports a versioned model for aliases and echoes versioned ids", async () => {
        const jev = createMockJev();
        expect((await run(jev.send(request()))).model).toBe("jev-mock-1.0.0");
        expect((await run(jev.send({ ...request(), model: "jev-1.13.0" }))).model).toBe("jev-1.13.0");
        expect((await run(createMockJev({ model: "jev-2.0.0" }).send(request()))).model).toBe("jev-2.0.0");
    });

    it("answers by question id, instructions and state with rules, and replays fixtures", async () => {
        const jev = createMockJev({
            rules: [
                { questionId: "q2", state: /CFO/, answer: { type: "noul", noul: 0.97 } },
                { instructions: /buyer persona/, answer: () => undefined },
                {
                    instructions: "How senior is this contact?",
                    answer: ({ random }) => ({
                        type: "score",
                        score: 3,
                        legend: {},
                        probabilities: { "0": 0, "1": 0, "2": 0, "3": 1 },
                        confidence: random() >= 0 ? 0.9 : 0,
                    }),
                },
            ],
            fixtures: [{ request: choiceRequest, response: choiceResponse as unknown as JevResponse }],
        });
        const cfo = await run(jev.send(request({ title: "CFO" })));
        expect(cfo.answers.q2).toEqual({ type: "noul", noul: 0.97 });
        expect(cfo.answers.q1).toMatchObject({ type: "score", score: 3, confidence: 0.9 });
        expect(cfo.answers.q0.type).toBe("choice");
        const vp = await run(jev.send(request({ title: "VP" })));
        expect(vp.answers.q2).not.toEqual({ type: "noul", noul: 0.97 });
        expect(await run(jev.send(choiceRequest as unknown as JevRequest))).toBe(choiceResponse as unknown);
    });

    it("controls latency with timers and honors abort", async () => {
        const jev = createMockJev({ latencyMs: call => (call.index === 0 ? 1000 : 10) });
        let done = false;
        const first = jev.send(request()).then(() => {
            done = true;
        });
        await vi.advanceTimersByTimeAsync(999);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await first;
        expect(done).toBe(true);

        const controller = new AbortController();
        const aborted = jev.send(request(), controller.signal).catch((error: Error) => error.name);
        controller.abort();
        expect(await aborted).toBe("AbortError");
        expect(jev.calls.map(call => call.status)).toEqual(["answered", "aborted"]);
    });

    it("keeps a call log, without authorization values, and resets it", async () => {
        const jev = createMockJev();
        await run(jev.send(request()));
        await run(
            jev.fetch("https://api.typesafe.ai/v1/systemone", {
                method: "POST",
                headers: { authorization: "Bearer secret-value" },
                body: JSON.stringify(request()),
            })
        );
        expect(jev.calls).toMatchObject([
            { index: 0, via: "send", status: "answered", httpStatus: 200 },
            {
                index: 1,
                via: "fetch",
                authorized: true,
                url: "https://api.typesafe.ai/v1/systemone",
                status: "answered",
            },
        ]);
        expect(JSON.stringify(jev.calls)).not.toContain("secret-value");
        jev.reset();
        expect(jev.calls).toEqual([]);
    });

    it("behaves like Jev on /v1/systemone (a key is required) and like an endpoint elsewhere", async () => {
        const jev = createMockJev();
        const noKey = await run(
            jev.fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", body: JSON.stringify(request()) })
        );
        expect(noKey.status).toBe(401);
        const endpoint = await run(jev.fetch("/api/jev", { method: "POST", body: JSON.stringify(request()) }));
        expect(endpoint.status).toBe(200);
        expect(endpoint.headers.get("x-typesafe-request-id")).toBe("mock-1");
    });

    type Kind = NonNullable<MockJevOptions["errors"]>[number]["kind"];
    const expected: [Kind, string, boolean][] = [
        ["authentication", "authentication", false],
        ["configuration", "configuration", false],
        ["invalid-request", "invalid-request", false],
        ["input-too-large", "input-too-large", false],
        ["rate-limit", "rate-limit", true],
        ["overloaded", "overloaded", true],
        ["server-error", "network", true],
        ["network", "network", true],
        ["timeout", "timeout", true],
        ["malformed", "malformed", false],
        ["evaluation", "evaluation", true],
    ];

    it.each(expected)("injects %s errors through send and fetch", async (kind, clientKind) => {
        for (const via of ["send", "fetch"] as const) {
            const jev = createMockJev({ errors: [{ kind, calls: [0], retryAfterMs: 500 }] });
            const transport = createJevTransport(
                via === "send" ? jev.connection : { mode: "endpoint", url: "/api/jev", fetch: jev.fetch },
                { timeoutMs: 1000, maxRetries: 0, backoff: { initialMs: 1, maxMs: 1, jitter: 0 }, isBrowser: false }
            );
            const outcome = transport.send(request()).then(
                result => ({ ok: true as const, result }),
                (error: { kind: string }) => ({ ok: false as const, error })
            );
            await vi.runAllTimersAsync();
            const settled = await outcome;
            if (kind === "malformed" || kind === "evaluation") {
                // These arrive as a 200; the engine turns them into per-cell errors.
                expect(settled.ok).toBe(true);
                const answers = settled.ok ? settled.result.response.answers : {};
                if (kind === "evaluation") expect(answers).toEqual({});
                else expect(parseJevAnswer(answers.q0, questions.q0, "jev-mock-1.0.0").ok).toBe(false);
                expect(clientKind).toBe(kind);
            } else {
                expect(settled.ok ? undefined : settled.error.kind).toBe(clientKind);
            }
            const logged =
                kind === "timeout" ? "aborted" : kind === "malformed" || kind === "evaluation" ? "answered" : "failed";
            expect(jev.calls[0].status).toBe(logged);
            // The error applies only to the listed call.
            const next = transport.send(request());
            await vi.runAllTimersAsync();
            expect((await next).response.answers.q0).toBeDefined();
        }
    });

    it("limits an injected error with times", async () => {
        const jev = createMockJev({ errors: [{ kind: "overloaded", times: 1 }] });
        const first = expect(jev.send(request())).rejects.toMatchObject({ kind: "overloaded" });
        await vi.runAllTimersAsync();
        await first;
        await expect(run(jev.send(request()))).resolves.toMatchObject({ model: "jev-mock-1.0.0" });
    });
});
