// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJevHandler, toNodeListener, type JevHandlerOptions } from "../../src/ai-fill/server/index.js";
import { createJevTransport } from "../../src/ai-fill/transport/client.js";
import type { JevTransportError } from "../../src/ai-fill/transport/errors.js";
import { createMockJev } from "../../src/ai-fill/testing/index.js";
import type { JevEndpointErrorBody, JevRequest } from "../../src/ai-fill/index.js";

const key = "test-server-key-0123";

const body: JevRequest = {
    state: { title: "VP Finance" },
    model: "jev-latest",
    questions: { q0: { type: "noul", instructions: "Does this contact own a budget?" } },
};

const answer = { model: "jev-1.13.0", answers: { q0: { type: "noul", noul: 0.9 } } };

function upstream(status: number, value: unknown, headers: Record<string, string> = {}) {
    return vi.fn(
        async (_url: RequestInfo | URL, _init?: RequestInit) =>
            new Response(typeof value === "string" ? value : JSON.stringify(value), {
                status,
                headers: { "content-type": "application/json", ...headers },
            })
    );
}

function handler(options: Partial<JevHandlerOptions> = {}) {
    const fetch = options.fetch ?? upstream(200, answer, { "x-typesafe-request-id": "req-1" });
    return {
        fetch: fetch as ReturnType<typeof upstream>,
        handle: createJevHandler({ apiKey: key, authorize: () => true, fetch, ...options }),
    };
}

function post(value: unknown, headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/jev", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof value === "string" ? value : JSON.stringify(value),
    });
}

async function errorOf(response: Response): Promise<JevEndpointErrorBody["error"]> {
    return ((await response.json()) as JevEndpointErrorBody).error;
}

function expectNoCors(response: Response) {
    expect([...response.headers.keys()].filter(name => name.startsWith("access-control-"))).toEqual([]);
}

afterEach(() => {
    vi.useRealTimers();
});

