/**
 * `@specstory/ai-data-grid/testing`: a deterministic stand-in for Jev, for
 * tests, Storybook and local development. It makes no network calls.
 */

import type {
    JevAnswer,
    JevChoiceAnswer,
    JevNoulAnswer,
    JevPrimitive,
    JevQuestion,
    JevRequest,
    JevResponse,
    JevScoreAnswer,
    JevState,
} from "../contract/types.js";
import { canonicalJson } from "../identity/canonical-json.js";
import { shortHash } from "../identity/fingerprints.js";
import { abortError, errorFromResponse } from "../transport/errors.js";

/** What a rule's `answer` function receives. */
interface MockJevAnswerContext {
    readonly questionId: string;
    readonly question: JevQuestion;
    readonly state: JevState;
    /** A deterministic random source for this question and state. */
    readonly random: () => number;
}

/**
 * Answers the questions it matches. Every condition that is set must match.
 * Rules are tried in order, and the first that returns an answer wins; a
 * question no rule answers gets a generated answer.
 */
export interface MockJevRule {
    /** The question id in the request. AI Fill sends `q0`, `q1`, … within each request. */
    readonly questionId?: string;
    readonly type?: JevPrimitive;
    /**
     * The question's instructions: equal to a string, or matching a RegExp. For
     * a column with `context`, AI Fill sends `{ instructions, context }`, and the
     * inner `instructions` string is matched. Other object instructions are
     * matched as canonical JSON.
     */
    readonly instructions?: string | RegExp;
    /** The request's state: a predicate, or a RegExp tested against its canonical JSON. */
    readonly state?: RegExp | ((state: JevState) => boolean);
    /** The answer, or a function returning it (or `undefined` to leave the question to the next rule). */
    readonly answer: JevAnswer | ((context: MockJevAnswerContext) => JevAnswer | undefined);
}

/** One call to the mock. */
export interface MockJevCall {
    /** 0-based, in the order calls started. */
    readonly index: number;
    /** `send` for the custom connection, `fetch` for the mock `fetch`. */
    readonly via: "send" | "fetch";
    /** The URL, for `fetch` calls. */
    readonly url?: string;
    /** Whether an `Authorization` header was sent, for `fetch` calls. Its value is never recorded. */
    readonly authorized?: boolean;
    /** The request body. `undefined` for a `fetch` body that isn't JSON. */
    readonly request?: JevRequest;
    /** `Date.now()` when the call started. */
    readonly startedAt: number;
    readonly status: "pending" | "answered" | "failed" | "aborted";
    /** The HTTP status of the reply, for answered and failed calls. */
    readonly httpStatus?: number;
    /** The injected error kind, for failed calls. */
    readonly error?: string;
    /** The response body, for answered calls. */
    readonly response?: JevResponse;
}

/** Options for {@link createMockJev}. */
export interface MockJevOptions {
    /** Rules that answer matching questions. */
    readonly rules?: readonly MockJevRule[];
    /**
     * Recorded exchanges, replayed when a request's `state` and `questions`
     * equal a fixture's (compared as canonical JSON). Use synthetic data only.
     */
    readonly fixtures?: readonly {
        readonly request: Pick<JevRequest, "state" | "questions">;
        readonly response: JevResponse;
    }[];
    /** How long each call takes, in milliseconds (with timers, so fake timers control it). Default 0. */
    readonly latencyMs?: number | ((call: MockJevCall) => number);
    /**
     * Errors to inject. For each call, the first entry that applies is used:
     * - `authentication` (401), `configuration` (400), `invalid-request` (422),
     *   `input-too-large` (413), `rate-limit` (429), `overloaded` (529) and
     *   `server-error` (500) reply with that status
     * - `network` fails as if the connection dropped
     * - `timeout` never replies, so the per-attempt timeout fires
     * - `malformed` answers with a wrong answer type, and `evaluation` leaves the answers out
     */
    readonly errors?: readonly {
        readonly kind:
            | "authentication"
            | "configuration"
            | "invalid-request"
            | "input-too-large"
            | "rate-limit"
            | "overloaded"
            | "server-error"
            | "network"
            | "timeout"
            | "malformed"
            | "evaluation";
        /** The 0-based call indexes it applies to. Default: every call. */
        readonly calls?: readonly number[];
        /** How many calls it applies to at most. Default: no limit. */
        readonly times?: number;
        /** Sent as `retry-after-ms` (and in the error body) with the error. */
        readonly retryAfterMs?: number;
        readonly message?: string;
    }[];
    /** Changes every generated answer. The same seed always gives the same answers. Default 0. */
    readonly seed?: number | string;
    /**
     * The model id reported in responses. Default: `jev-mock-1.0.0` for the
     * `jev-latest` and `jev-preview` aliases, and the requested id otherwise.
     */
    readonly model?: string | ((requested: string) => string);
}

