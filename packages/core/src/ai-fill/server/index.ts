/**
 * `@specstory/ai-data-grid/server`: the server side of AI Fill's endpoint mode.
 *
 * This entry has no React, DOM or styling imports and runs in any Fetch-API
 * host (Next.js route handlers, Node 20+, edge runtimes) and, through
 * {@link toNodeListener}, in Node `http` and Express.
 */

import type { JevEndpointErrorBody } from "../contract/endpoint.js";

/** Options for {@link createJevHandler}. */
export interface JevHandlerOptions {
    /**
     * The TypeSafe API key. Pass it explicitly, for example
     * `process.env.TYPESAFE_API_KEY`; the helper never reads the environment
     * itself. It is sent only to Jev, and never appears in a response.
     * An empty key makes every authorized request fail with a 500
     * `server_configuration` error, so a build without the key still loads.
     */
    readonly apiKey: string;
    /**
     * Required. Decides whether a request may spend your key, for example by
     * checking the session. A request is forwarded only when this returns (or
     * resolves to) `true`; anything else, including a throw, is a 403. Use
     * `() => true` only for local demos.
     */
    readonly authorize: (request: Request) => boolean | Promise<boolean>;
    /** The models a request may ask for. Default `["jev-latest"]`. Anything else is a 400 `model_not_allowed`. */
    readonly allowedModels?: readonly string[];
    /** The largest request body, in bytes. Default 256000. Larger bodies are a 413. */
    readonly maxBodyBytes?: number;
    /** The most questions in one request. Default 32. More is a 413. */
    readonly maxQuestions?: number;
    /**
     * How long to wait for Jev's full answer (headers and body), in
     * milliseconds. Default 20000. Then the response is a 504 `upstream_timeout`.
     */
    readonly timeoutMs?: number;
    /** Jev's origin. Default `https://api.typesafe.ai`. */
    readonly baseURL?: string;
    /** The `fetch` used to call Jev. Default: the global `fetch`. */
    readonly fetch?: typeof fetch;
}

/** The subset of Node's `IncomingMessage` (or an Express request) that {@link toNodeListener} reads. */
interface NodeRequestLike extends AsyncIterable<unknown> {
    readonly method?: string;
    readonly url?: string;
    readonly headers: { readonly [name: string]: string | readonly string[] | undefined };
    /** A body already parsed by middleware such as `express.json()`. */
    readonly body?: unknown;
}

/** The subset of Node's `ServerResponse` that {@link toNodeListener} writes. */
interface NodeResponseLike {
    statusCode: number;
    setHeader(name: string, value: string): unknown;
    end(chunk?: Uint8Array): unknown;
}

/** A Node `http` / Express request listener, as returned by {@link toNodeListener}. */
export type JevNodeListener = (request: NodeRequestLike, response: NodeResponseLike) => Promise<void>;

const defaults = {
    allowedModels: ["jev-latest"],
    maxBodyBytes: 256_000,
    maxQuestions: 32,
    timeoutMs: 20_000,
    baseURL: "https://api.typesafe.ai",
} as const;

const primitives: ReadonlySet<unknown> = new Set(["choice", "score", "noul"]);

/** Jev's error types by status, for upstream errors whose body has none. */
function upstreamType(status: number): string {
    switch (status) {
        case 400:
            return "api_usage_error";
        case 401:
            return "authentication_error";
        case 403:
            return "permission_error";
        case 404:
            return "not_found_error";
        case 422:
            return "validation_error";
        case 429:
            return "rate_limit_error";
        case 529:
            return "overloaded_error";
    }
    return status >= 500 ? "api_error" : "upstream_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStateLike(value: unknown): boolean {
    return typeof value === "string" || (typeof value === "object" && value !== null);
}

function errorResponse(
    status: number,
    type: string,
    message: string,
    extra: { readonly headers?: Record<string, string>; readonly retryAfterMs?: number; readonly detail?: unknown } = {}
): Response {
    const body: JevEndpointErrorBody = {
        error: {
            type,
            message,
            ...(extra.retryAfterMs === undefined ? {} : { retryAfterMs: extra.retryAfterMs }),
            ...(extra.detail === undefined ? {} : { detail: extra.detail as JevEndpointErrorBody["error"]["detail"] }),
        },
    };
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...extra.headers },
    });
}

function positive(name: string, value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isFinite(value) || value <= 0)
        throw new TypeError(`createJevHandler: ${name} must be a positive number`);
    return value;
}

