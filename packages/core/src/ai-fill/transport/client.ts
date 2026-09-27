import type { JevRequest, JevResponse } from "../contract/types.js";
import type {
    AIFillConnection,
    AIFillCustomConnection,
    AIFillDirectConnection,
    AIFillEndpointConnection,
} from "../config/types.js";
import { isBrowserEnvironment } from "./environment.js";
import {
    abortError,
    errorFromResponse,
    isAbortError,
    isJevTransportError,
    JevTransportError,
    type JevTransportSource,
    timeoutError,
} from "./errors.js";
import { type BackoffSettings, retryDelay, sleep } from "./retry.js";

/** Jev's API origin, used by direct mode unless `baseURL` is set. */
export const defaultJevBaseURL = "https://api.typesafe.ai";

/** The message for a network failure in direct mode in a browser, where Jev rejects the CORS preflight. */
export const directBrowserNetworkMessage =
    "TypeSafe's API does not accept browser calls from this origin; use endpoint mode or the local dev proxy.";

/** The message for direct mode in a browser without `dangerouslyAllowBrowser`. */
export const directBrowserBlockedMessage =
    "Direct mode in a browser exposes the API key to anyone using that browser; set dangerouslyAllowBrowser: true for local demos, or use endpoint mode.";

/** The one-time warning printed when direct mode runs in a browser with `dangerouslyAllowBrowser`. */
export const directBrowserWarning =
    "AI Fill: direct mode is sending your TypeSafe API key from this browser, where anyone using it can read the key. Use endpoint mode in production.";

let warnedDirectBrowser = false;

/** Retry and timeout settings for a transport, all resolved. */
export interface JevTransportOptions {
    /** Timeout per attempt, in milliseconds. */
    readonly timeoutMs: number;
    /** Retries after the first attempt, for retryable failures only. */
    readonly maxRetries: number;
    readonly backoff: BackoffSettings;
    /** The jitter source. Default `Math.random`. */
    readonly random?: () => number;
    /** Whether this is a browser. Default: detected. */
    readonly isBrowser?: boolean;
}

/** A successful exchange. */
export interface JevTransportResult {
    readonly response: JevResponse;
    /** The `x-typesafe-request-id` response header, when there was one. */
    readonly requestId?: string;
    /** How many attempts it took. */
    readonly attempts: number;
}

/** Sends Jev requests over one connection, with retries, per-attempt timeouts and cancellation. */
export interface JevTransport {
    readonly source: JevTransportSource;
    /**
     * Sends one request. Resolves with the response body, or rejects with a
     * {@link JevTransportError}, or with an abort error when `signal` aborts.
     */
    send(request: JevRequest, signal?: AbortSignal): Promise<JevTransportResult>;
}

type Attempt = (request: JevRequest, signal: AbortSignal) => Promise<Omit<JevTransportResult, "attempts">>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function malformed(message: string, extra: { httpStatus?: number; requestId?: string } = {}): JevTransportError {
    return new JevTransportError({ kind: "malformed", message, retryable: false, ...extra });
}

function checkResponse(body: unknown, source: JevTransportSource, requestId?: string): JevResponse {
    if (!isRecord(body) || !isRecord(body.answers)) {
        const label =
            source === "custom" ? "The custom connection's send" : source === "direct" ? "Jev" : "The endpoint";
        throw malformed(
            `${label} returned a body without an answers object`,
            requestId === undefined ? {} : { requestId }
        );
    }
    return body as unknown as JevResponse;
}

/** Calls the global `fetch` at call time, so it is never invoked with the wrong `this`. */
const globalFetch: typeof fetch = (input, init) => fetch(input, init);

async function readResponse(
    response: Response,
    source: JevTransportSource,
    redact: (text: string) => string
): Promise<Omit<JevTransportResult, "attempts">> {
    const requestId = response.headers.get("x-typesafe-request-id") ?? undefined;
    const text = await response.text();
    let body: unknown;
    let parsed = true;
    try {
        body = JSON.parse(text);
    } catch {
        parsed = false;
    }
    if (!response.ok) {
        throw errorFromResponse(response.status, response.headers, parsed ? body : undefined, {
            source,
            redact,
            ...(requestId === undefined ? {} : { requestId }),
        });
    }
    if (!parsed) {
        throw malformed(`${source === "direct" ? "Jev" : "The endpoint"} returned a body that isn't JSON`, {
            httpStatus: response.status,
            ...(requestId === undefined ? {} : { requestId }),
        });
    }
    return { response: checkResponse(body, source, requestId), ...(requestId === undefined ? {} : { requestId }) };
}