/** A mock Jev, from {@link createMockJev}. */
export interface MockJev {
    /** A connection for `aiFill.connection`: `{ mode: "custom", send }`. */
    readonly connection: { readonly mode: "custom"; readonly send: MockJev["send"] };
    /** Answers a request directly, as a custom connection's `send`. */
    readonly send: (request: JevRequest, signal?: AbortSignal) => Promise<JevResponse>;
    /**
     * A `fetch` for endpoint and direct connections (`connection.fetch`). URLs
     * ending in `/v1/systemone` behave like Jev and need an `Authorization`
     * header; any other URL behaves like an endpoint built with `createJevHandler`.
     */
    readonly fetch: typeof fetch;
    /** Every call so far, in order. */
    readonly calls: readonly MockJevCall[];
    /** Clears the call log and the injected-error counters. */
    reset(): void;
}

type ErrorSpec = NonNullable<MockJevOptions["errors"]>[number];

const statusByKind: { readonly [kind: string]: readonly [number, string] } = {
    authentication: [401, "authentication_error"],
    configuration: [400, "api_usage_error"],
    "invalid-request": [422, "validation_error"],
    "input-too-large": [413, "payload_too_large"],
    "rate-limit": [429, "rate_limit_error"],
    overloaded: [529, "overloaded_error"],
    "server-error": [500, "api_error"],
};

/** mulberry32: a small, fast, deterministic PRNG. */
function prng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        // mulberry32's increment, 0x6D2B79F5.
        a = (a + 1_831_565_813) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
}

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

/** A probability distribution over `n` outcomes, rounded to 4 decimals and summing to 1. */
function distribution(n: number, random: () => number): number[] {
    const weights = Array.from({ length: n }, () => random() ** 4 + 1e-6);
    const total = weights.reduce((sum, w) => sum + w, 0);
    const probabilities = weights.map(w => round(w / total, 4));
    const top = probabilities.indexOf(Math.max(...probabilities));
    probabilities[top] = round(probabilities[top] + 1 - probabilities.reduce((sum, p) => sum + p, 0), 4);
    return probabilities;
}

/** 1 minus the normalized entropy: 1 when all the probability is on one outcome. */
function concentration(probabilities: readonly number[]): number {
    if (probabilities.length < 2) return 1;
    const entropy = probabilities.reduce((sum, p) => (p > 0 ? sum - p * Math.log(p) : sum), 0);
    return Math.min(1, Math.max(0, round(1 - entropy / Math.log(probabilities.length), 2)));
}

function generate(question: JevQuestion, random: () => number): JevAnswer {
    switch (question.type) {
        case "choice": {
            const ids = Object.keys(question.criteria);
            const probabilities = distribution(ids.length, random);
            let best = 0;
            for (let i = 1; i < ids.length; i++) if (probabilities[i] > probabilities[best]) best = i;
            const answer: JevChoiceAnswer = {
                type: "choice",
                choice: ids[best],
                probabilities: Object.fromEntries(ids.map((id, i) => [id, probabilities[i]])),
                confidence: concentration(probabilities),
            };
            return answer;
        }
        case "score": {
            const levels = question.criteria.length;
            const probabilities = distribution(levels, random);
            const score = probabilities.reduce((sum, p, i) => sum + p * i, 0);
            const answer: JevScoreAnswer = {
                type: "score",
                score: Math.min(levels - 1, Math.max(0, round(score, 2))),
                legend: Object.fromEntries(question.criteria.map((level, i) => [String(i), level])),
                probabilities: Object.fromEntries(probabilities.map((p, i) => [String(i), p])),
                confidence: concentration(probabilities),
            };
            return answer;
        }
        case "noul": {
            const answer: JevNoulAnswer = { type: "noul", noul: round(random(), 2) };
            return answer;
        }
    }
}

function instructionsText(question: JevQuestion): string {
    const instructions = question.instructions;
    if (typeof instructions === "string") return instructions;
    if (
        typeof instructions === "object" &&
        !Array.isArray(instructions) &&
        typeof (instructions as { instructions?: unknown }).instructions === "string"
    ) {
        return (instructions as { instructions: string }).instructions;
    }
    return canonicalJson(instructions);
}