/** Reads a body as text, giving up (with `undefined`) as soon as it exceeds `limit` bytes. */
async function readLimited(request: Request, limit: number): Promise<string | undefined> {
    if (request.body === null) return "";
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
            await reader.cancel();
            return undefined;
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}

/** Checks the body against the endpoint contract. Returns a message for the first problem. */
function checkBody(body: unknown): string | undefined {
    if (!isRecord(body)) return "The body must be a JSON object { model, state, questions }";
    if (typeof body.model !== "string" || body.model === "") return "model must be a non-empty string";
    if (!isStateLike(body.state)) return "state must be a string, an object or an array";
    if (!isRecord(body.questions) || Object.keys(body.questions).length === 0) {
        return "questions must be an object with at least one question";
    }
    for (const [id, question] of Object.entries(body.questions)) {
        if (!isRecord(question) || !primitives.has(question.type)) {
            return `questions.${id}.type must be "choice", "score" or "noul"`;
        }
        if (!isStateLike(question.instructions)) {
            return `questions.${id}.instructions must be a string, an object or an array`;
        }
        if (question.type === "choice" && !isRecord(question.criteria)) {
            return `questions.${id}.criteria must be an object of options`;
        }
        if (question.type === "score" && !Array.isArray(question.criteria)) {
            return `questions.${id}.criteria must be an array of levels`;
        }
        if (question.type === "noul" && question.criteria !== undefined && !isRecord(question.criteria)) {
            return `questions.${id}.criteria must be an object`;
        }
    }
    return undefined;
}

const requestIdHeader = "x-typesafe-request-id";

/** Jev's request ids are short printable tokens: 1 to 128 visible ASCII characters. Any other value isn't forwarded. */
const requestIdPattern = /^[!-~]{1,128}$/;

/** Jev's reply to one forwarded request: the response and its body, already read. */
interface UpstreamReply {
    readonly response: Response;
    readonly text: string;
}

/**
 * Runs the whole upstream step (the `fetch` and the body read) against a
 * deadline and the caller's signal. Either one aborts the step's signal, and
 * the result settles then even if `fetch` or the body read ignores it; a late
 * settlement is ignored.
 */
async function callUpstream(
    run: (signal: AbortSignal) => Promise<UpstreamReply>,
    timeoutMs: number,
    outer: AbortSignal
): Promise<UpstreamReply | "timeout" | "unreachable"> {
    if (outer.aborted) return "unreachable";
    const controller = new AbortController();
    let timedOut = false;
    const onOuterAbort = () => controller.abort();
    outer.addEventListener("abort", onOuterAbort, { once: true });
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    try {
        return await new Promise<UpstreamReply>((resolve, reject) => {
            controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
            run(controller.signal).then(resolve, reject);
        });
    } catch {
        return timedOut ? "timeout" : "unreachable";
    } finally {
        clearTimeout(timer);
        outer.removeEventListener("abort", onOuterAbort);
    }
}

