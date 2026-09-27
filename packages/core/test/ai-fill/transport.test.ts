import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JevRequest } from "../../src/ai-fill/index.js";
import {
    createJevTransport,
    directBrowserBlockedMessage,
    directBrowserNetworkMessage,
    type JevTransportOptions,
} from "../../src/ai-fill/transport/client.js";
import { JevTransportError, parseRetryAfter } from "../../src/ai-fill/transport/errors.js";
import { backoffDelay, retryDelay } from "../../src/ai-fill/transport/retry.js";

const request: JevRequest = {
    state: { company: "Example Co", title: "VP Finance" },
    model: "jev-latest",
    questions: { q0: { type: "noul", instructions: "Does this contact own a budget?" } },
};

const body = { model: "jev-1.13.0", answers: { q0: { type: "noul", noul: 0.9 } } };

const options: JevTransportOptions = {
    timeoutMs: 1000,
    maxRetries: 2,
    backoff: { initialMs: 500, maxMs: 5000, jitter: 0.25 },
    random: () => 0,
    isBrowser: false,
};

function json(status: number, value: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

/** A fetch that replies from a list, one reply per call, repeating the last. */
function replies(...list: (Response | Error | (() => Response))[]) {
    let i = 0;
    return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        const reply = list[Math.min(i++, list.length - 1)];
        if (reply instanceof Error) throw reply;
        return typeof reply === "function" ? reply() : reply.clone();
    });
}

/** A fetch that never answers until its signal aborts. */
function hanging() {
    return vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => {
                    const error = new Error("aborted");
                    error.name = "AbortError";
                    reject(error);
                });
            })
    );
}