function endpointAttempt(connection: AIFillEndpointConnection): Attempt {
    const fetchImpl = connection.fetch ?? globalFetch;
    return async (request, signal) => {
        let extra: Record<string, string> = {};
        if (connection.headers !== undefined) {
            try {
                extra = await connection.headers();
            } catch (error) {
                throw new JevTransportError({
                    kind: "configuration",
                    message: `connection.headers threw: ${errorMessage(error)}`,
                    retryable: false,
                });
            }
        }
        let response: Response;
        try {
            response = await fetchImpl(connection.url, {
                method: "POST",
                headers: { ...extra, "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify(request),
                signal,
            });
        } catch (error) {
            if (isAbortError(error)) throw error;
            throw new JevTransportError({
                kind: "network",
                message: `Couldn't reach the AI Fill endpoint ${connection.url}: ${errorMessage(error)}`,
                retryable: true,
            });
        }
        return await readResponse(response, "endpoint", text => text);
    };
}

function directAttempt(connection: AIFillDirectConnection, isBrowser: boolean): Attempt {
    const fetchImpl = connection.fetch ?? globalFetch;
    const url = `${(connection.baseURL ?? defaultJevBaseURL).replace(/\/+$/, "")}/v1/systemone`;
    const key = connection.apiKey;
    const redact = (text: string) => (key === "" ? text : text.split(key).join("[redacted]"));
    return async (request, signal) => {
        let response: Response;
        try {
            response = await fetchImpl(url, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                    accept: "application/json",
                },
                body: JSON.stringify(request),
                signal,
            });
        } catch (error) {
            if (isAbortError(error)) throw error;
            throw new JevTransportError({
                kind: "network",
                message: isBrowser
                    ? directBrowserNetworkMessage
                    : `Couldn't reach Jev at ${url}: ${redact(errorMessage(error))}`,
                retryable: true,
            });
        }
        return await readResponse(response, "direct", redact);
    };
}

function customAttempt(connection: AIFillCustomConnection): Attempt {
    return async (request, signal) => {
        let body: unknown;
        try {
            body = await connection.send(request, signal);
        } catch (error) {
            if (isAbortError(error) || isJevTransportError(error)) throw error;
            throw new JevTransportError({
                kind: "network",
                message: `The custom connection's send failed: ${errorMessage(error)}`,
                retryable: true,
            });
        }
        return { response: checkResponse(body, "custom") };
    };
}

/**
 * Runs one attempt with its own timeout. The attempt's signal aborts when the
 * timeout fires or when `outer` aborts. A late settlement of the attempt after
 * that is ignored, so a `send` that ignores its signal still times out.
 */
async function withTimeout<T>(
    run: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    outer: AbortSignal | undefined
): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const onOuterAbort = () => controller.abort();
    outer?.addEventListener("abort", onOuterAbort, { once: true });
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    try {
        return await new Promise<T>((resolve, reject) => {
            controller.signal.addEventListener(
                "abort",
                () => reject(timedOut ? timeoutError(timeoutMs) : abortError()),
                { once: true }
            );
            run(controller.signal).then(resolve, reject);
        });
    } finally {
        clearTimeout(timer);
        outer?.removeEventListener("abort", onOuterAbort);
    }
}

function isAborted(signal: AbortSignal | undefined): boolean {
    return signal?.aborted === true;
}

function toTransportError(error: unknown): JevTransportError {
    if (isJevTransportError(error)) return error;
    return new JevTransportError({ kind: "network", message: errorMessage(error), retryable: true });
}

/**
 * Creates the client for a connection:
 * - **endpoint:** POSTs `{ model, state, questions }` as JSON to `url`, with the
 *   app's `headers()`, and reads Jev's body back (errors follow `JevEndpointErrorBody`)
 * - **direct:** POSTs to `${baseURL}/v1/systemone` with `Authorization: Bearer <apiKey>`.
 *   In a browser it needs `dangerouslyAllowBrowser: true`; without it every
 *   send fails with a `configuration` error and no request is made. With it, a
 *   one-time `console.warn` says the key is visible to the browser's user, and
 *   a network failure (Jev rejects browser CORS preflights) points to endpoint mode.
 * - **custom:** calls `send(request, signal)`. It may throw a `JevTransportError` to report an HTTP-like failure.
 *
 * Every attempt has its own timeout. Retryable failures (network errors,
 * timeouts, 408, 429, 5xx and 529) are retried up to `maxRetries` times with
 * backoff; a server delay (`retry-after-ms` or `Retry-After`) of up to 60 s is
 * honored instead. 400, 401, 403, 404, 413 and 422 are never retried. The
 * `x-typesafe-request-id` header is captured on success and failure. Aborting
 * `signal` stops the request and any pending retry.
 */
export function createJevTransport(connection: AIFillConnection, options: JevTransportOptions): JevTransport {
    const isBrowser = options.isBrowser ?? isBrowserEnvironment();
    const random = options.random ?? Math.random;
    let attempt: Attempt;
    let blocked: JevTransportError | undefined;
    switch (connection.mode) {
        case "endpoint":
            attempt = endpointAttempt(connection);
            break;
        case "direct":
            attempt = directAttempt(connection, isBrowser);
            if (isBrowser && connection.dangerouslyAllowBrowser !== true) {
                blocked = new JevTransportError({
                    kind: "configuration",
                    message: directBrowserBlockedMessage,
                    retryable: false,
                });
            } else if (isBrowser && !warnedDirectBrowser) {
                warnedDirectBrowser = true;
                // eslint-disable-next-line no-console
                console.warn(directBrowserWarning);
            }
            break;
        case "custom":
            attempt = customAttempt(connection);
            break;
    }

    return {
        source: connection.mode,
        async send(request, signal) {
            if (blocked !== undefined) throw blocked;
            for (let attempts = 1; ; attempts++) {
                if (isAborted(signal)) throw abortError();
                try {
                    const result = await withTimeout(s => attempt(request, s), options.timeoutMs, signal);
                    return { ...result, attempts };
                } catch (error) {
                    if (isAborted(signal) || isAbortError(error)) throw abortError();
                    const failure = toTransportError(error);
                    if (!failure.retryable || attempts > options.maxRetries) throw failure;
                    await sleep(retryDelay(failure, attempts - 1, options.backoff, random), signal);
                }
            }
        },
    };
}