function retryAfterMs(headers: Headers): number | undefined {
    const ms = Number(headers.get("retry-after-ms") ?? Number.NaN);
    if (Number.isFinite(ms) && ms >= 0) return ms;
    const retryAfter = headers.get("retry-after");
    if (retryAfter === null) return undefined;
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(retryAfter);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/**
 * Creates a Fetch-API handler (`Request → Response`) that implements AI Fill's
 * endpoint contract: it takes `POST { model, state, questions }`, adds your
 * key, forwards `{ state, model, questions }` to Jev, and returns Jev's body
 * (unchanged unless it contains the key), with its `x-typesafe-request-id` header.
 *
 * In order, a request is rejected with a {@link JevEndpointErrorBody} when:
 * the method isn't POST (405 `method_not_allowed`); `authorize` doesn't return
 * `true` (403 `forbidden`); the key is empty (500 `server_configuration`); the
 * body exceeds `maxBodyBytes` (413 `payload_too_large`); it isn't valid JSON
 * or doesn't match the contract (400 `invalid_request`); it has more than
 * `maxQuestions` questions (413 `payload_too_large`); or the model isn't in
 * `allowedModels` (400 `model_not_allowed`). Jev's own errors keep their
 * status, and `Retry-After` and `retry-after-ms` are forwarded. No full
 * answer (headers and body) within `timeoutMs` is a 504 `upstream_timeout`,
 * even when the `fetch` ignores its abort signal. No connection, or a caller
 * that aborted its request, is a 502 `upstream_unreachable`.
 *
 * The key is never echoed in a body, an error or a header: it is redacted
 * from Jev's body and error fields, and a forwarded header whose value
 * contains it is dropped, as is a request id that isn't a short printable
 * token. The helper logs nothing. It adds no CORS headers: serve it from the
 * app's own origin, or add CORS in your own code.
 *
 * @throws TypeError when `authorize` is missing, or a limit isn't a positive number.
 *
 * @example
 * ```ts
 * // app/api/jev/route.ts (Next.js)
 * import { createJevHandler } from "@specstory/ai-data-grid/server";
 *
 * export const POST = createJevHandler({
 *     apiKey: process.env.TYPESAFE_API_KEY ?? "",
 *     authorize: request => isSignedIn(request),
 * });
 * ```
 */
export function createJevHandler(options: JevHandlerOptions): (request: Request) => Promise<Response> {
    if (typeof options?.authorize !== "function") {
        throw new TypeError(
            "createJevHandler: authorize is required. Pass a function that checks the caller may spend your key; use () => true only for local demos."
        );
    }
    const apiKey = options.apiKey;
    const authorize = options.authorize;
    const allowedModels = new Set<string>(options.allowedModels ?? defaults.allowedModels);
    const maxBodyBytes = positive("maxBodyBytes", options.maxBodyBytes, defaults.maxBodyBytes);
    const maxQuestions = positive("maxQuestions", options.maxQuestions, defaults.maxQuestions);
    const timeoutMs = positive("timeoutMs", options.timeoutMs, defaults.timeoutMs);
    const upstreamURL = `${(options.baseURL ?? defaults.baseURL).replace(/\/+$/, "")}/v1/systemone`;
    const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
    const redact = (text: string) => (apiKey === "" ? text : text.split(apiKey).join("[redacted]"));
    // Jev's body is passed through as text, so the key's JSON-escaped form is redacted too.
    const escapedKey = JSON.stringify(apiKey).slice(1, -1);
    const redactBody = (text: string) => {
        const redacted = redact(text);
        return escapedKey === apiKey ? redacted : redacted.split(escapedKey).join("[redacted]");
    };
    const redactValue = (value: unknown): unknown => {
        if (typeof value === "string") return redact(value);
        if (Array.isArray(value)) return value.map(redactValue);
        if (isRecord(value)) {
            return Object.fromEntries(Object.entries(value).map(([name, item]) => [redact(name), redactValue(item)]));
        }
        return value;
    };

    return async request => {
        if (request.method !== "POST") {
            return errorResponse(405, "method_not_allowed", "Use POST", { headers: { allow: "POST" } });
        }
        let allowed: unknown = false;
        try {
            allowed = await authorize(request);
        } catch {
            allowed = false;
        }
        if (allowed !== true) return errorResponse(403, "forbidden", "This request isn't allowed to use AI Fill");
        if (typeof apiKey !== "string" || apiKey === "") {
            return errorResponse(
                500,
                "server_configuration",
                "The AI Fill endpoint has no TypeSafe API key configured"
            );
        }

        const declared = Number(request.headers.get("content-length") ?? Number.NaN);
        const text =
            Number.isFinite(declared) && declared > maxBodyBytes ? undefined : await readLimited(request, maxBodyBytes);
        if (text === undefined) {
            return errorResponse(413, "payload_too_large", `The request body is larger than ${maxBodyBytes} bytes`);
        }
        let body: unknown;
        try {
            body = JSON.parse(text);
        } catch {
            return errorResponse(400, "invalid_request", "The request body isn't valid JSON");
        }
        const problem = checkBody(body);
        if (problem !== undefined) return errorResponse(400, "invalid_request", problem);
        const { model, state, questions } = body as { model: string; state: unknown; questions: object };
        const count = Object.keys(questions).length;
        if (count > maxQuestions) {
            return errorResponse(
                413,
                "payload_too_large",
                `The request has ${count} questions; the limit is ${maxQuestions}`
            );
        }
        if (!allowedModels.has(model)) {
            return errorResponse(400, "model_not_allowed", `The model ${JSON.stringify(model)} isn't allowed here`);
        }

        const reply = await callUpstream(
            async signal => {
                const response = await fetchImpl(upstreamURL, {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                        "content-type": "application/json",
                        accept: "application/json",
                    },
                    body: JSON.stringify({ state, model, questions }),
                    signal,
                });
                return { response, text: await response.text() };
            },
            timeoutMs,
            request.signal
        );
        if (reply === "timeout") {
            return errorResponse(504, "upstream_timeout", `Jev didn't answer within ${timeoutMs} ms`);
        }
        if (reply === "unreachable") return errorResponse(502, "upstream_unreachable", "Couldn't reach Jev");
        const { response: upstream, text: upstreamText } = reply;

        // A header that carries the key is dropped rather than redacted: a
        // "[redacted]" request id or Retry-After is no use to the client.
        const forwarded: Record<string, string> = {};
        const names = upstream.ok ? [requestIdHeader] : [requestIdHeader, "retry-after", "retry-after-ms"];
        for (const name of names) {
            const value = upstream.headers.get(name);
            if (value === null || value.includes(apiKey)) continue;
            if (name === requestIdHeader && !requestIdPattern.test(value)) continue;
            forwarded[name] = value;
        }
        if (upstream.ok) {
            return new Response(redactBody(upstreamText), {
                status: upstream.status,
                headers: { "content-type": "application/json", ...forwarded },
            });
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(upstreamText);
        } catch {
            parsed = undefined;
        }
        const nested = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined;
        const rawType = nested?.type;
        const rawMessage = nested?.message ?? (isRecord(parsed) ? parsed.message : undefined);
        const detail = nested?.detail ?? (isRecord(parsed) ? parsed.detail : undefined);
        const delay = retryAfterMs(new Headers(forwarded));
        return errorResponse(
            upstream.status,
            typeof rawType === "string" ? redact(rawType) : upstreamType(upstream.status),
            typeof rawMessage === "string" ? redact(rawMessage) : `Jev returned HTTP ${upstream.status}`,
            {
                headers: forwarded,
                ...(delay === undefined ? {} : { retryAfterMs: delay }),
                ...(detail === undefined ? {} : { detail: redactValue(detail) }),
            }
        );
    };
}