function ruleMatches(rule: MockJevRule, questionId: string, question: JevQuestion, state: JevState): boolean {
    if (rule.questionId !== undefined && rule.questionId !== questionId) return false;
    if (rule.type !== undefined && rule.type !== question.type) return false;
    if (rule.instructions !== undefined) {
        const text = instructionsText(question);
        if (typeof rule.instructions === "string" ? rule.instructions !== text : !rule.instructions.test(text)) {
            return false;
        }
    }
    if (rule.state !== undefined) {
        const matched = typeof rule.state === "function" ? rule.state(state) : rule.state.test(canonicalJson(state));
        if (!matched) return false;
    }
    return true;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted === true) {
            reject(abortError());
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        const timer =
            ms === Number.POSITIVE_INFINITY
                ? undefined
                : setTimeout(() => {
                      signal?.removeEventListener("abort", onAbort);
                      resolve();
                  }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

class HttpFailure {
    constructor(
        readonly status: number,
        readonly body: unknown,
        readonly headers: Headers,
        readonly kind: string
    ) {}
}

class NetworkFailure {
    constructor(readonly kind: string) {}
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
}

/**
 * Creates a deterministic mock of Jev. It answers each question by, in order:
 * a matching fixture (the whole request), the first matching rule, or a
 * generated answer. Generated answers depend only on the seed, the state and
 * the question (never on call order or question ids), and always pass
 * `parseJevAnswer`: Choice probabilities sum to 1 and the choice is the most
 * probable option, Scores are probability-weighted positions with a legend,
 * and Nouls are in [0, 1]. Every call is logged in `calls`.
 *
 * @example
 * ```ts
 * import { createMockJev } from "@specstory/ai-data-grid/testing";
 *
 * const jev = createMockJev({
 *     seed: 1,
 *     latencyMs: 300,
 *     rules: [{ instructions: /budget/, answer: { type: "noul", noul: 0.92 } }],
 * });
 * <DataEditor aiFill={{ ...aiFill, connection: jev.connection }} … />
 * ```
 */
export function createMockJev(options: MockJevOptions = {}): MockJev {
    const calls: MockJevCall[] = [];
    const used = new Map<ErrorSpec, number>();
    const seed = String(options.seed ?? 0);

    const reportedModel = (requested: string): string => {
        if (typeof options.model === "string") return options.model;
        if (typeof options.model === "function") return options.model(requested);
        return requested === "jev-latest" || requested === "jev-preview" ? "jev-mock-1.0.0" : requested;
    };

    const update = (index: number, changes: Partial<MockJevCall>) => {
        calls[index] = { ...calls[index], ...changes };
    };

    const injected = (index: number): ErrorSpec | undefined => {
        for (const spec of options.errors ?? []) {
            if (spec.calls !== undefined && !spec.calls.includes(index)) continue;
            const count = used.get(spec) ?? 0;
            if (spec.times !== undefined && count >= spec.times) continue;
            used.set(spec, count + 1);
            return spec;
        }
        return undefined;
    };

    const answer = (request: JevRequest): JevResponse => {
        const key = canonicalJson({ state: request.state, questions: request.questions });
        const fixture = options.fixtures?.find(
            f => canonicalJson({ state: f.request.state, questions: f.request.questions }) === key
        );
        if (fixture !== undefined) return fixture.response;
        const stateJson = canonicalJson(request.state);
        const answers: Record<string, JevAnswer> = {};
        for (const [questionId, question] of Object.entries(request.questions)) {
            const random = prng(
                Number.parseInt(shortHash(`${seed}\u0000${stateJson}\u0000${canonicalJson(question)}`), 16)
            );
            let result: JevAnswer | undefined;
            for (const rule of options.rules ?? []) {
                if (!ruleMatches(rule, questionId, question, request.state)) continue;
                result =
                    typeof rule.answer === "function"
                        ? rule.answer({ questionId, question, state: request.state, random })
                        : rule.answer;
                if (result !== undefined) break;
            }
            answers[questionId] = result ?? generate(question, random);
        }
        return {
            model: reportedModel(request.model),
            answers,
            usage: { input_tokens: Math.ceil(key.length / 4), output_tokens: 12 * Object.keys(answers).length },
        };
    };

    /** Runs one call: latency, then an injected error or an answer. Throws HttpFailure or NetworkFailure. */
    const handle = async (
        index: number,
        request: JevRequest,
        signal: AbortSignal | undefined
    ): Promise<JevResponse> => {
        const latency =
            typeof options.latencyMs === "function" ? options.latencyMs(calls[index]) : (options.latencyMs ?? 0);
        const spec = injected(index);
        await sleep(spec?.kind === "timeout" ? Number.POSITIVE_INFINITY : latency, signal);
        if (spec === undefined) return answer(request);
        switch (spec.kind) {
            case "network":
                throw new NetworkFailure(spec.kind);
            case "timeout":
                throw abortError();
            case "malformed": {
                const response = answer(request);
                const wrong = Object.fromEntries(
                    Object.keys(response.answers).map(id => [
                        id,
                        { type: "unexpected", value: 1 } as unknown as JevAnswer,
                    ])
                );
                return { ...response, answers: wrong };
            }
            case "evaluation":
                return { ...answer(request), answers: {} };
        }
        const [status, type] = statusByKind[spec.kind];
        const headers = new Headers({ "content-type": "application/json", "x-typesafe-request-id": `mock-${index}` });
        if (spec.retryAfterMs !== undefined) headers.set("retry-after-ms", String(spec.retryAfterMs));
        const error = {
            type,
            message: spec.message ?? `Injected ${spec.kind} error`,
            ...(spec.retryAfterMs === undefined ? {} : { retryAfterMs: spec.retryAfterMs }),
        };
        const body = spec.kind === "invalid-request" ? { error, detail: [{ msg: error.message }] } : { error };
        throw new HttpFailure(status, body, headers, spec.kind);
    };

    const start = (via: MockJevCall["via"], request: JevRequest | undefined, extra: Partial<MockJevCall>): number => {
        const index = calls.length;
        calls.push({
            index,
            via,
            ...extra,
            ...(request === undefined ? {} : { request }),
            startedAt: Date.now(),
            status: "pending",
        });
        return index;
    };

    const send: MockJev["send"] = async (request, signal) => {
        const index = start("send", request, {});
        try {
            const response = await handle(index, request, signal);
            update(index, { status: "answered", httpStatus: 200, response });
            return response;
        } catch (error) {
            if (error instanceof HttpFailure) {
                update(index, { status: "failed", httpStatus: error.status, error: error.kind });
                throw errorFromResponse(error.status, error.headers, error.body, {
                    source: "custom",
                    requestId: `mock-${index}`,
                });
            }
            if (error instanceof NetworkFailure) {
                update(index, { status: "failed", error: error.kind });
                throw new TypeError("fetch failed");
            }
            update(index, { status: "aborted" });
            throw error;
        }
    };

    const mockFetch: typeof fetch = async (input, init) => {
        const url = requestUrl(input);
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const authorized =
            (headers.get("authorization") ?? "").startsWith("Bearer ") && headers.get("authorization") !== "Bearer ";
        const direct = /\/v1\/systemone\/?$/.test(new URL(url, "http://localhost").pathname);
        let request: JevRequest | undefined;
        try {
            request = JSON.parse(typeof init?.body === "string" ? init.body : "") as JevRequest;
        } catch {
            request = undefined;
        }
        const index = start("fetch", request, { url, authorized });
        const json = (status: number, body: unknown, extra?: Headers) => {
            const responseHeaders = new Headers(extra);
            responseHeaders.set("content-type", "application/json");
            responseHeaders.set("x-typesafe-request-id", `mock-${index}`);
            return new Response(JSON.stringify(body), { status, headers: responseHeaders });
        };
        if (request === undefined) {
            update(index, { status: "failed", httpStatus: 400, error: "configuration" });
            return json(400, { error: { type: "invalid_request", message: "The request body isn't valid JSON" } });
        }
        if (direct && !authorized) {
            update(index, { status: "failed", httpStatus: 401, error: "authentication" });
            return json(401, { error: { type: "authentication_error", message: "Missing API key" } });
        }
        try {
            const response = await handle(index, request, init?.signal ?? undefined);
            update(index, { status: "answered", httpStatus: 200, response });
            return json(200, response);
        } catch (error) {
            if (error instanceof HttpFailure) {
                update(index, { status: "failed", httpStatus: error.status, error: error.kind });
                return json(error.status, error.body, error.headers);
            }
            if (error instanceof NetworkFailure) {
                update(index, { status: "failed", error: error.kind });
                throw new TypeError("fetch failed");
            }
            update(index, { status: "aborted" });
            throw error;
        }
    };

    return {
        connection: { mode: "custom", send },
        send,
        fetch: mockFetch,
        get calls() {
            return [...calls];
        },
        reset() {
            calls.length = 0;
            used.clear();
        },
    };
}
