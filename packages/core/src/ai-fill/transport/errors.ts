import type { AIFillErrorKind } from "../config/results.js";

/** The error kinds a transport produces. The engine adds the per-cell kinds. */
export type JevTransportErrorKind = Extract<
    AIFillErrorKind,
    | "configuration"
    | "authentication"
    | "rate-limit"
    | "overloaded"
    | "timeout"
    | "network"
    | "invalid-request"
    | "input-too-large"
    | "malformed"
>;

/** Who answered: the app's endpoint, Jev itself (direct mode), or a custom `send`. */
export type JevTransportSource = "endpoint" | "direct" | "custom";

/** The fields of a {@link JevTransportError}. */
export interface JevTransportErrorInit {
    readonly kind: JevTransportErrorKind;
    readonly message: string;
    readonly retryable: boolean;
    readonly httpStatus?: number;
    /** The `x-typesafe-request-id` response header. */
    readonly requestId?: string;
    /** The server's requested delay (`retry-after-ms`, `Retry-After` or the endpoint body), in milliseconds. */
    readonly retryAfterMs?: number;
}

/** A failed request, normalized to an AI Fill error kind. */
export class JevTransportError extends Error implements JevTransportErrorInit {
    readonly kind: JevTransportErrorKind;
    readonly retryable: boolean;
    readonly httpStatus?: number;
    readonly requestId?: string;
    readonly retryAfterMs?: number;

    constructor(init: JevTransportErrorInit) {
        super(init.message);
        this.name = "JevTransportError";
        this.kind = init.kind;
        this.retryable = init.retryable;
        if (init.httpStatus !== undefined) this.httpStatus = init.httpStatus;
        if (init.requestId !== undefined) this.requestId = init.requestId;
        if (init.retryAfterMs !== undefined) this.retryAfterMs = init.retryAfterMs;
    }
}

/**
 * Whether a value is a {@link JevTransportError}. It checks the shape as well as
 * the class, so errors thrown by a second copy of this module (for example the
 * `/testing` entry loaded through another module system) are recognized.
 */
export function isJevTransportError(value: unknown): value is JevTransportError {
    if (value instanceof JevTransportError) return true;
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<JevTransportError>;
    return (
        candidate.name === "JevTransportError" &&
        typeof candidate.kind === "string" &&
        typeof candidate.message === "string" &&
        typeof candidate.retryable === "boolean"
    );
}

/** An error meaning the caller aborted the request. It is never reported as a failure. */
export function abortError(): Error {
    const error = new Error("The request was cancelled");
    error.name = "AbortError";
    return error;
}

/** Whether an error is an abort (from {@link abortError}, `fetch` or a `DOMException`). */
export function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/** The error for an attempt that got no response within `timeoutMs`. */
export function timeoutError(timeoutMs: number): JevTransportError {
    return new JevTransportError({ kind: "timeout", message: `No response within ${timeoutMs} ms`, retryable: true });
}

function sourceLabel(source: JevTransportSource): string {
    switch (source) {
        case "endpoint":
            return "The AI Fill endpoint";
        case "direct":
            return "Jev";
        case "custom":
            return "The custom connection";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegative(value: unknown): number | undefined {
    const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : undefined;
}

/**
 * The delay a server asked for, in milliseconds: `retry-after-ms`, else
 * `Retry-After` (seconds or an HTTP date), else the endpoint body's
 * `error.retryAfterMs`. `undefined` when there is none.
 */
export function parseRetryAfter(
    headers: Headers,
    bodyRetryAfterMs?: unknown,
    now: number = Date.now()
): number | undefined {
    const ms = nonNegative(headers.get("retry-after-ms"));
    if (ms !== undefined) return ms;
    const retryAfter = headers.get("retry-after");
    if (retryAfter !== null) {
        const seconds = nonNegative(retryAfter);
        if (seconds !== undefined) return seconds * 1000;
        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) return Math.max(0, date - now);
    }
    return nonNegative(bodyRetryAfterMs);
}

/** The most detail text kept in a message. */
const maxDetailChars = 500;

/** The parts of an error body that AI Fill reads, from the endpoint contract or Jev's own errors. */
interface ErrorBodyParts {
    readonly type?: string;
    readonly message?: string;
    readonly detail?: unknown;
    readonly retryAfterMs?: unknown;
}

/** Reads `{ error: { type, message, retryAfterMs, detail } }`, `{ detail }` or `{ message }` from an error body. */
export function readErrorBody(body: unknown): ErrorBodyParts {
    if (!isRecord(body)) return {};
    const nested = isRecord(body.error) ? body.error : undefined;
    const type = nested?.type ?? body.type;
    const message = nested?.message ?? body.message;
    return {
        type: typeof type === "string" ? type : undefined,
        message: typeof message === "string" ? message : undefined,
        detail: nested?.detail ?? body.detail,
        retryAfterMs: nested?.retryAfterMs,
    };
}

function kindForStatus(status: number, type: string | undefined): { kind: JevTransportErrorKind; retryable: boolean } {
    if (type === "server_configuration") return { kind: "configuration", retryable: false };
    switch (status) {
        case 400:
        case 404:
        case 405:
            return { kind: "configuration", retryable: false };
        case 401:
        case 403:
            return { kind: "authentication", retryable: false };
        case 408:
        case 504:
            return { kind: "timeout", retryable: true };
        case 413:
            return { kind: "input-too-large", retryable: false };
        case 429:
            return { kind: "rate-limit", retryable: true };
        case 503:
        case 529:
            return { kind: "overloaded", retryable: true };
    }
    if (status >= 500) return { kind: "network", retryable: true };
    return { kind: "invalid-request", retryable: false };
}

/** Options for {@link errorFromResponse}. */
export interface ErrorFromResponseOptions {
    readonly source: JevTransportSource;
    readonly requestId?: string;
    /** Removes secrets (the direct-mode key) from any text taken from the body. */
    readonly redact?: (text: string) => string;
    readonly now?: number;
}

/**
 * Normalizes a non-2xx response to a {@link JevTransportError}:
 *
 * | Status | Kind | Retried |
 * |---|---|---|
 * | 400, 404, 405 (and 500 `server_configuration`) | `configuration` | no |
 * | 401, 403 | `authentication` | no |
 * | 408, 504 | `timeout` | yes |
 * | 413 | `input-too-large` | no |
 * | 422 and other 4xx | `invalid-request` | no |
 * | 429 | `rate-limit` | yes |
 * | 503, 529 | `overloaded` | yes |
 * | other 5xx | `network` | yes |
 *
 * The message includes the body's message and, for validation errors, its `detail`.
 */
export function errorFromResponse(
    status: number,
    headers: Headers,
    body: unknown,
    options: ErrorFromResponseOptions
): JevTransportError {
    const parts = readErrorBody(body);
    const { kind, retryable } = kindForStatus(status, parts.type);
    const redact = options.redact ?? (text => text);
    let message = `${sourceLabel(options.source)} returned HTTP ${status}`;
    if (parts.type !== undefined) message += ` (${redact(parts.type)})`;
    if (parts.message !== undefined) message += `: ${redact(parts.message)}`;
    if (parts.detail !== undefined) {
        const detail = JSON.stringify(parts.detail) ?? "";
        const clipped = detail.length > maxDetailChars ? detail.slice(0, maxDetailChars) + "…" : detail;
        message += ` ${redact(clipped)}`;
    }
    const retryAfterMs = parseRetryAfter(headers, parts.retryAfterMs, options.now);
    return new JevTransportError({
        kind,
        message,
        retryable,
        httpStatus: status,
        ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
}