function headerValue(value: string | readonly string[] | undefined): string | undefined {
    return typeof value === "string" ? value : value?.[0];
}

/** Turns a body already read by middleware back into text. */
function parsedBody(body: unknown): string | undefined {
    if (body === undefined) return undefined;
    if (typeof body === "string") return body;
    if (body instanceof Uint8Array) return new TextDecoder().decode(body);
    return JSON.stringify(body);
}

function toBytes(chunk: unknown): Uint8Array {
    if (chunk instanceof Uint8Array) return chunk;
    return new TextEncoder().encode(String(chunk));
}

/** Streams a Node request body, so the handler's `maxBodyBytes` limit applies while reading. */
function streamBody(request: NodeRequestLike): ReadableStream<Uint8Array> {
    const iterator = request[Symbol.asyncIterator]();
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            const { done, value } = await iterator.next();
            if (done === true) controller.close();
            else controller.enqueue(toBytes(value));
        },
        async cancel() {
            await iterator.return?.();
        },
    });
}

/**
 * Adapts a Fetch-API handler, such as one from {@link createJevHandler}, into
 * a Node `http` or Express listener: `http.createServer(toNodeListener(handler))`
 * or `app.post("/api/jev", toNodeListener(handler))`. It streams the request
 * body, or uses `req.body` when middleware already parsed it, and writes the
 * handler's status, headers and body.
 */
export function toNodeListener(handler: (request: Request) => Promise<Response>): JevNodeListener {
    return async (req, res) => {
        let response: Response;
        try {
            const url = new URL(req.url ?? "/", `http://${headerValue(req.headers.host) ?? "localhost"}`);
            const headers = new Headers();
            for (const [name, value] of Object.entries(req.headers)) {
                if (typeof value === "string") headers.set(name, value);
                else if (value !== undefined) for (const item of value) headers.append(name, item);
            }
            const method = (req.method ?? "GET").toUpperCase();
            const init: RequestInit & { duplex?: "half" } = { method, headers };
            if (method !== "GET" && method !== "HEAD") {
                const parsed = parsedBody(req.body);
                if (parsed === undefined) {
                    init.body = streamBody(req);
                    init.duplex = "half";
                } else {
                    headers.delete("content-length");
                    init.body = parsed;
                }
            }
            response = await handler(new Request(url, init));
        } catch {
            response = errorResponse(400, "invalid_request", "The request couldn't be read");
        }
        res.statusCode = response.status;
        for (const [name, value] of response.headers) res.setHeader(name, value);
        res.end(new Uint8Array(await response.arrayBuffer()));
    };
}