describe("createJevHandler", () => {
    it("requires authorize at construction", () => {
        expect(() => createJevHandler({ apiKey: key } as unknown as JevHandlerOptions)).toThrow(
            /authorize is required/
        );
        expect(() => createJevHandler({ apiKey: key, authorize: () => true, maxBodyBytes: 0 })).toThrow(TypeError);
    });

    it("loads without a key, and then answers authorized requests with a configuration error", async () => {
        const { handle, fetch } = handler({ apiKey: "" });
        const response = await handle(post(body));
        expect(response.status).toBe(500);
        expect((await errorOf(response)).type).toBe("server_configuration");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("forwards an authorized request with the key injected and returns Jev's body unchanged", async () => {
        const { handle, fetch } = handler();
        const response = await handle(post({ ...body, extra: "dropped" }, { authorization: "Bearer browser-token" }));
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(JSON.stringify(answer));
        expect(response.headers.get("x-typesafe-request-id")).toBe("req-1");
        expectNoCors(response);

        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://api.typesafe.ai/v1/systemone");
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${key}`);
        expect(JSON.parse(init?.body as string)).toEqual({
            state: body.state,
            model: body.model,
            questions: body.questions,
        });
    });

    it("rejects unauthorized requests before they reach Jev", async () => {
        for (const authorize of [() => false, async () => false, () => "yes" as unknown as boolean]) {
            const { handle, fetch } = handler({ authorize });
            const response = await handle(post(body));
            expect(response.status).toBe(403);
            expect((await errorOf(response)).type).toBe("forbidden");
            expect(fetch).not.toHaveBeenCalled();
        }
        const throwing = handler({
            authorize: () => {
                throw new Error("no session");
            },
        });
        expect((await throwing.handle(post(body))).status).toBe(403);
        expect(throwing.fetch).not.toHaveBeenCalled();
    });

    it("passes the request to authorize", async () => {
        const authorize = vi.fn(async (request: Request) => request.headers.get("cookie") === "session=ok");
        const { handle } = handler({ authorize });
        expect((await handle(post(body, { cookie: "session=ok" }))).status).toBe(200);
        expect((await handle(post(body, { cookie: "session=bad" }))).status).toBe(403);
    });

    it("only accepts POST", async () => {
        const { handle } = handler();
        const response = await handle(new Request("http://localhost/api/jev"));
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("POST");
    });

    it("enforces allowedModels (default jev-latest)", async () => {
        const { handle, fetch } = handler();
        const response = await handle(post({ ...body, model: "jev-preview" }));
        expect(response.status).toBe(400);
        expect((await errorOf(response)).type).toBe("model_not_allowed");
        expect(fetch).not.toHaveBeenCalled();
        const custom = handler({ allowedModels: ["jev-preview"] });
        expect((await custom.handle(post({ ...body, model: "jev-preview" }))).status).toBe(200);
    });

    it("enforces maxBodyBytes, by content-length and while streaming", async () => {
        const { handle, fetch } = handler({ maxBodyBytes: 100 });
        const big = { ...body, state: "x".repeat(200) };
        const declared = await handle(post(big));
        expect(declared.status).toBe(413);
        const encoder = new TextEncoder();
        const text = JSON.stringify(big);
        const streamed = new Request("http://localhost/api/jev", {
            method: "POST",
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(text.slice(0, 80)));
                    controller.enqueue(encoder.encode(text.slice(80)));
                    controller.close();
                },
            }),
            duplex: "half",
        } as RequestInit);
        expect((await handle(streamed)).status).toBe(413);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("enforces maxQuestions", async () => {
        const { handle, fetch } = handler({ maxQuestions: 1 });
        const two = { ...body, questions: { ...body.questions, q1: body.questions.q0 } };
        const response = await handle(post(two));
        expect(response.status).toBe(413);
        expect((await errorOf(response)).message).toContain("2 questions");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("rejects bodies that aren't JSON or don't match the contract", async () => {
        const { handle, fetch } = handler();
        expect((await handle(post("{not json"))).status).toBe(400);
        for (const bad of [
            [],
            { ...body, model: "" },
            { ...body, state: 3 },
            { ...body, questions: {} },
            { ...body, questions: { q0: { type: "poll", instructions: "?" } } },
            { ...body, questions: { q0: { type: "choice", instructions: "?", criteria: ["a"] } } },
            { ...body, questions: { q0: { type: "score", instructions: "?", criteria: {} } } },
        ]) {
            const response = await handle(post(bad));
            expect(response.status).toBe(400);
            expect((await errorOf(response)).type).toBe("invalid_request");
        }
        expect(fetch).not.toHaveBeenCalled();
    });

    it("times out an upstream call after timeoutMs with a 504", async () => {
        vi.useFakeTimers();
        const hanging = vi.fn(
            (_url: RequestInfo | URL, init?: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
                })
        );
        const { handle } = handler({ fetch: hanging, timeoutMs: 1000 });
        const pending = handle(post(body));
        await vi.advanceTimersByTimeAsync(1000);
        const response = await pending;
        expect(response.status).toBe(504);
        expect((await errorOf(response)).type).toBe("upstream_timeout");
    });

    it("answers 502 when Jev can't be reached", async () => {
        const { handle } = handler({
            fetch: async () => {
                throw new TypeError("fetch failed");
            },
        });
        const response = await handle(post(body));
        expect(response.status).toBe(502);
        expect((await errorOf(response)).type).toBe("upstream_unreachable");
    });

    it("maps upstream errors to the contract, forwarding the status and Retry-After", async () => {
        const limited = handler({
            fetch: upstream(
                429,
                { error: { type: "rate_limit_error", message: "Too many requests" } },
                {
                    "retry-after": "7",
                    "x-typesafe-request-id": "req-7",
                }
            ),
        });
        const response = await limited.handle(post(body));
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("7");
        expect(response.headers.get("x-typesafe-request-id")).toBe("req-7");
        expect(await errorOf(response)).toEqual({
            type: "rate_limit_error",
            message: "Too many requests",
            retryAfterMs: 7000,
        });
        expectNoCors(response);

        const overloaded = handler({ fetch: upstream(529, "Service overloaded", { "retry-after-ms": "250" }) });
        const second = await overloaded.handle(post(body));
        expect(second.status).toBe(529);
        expect(second.headers.get("retry-after-ms")).toBe("250");
        expect(await errorOf(second)).toMatchObject({ type: "overloaded_error", retryAfterMs: 250 });

        const invalid = handler({
            fetch: upstream(422, { detail: [{ loc: ["body", "state"], msg: "field required" }] }),
        });
        const third = await invalid.handle(post(body));
        expect(third.status).toBe(422);
        expect(await errorOf(third)).toMatchObject({ type: "validation_error", detail: [{ msg: "field required" }] });
    });

    it("never echoes the key or the upstream request headers", async () => {
        const echoing = upstream(401, {
            error: { type: "authentication_error", message: `Invalid key ${key}` },
            detail: { header: `Bearer ${key}` },
        });
        const { handle } = handler({ fetch: echoing });
        const response = await handle(post(body));
        expect(response.status).toBe(401);
        const text = await response.text();
        expect(text).not.toContain(key);
        expect(text).toContain("[redacted]");
        for (const [, value] of response.headers) expect(value).not.toContain(key);
        expect(response.headers.get("authorization")).toBeNull();
    });
});

describe("toNodeListener", () => {
    let server: http.Server | undefined;

    afterEach(async () => {
        await new Promise<void>(resolve => (server === undefined ? resolve() : server.close(() => resolve())));
        server = undefined;
    });

    it("serves the handler over Node http", async () => {
        const { handle, fetch } = handler();
        server = http.createServer(toNodeListener(handle));
        await new Promise<void>(resolve => server?.listen(0, "127.0.0.1", resolve));
        const { port } = server.address() as AddressInfo;

        const ok = await globalThis.fetch(`http://127.0.0.1:${port}/api/jev`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        expect(ok.status).toBe(200);
        expect(await ok.json()).toEqual(answer);
        expect(ok.headers.get("x-typesafe-request-id")).toBe("req-1");
        expect(fetch).toHaveBeenCalledTimes(1);

        const wrong = await globalThis.fetch(`http://127.0.0.1:${port}/api/jev`);
        expect(wrong.status).toBe(405);
    });

    it("uses a body already parsed by middleware", async () => {
        const { handle, fetch } = handler();
        const listener = toNodeListener(handle);
        const headers: Record<string, string> = {};
        const res = {
            statusCode: 0,
            setHeader: (name: string, value: string) => {
                headers[name] = value;
            },
            end: vi.fn(),
        };
        const req = {
            method: "POST",
            url: "/api/jev",
            headers: { host: "localhost", "content-type": "application/json", "content-length": "999" },
            body,
            async *[Symbol.asyncIterator]() {
                // Express has already consumed the stream.
            },
        };
        await listener(req, res);
        expect(res.statusCode).toBe(200);
        expect(headers["content-type"]).toBe("application/json");
        expect(new TextDecoder().decode(res.end.mock.calls[0][0] as Uint8Array)).toBe(JSON.stringify(answer));
        expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).state).toEqual(body.state);
    });
});