async function failure(promise: Promise<unknown>): Promise<JevTransportError> {
    try {
        await promise;
    } catch (error) {
        return error as JevTransportError;
    }
    throw new Error("expected the send to fail");
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("endpoint mode", () => {
    it("POSTs the request as JSON with the app's headers and returns Jev's body", async () => {
        const fetch = replies(json(200, body, { "x-typesafe-request-id": "req-1" }));
        const transport = createJevTransport(
            { mode: "endpoint", url: "/api/jev", headers: async () => ({ "x-csrf": "token" }), fetch },
            options
        );
        const result = await transport.send(request);
        expect(result).toEqual({ response: body, requestId: "req-1", attempts: 1 });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("/api/jev");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ "x-csrf": "token", "content-type": "application/json" });
        expect(JSON.parse(init?.body as string)).toEqual(request);
    });

    it("reads the endpoint error body and forwards status and request id", async () => {
        const fetch = replies(
            json(
                403,
                { error: { type: "forbidden", message: "This request isn't allowed to use AI Fill" } },
                { "x-typesafe-request-id": "req-9" }
            )
        );
        const transport = createJevTransport({ mode: "endpoint", url: "/api/jev", fetch }, options);
        const error = await failure(transport.send(request));
        expect(error).toMatchObject({
            kind: "authentication",
            retryable: false,
            httpStatus: 403,
            requestId: "req-9",
        });
        expect(error.message).toContain("This request isn't allowed to use AI Fill");
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("reports a throwing headers() as a configuration error without sending", async () => {
        const fetch = replies(json(200, body));
        const transport = createJevTransport(
            {
                mode: "endpoint",
                url: "/api/jev",
                fetch,
                headers: () => {
                    throw new Error("no session");
                },
            },
            options
        );
        expect(await failure(transport.send(request))).toMatchObject({ kind: "configuration", retryable: false });
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("direct mode", () => {
    it("POSTs to /v1/systemone with the key and sends the configured model as given", async () => {
        const fetch = replies(json(200, body));
        const transport = createJevTransport({ mode: "direct", apiKey: "test-key", fetch }, options);
        await transport.send({ ...request, model: "jev-preview" });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://api.typesafe.ai/v1/systemone");
        expect(init?.headers).toMatchObject({ authorization: "Bearer test-key" });
        expect(JSON.parse(init?.body as string).model).toBe("jev-preview");
    });

    it("uses baseURL when set", async () => {
        const fetch = replies(json(200, body));
        const transport = createJevTransport(
            { mode: "direct", apiKey: "test-key", baseURL: "http://localhost:8787/", fetch },
            options
        );
        await transport.send(request);
        expect(fetch.mock.calls[0][0]).toBe("http://localhost:8787/v1/systemone");
    });

    it("never puts the key in an error message", async () => {
        const fetch = replies(
            json(401, { error: { type: "authentication_error", message: "Invalid API key test-key-123" } })
        );
        const transport = createJevTransport({ mode: "direct", apiKey: "test-key-123", fetch }, options);
        const error = await failure(transport.send(request));
        expect(error.kind).toBe("authentication");
        expect(error.message).not.toContain("test-key-123");
        expect(error.message).toContain("[redacted]");
    });

    it("in a browser without dangerouslyAllowBrowser, fails with a configuration error and sends nothing", async () => {
        const fetch = replies(json(200, body));
        const transport = createJevTransport(
            { mode: "direct", apiKey: "test-key", fetch },
            { ...options, isBrowser: true }
        );
        const error = await failure(transport.send(request));
        expect(error).toMatchObject({ kind: "configuration", retryable: false, message: directBrowserBlockedMessage });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("in a browser with dangerouslyAllowBrowser, warns once, however many transports and requests", async () => {
        vi.resetModules();
        const fresh = await import("../../src/ai-fill/transport/client.js");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            const fetch = replies(json(200, body));
            const connection = { mode: "direct", apiKey: "test-key", dangerouslyAllowBrowser: true, fetch } as const;
            const first = fresh.createJevTransport(connection, { ...options, isBrowser: true });
            const second = fresh.createJevTransport(connection, { ...options, isBrowser: true });
            await first.send(request);
            await second.send(request);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(fresh.directBrowserWarning);
            expect(fetch).toHaveBeenCalledTimes(2);
        } finally {
            warn.mockRestore();
        }
    });

    it("doesn't warn outside a browser", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            createJevTransport({ mode: "direct", apiKey: "test-key", dangerouslyAllowBrowser: true }, options);
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it("reports an opaque network failure in a browser as a network error pointing to endpoint mode", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            const fetch = replies(new TypeError("Failed to fetch"));
            const transport = createJevTransport(
                { mode: "direct", apiKey: "test-key", dangerouslyAllowBrowser: true, fetch },
                { ...options, isBrowser: true, maxRetries: 0 }
            );
            const error = await failure(transport.send(request));
            expect(error).toMatchObject({ kind: "network", retryable: true, message: directBrowserNetworkMessage });
            expect(error.message).toMatch(/endpoint mode/);
        } finally {
            warn.mockRestore();
        }
    });
});

describe("custom mode", () => {
    it("calls send with the request and a signal", async () => {
        const send = vi.fn(async () => body);
        const transport = createJevTransport({ mode: "custom", send: send as never }, options);
        expect((await transport.send(request)).response).toEqual(body);
        expect(send).toHaveBeenCalledWith(request, expect.any(AbortSignal));
    });

    it("keeps the kind of a thrown JevTransportError and treats other throws as network errors", async () => {
        const rateLimited = createJevTransport(
            {
                mode: "custom",
                send: async () => {
                    throw new JevTransportError({ kind: "invalid-request", message: "bad", retryable: false });
                },
            },
            options
        );
        expect(await failure(rateLimited.send(request))).toMatchObject({ kind: "invalid-request" });

        const broken = createJevTransport(
            {
                mode: "custom",
                send: async () => {
                    throw new Error("socket closed");
                },
            },
            { ...options, maxRetries: 0 }
        );
        expect(await failure(broken.send(request))).toMatchObject({ kind: "network", retryable: true });
    });
});

describe("error normalization", () => {
    it.each([
        [400, "configuration", false],
        [401, "authentication", false],
        [403, "authentication", false],
        [404, "configuration", false],
        [408, "timeout", true],
        [413, "input-too-large", false],
        [422, "invalid-request", false],
        [429, "rate-limit", true],
        [500, "network", true],
        [502, "network", true],
        [503, "overloaded", true],
        [504, "timeout", true],
        [529, "overloaded", true],
    ])("maps HTTP %i to %s (retryable: %s)", async (status, kind, retryable) => {
        const fetch = replies(json(status, { error: { type: "some_error", message: "details" } }));
        const transport = createJevTransport(
            { mode: "endpoint", url: "/api/jev", fetch },
            { ...options, maxRetries: 0 }
        );
        const error = await failure(transport.send(request));
        expect(error).toMatchObject({ kind, retryable, httpStatus: status });
        expect(error.message).toContain("details");
    });

    it("maps a 500 server_configuration from the endpoint to a configuration error", async () => {
        const fetch = replies(json(500, { error: { type: "server_configuration", message: "no key" } }));
        const transport = createJevTransport({ mode: "endpoint", url: "/api/jev", fetch }, options);
        expect(await failure(transport.send(request))).toMatchObject({ kind: "configuration", retryable: false });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("includes a 422's detail in the message", async () => {
        const fetch = replies(json(422, { detail: [{ loc: ["body", "model"], msg: "field required" }] }));
        const transport = createJevTransport({ mode: "direct", apiKey: "k", fetch }, options);
        const error = await failure(transport.send(request));
        expect(error.kind).toBe("invalid-request");
        expect(error.message).toContain("field required");
    });

    it("reports a 200 without JSON, or without answers, as malformed", async () => {
        const notJson = createJevTransport(
            { mode: "endpoint", url: "/api/jev", fetch: replies(new Response("<html>", { status: 200 })) },
            options
        );
        expect(await failure(notJson.send(request))).toMatchObject({ kind: "malformed", retryable: false });
        const noAnswers = createJevTransport(
            { mode: "endpoint", url: "/api/jev", fetch: replies(json(200, { model: "jev-1.13.0" })) },
            options
        );
        expect(await failure(noAnswers.send(request))).toMatchObject({ kind: "malformed", retryable: false });
    });

    it("reports a failed fetch in endpoint mode as a retryable network error", async () => {
        const fetch = replies(new TypeError("fetch failed"));
        const transport = createJevTransport(
            { mode: "endpoint", url: "/api/jev", fetch },
            { ...options, maxRetries: 0 }
        );
        const error = await failure(transport.send(request));
        expect(error).toMatchObject({ kind: "network", retryable: true });
        expect(error.message).toContain("/api/jev");
    });
});

describe("retries and backoff", () => {
    it("computes backoff from 500 ms to 5 s with jitter", () => {
        const backoff = { initialMs: 500, maxMs: 5000, jitter: 0.25 };
        expect([0, 1, 2, 3, 4, 5].map(attempt => backoffDelay(attempt, backoff, () => 0))).toEqual([
            500, 1000, 2000, 4000, 5000, 5000,
        ]);
        expect(backoffDelay(0, backoff, () => 1)).toBe(375);
    });

    it("honors a server delay up to 60 s, and falls back to backoff beyond", () => {
        const backoff = { initialMs: 500, maxMs: 5000, jitter: 0 };
        expect(retryDelay({ retryAfterMs: 60_000 }, 0, backoff, () => 0)).toBe(60_000);
        expect(retryDelay({ retryAfterMs: 60_001 }, 0, backoff, () => 0)).toBe(500);
        expect(retryDelay({}, 1, backoff, () => 0)).toBe(1000);
    });

    it("parses retry-after-ms, Retry-After seconds and dates, and the endpoint body", () => {
        expect(parseRetryAfter(new Headers({ "retry-after-ms": "1500", "retry-after": "9" }))).toBe(1500);
        expect(parseRetryAfter(new Headers({ "retry-after": "3" }))).toBe(3000);
        const now = Date.parse("2026-09-25T12:00:00Z");
        expect(parseRetryAfter(new Headers({ "retry-after": "Fri, 25 Sep 2026 12:00:10 GMT" }), undefined, now)).toBe(
            10_000
        );
        expect(parseRetryAfter(new Headers(), 2500)).toBe(2500);
        expect(parseRetryAfter(new Headers({ "retry-after": "soon" }))).toBeUndefined();
    });

    it("retries a 5xx with backoff and succeeds", async () => {
        const fetch = replies(json(500, {}), json(200, body));
        const transport = createJevTransport({ mode: "endpoint", url: "/api/jev", fetch }, options);
        const promise = transport.send(request);
        await vi.advanceTimersByTimeAsync(499);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect((await promise).attempts).toBe(2);
    });

    it("honors retry-after-ms on a 429", async () => {
        const fetch = replies(json(429, {}, { "retry-after-ms": "1234" }), json(200, body));
        const transport = createJevTransport({ mode: "direct", apiKey: "k", fetch }, options);
        const promise = transport.send(request);
        await vi.advanceTimersByTimeAsync(1233);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        await promise;
    });

    it("honors Retry-After seconds, and ignores delays over 60 s in favor of backoff", async () => {
        const fetch = replies(
            json(529, {}, { "retry-after": "3" }),
            json(529, {}, { "retry-after": "120" }),
            json(200, body)
        );
        const transport = createJevTransport({ mode: "direct", apiKey: "k", fetch }, options);
        const promise = transport.send(request);
        await vi.advanceTimersByTimeAsync(2999);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        // The 120 s delay is over the 60 s cap, so the second backoff (1 s) applies.
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetch).toHaveBeenCalledTimes(3);
        await promise;
    });

    it("gives a retryable rate-limit error after the last retry, with the server's delay", async () => {
        const fetch = replies(json(429, { error: { message: "slow down" } }, { "retry-after-ms": "2000" }));
        const transport = createJevTransport({ mode: "direct", apiKey: "k", fetch }, options);
        const promise = failure(transport.send(request));
        await vi.advanceTimersByTimeAsync(10_000);
        expect(await promise).toMatchObject({
            kind: "rate-limit",
            retryable: true,
            httpStatus: 429,
            retryAfterMs: 2000,
        });
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it.each([400, 401, 403, 413, 422])("never retries HTTP %i", async status => {
        const fetch = replies(json(status, {}));
        const transport = createJevTransport({ mode: "direct", apiKey: "k", fetch }, options);
        await failure(transport.send(request));
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe("timeouts and cancellation", () => {
    it("times out each attempt, retries, then fails with a timeout error", async () => {
        const fetch = hanging();
        const transport = createJevTransport({ mode: "endpoint", url: "/api/jev", fetch }, options);
        const promise = failure(transport.send(request));
        await vi.advanceTimersByTimeAsync(999);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(500 + 1000 + 1000 + 1000);
        expect(await promise).toMatchObject({ kind: "timeout", retryable: true });
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("times out a custom send that ignores its signal", async () => {
        const transport = createJevTransport(
            { mode: "custom", send: () => new Promise(() => undefined) },
            { ...options, maxRetries: 0 }
        );
        const promise = failure(transport.send(request));
        await vi.advanceTimersByTimeAsync(1000);
        expect(await promise).toMatchObject({ kind: "timeout" });
    });

    it("stops at once when the caller aborts, without retrying", async () => {
        const fetch = hanging();
        const transport = createJevTransport({ mode: "endpoint", url: "/api/jev", fetch }, options);
        const controller = new AbortController();
        const promise = transport.send(request, controller.signal);
        const settled = promise.then(
            () => "resolved",
            (error: Error) => error.name
        );
        await vi.advanceTimersByTimeAsync(100);
        controller.abort();
        expect(await settled).toBe("AbortError");
        await vi.advanceTimersByTimeAsync(10_000);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("stops a pending retry when the caller aborts", async () => {
        const fetch = replies(json(503, {}));
        const transport = createJevTransport({ mode: "endpoint", url: "/api/jev", fetch }, options);
        const controller = new AbortController();
        const settled = transport.send(request, controller.signal).then(
            () => "resolved",
            (error: Error) => error.name
        );
        await vi.advanceTimersByTimeAsync(100);
        controller.abort();
        expect(await settled).toBe("AbortError");
        await vi.advanceTimersByTimeAsync(10_000);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