describe("endpoint contract: the browser client against the server helper", () => {
    function endpointTo(handle: (request: Request) => Promise<Response>) {
        return createJevTransport(
            {
                mode: "endpoint",
                url: "http://localhost/api/jev",
                fetch: (url, init) => handle(new Request(url as string, init)),
            },
            { timeoutMs: 5000, maxRetries: 0, backoff: { initialMs: 1, maxMs: 1, jitter: 0 }, isBrowser: false }
        );
    }

    async function failure(promise: Promise<unknown>): Promise<JevTransportError> {
        try {
            await promise;
        } catch (error) {
            return error as JevTransportError;
        }
        throw new Error("expected a failure");
    }

    it("round-trips a request through the helper to a mock Jev", async () => {
        const jev = createMockJev({ seed: 3 });
        const transport = endpointTo(createJevHandler({ apiKey: key, authorize: () => true, fetch: jev.fetch }));
        const result = await transport.send(body);
        expect(result.response.answers.q0).toMatchObject({ type: "noul" });
        expect(result.requestId).toBe("mock-0");
        expect(jev.calls[0]).toMatchObject({
            via: "fetch",
            authorized: true,
            url: "https://api.typesafe.ai/v1/systemone",
        });
    });

    it("turns the helper's errors into the right client error kinds", async () => {
        const forbidden = endpointTo(createJevHandler({ apiKey: key, authorize: () => false }));
        expect(await failure(forbidden.send(body))).toMatchObject({ kind: "authentication", httpStatus: 403 });

        const limited = endpointTo(
            createJevHandler({
                apiKey: key,
                authorize: () => true,
                fetch: createMockJev({ errors: [{ kind: "rate-limit", retryAfterMs: 1500 }] }).fetch,
            })
        );
        expect(await failure(limited.send(body))).toMatchObject({
            kind: "rate-limit",
            retryable: true,
            httpStatus: 429,
            retryAfterMs: 1500,
        });

        const tooMany = endpointTo(createJevHandler({ apiKey: key, authorize: () => true, maxQuestions: 0.5 }));
        expect(await failure(tooMany.send(body))).toMatchObject({ kind: "input-too-large", httpStatus: 413 });

        const noKey = endpointTo(createJevHandler({ apiKey: "", authorize: () => true }));
        expect(await failure(noKey.send(body))).toMatchObject({ kind: "configuration", retryable: false });

        const badModel = endpointTo(createJevHandler({ apiKey: key, authorize: () => true }));
        expect(await failure(badModel.send({ ...body, model: "jev-preview" }))).toMatchObject({
            kind: "configuration",
            httpStatus: 400,
        });
    });
});
