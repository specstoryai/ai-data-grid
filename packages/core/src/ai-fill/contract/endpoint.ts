import type { AIJsonValue } from "./types.js";

/**
 * The error body of the AI Fill endpoint contract. An endpoint (for example one
 * built with `createJevHandler` from `@specstory/ai-data-grid/server`) answers
 * `POST { model, state, questions }` with Jev's response body unchanged on
 * success, and with this body and a non-2xx status on failure. The upstream
 * status and its `Retry-After` / `retry-after-ms` headers are forwarded.
 *
 * AI Fill's endpoint client reads `error.message`, `error.retryAfterMs` and
 * `error.detail`, and decides the error kind from the HTTP status: 400, 404 and
 * 405 are `configuration`, 401 and 403 `authentication`, 408 and 504 `timeout`,
 * 413 `input-too-large`, 422 and other 4xx `invalid-request`, 429 `rate-limit`,
 * 503 and 529 `overloaded`, and other 5xx `network`. A 500 whose `type` is
 * `server_configuration` is a `configuration` error.
 */
export interface JevEndpointErrorBody {
    readonly error: {
        /**
         * A machine-readable type. `createJevHandler` uses `method_not_allowed`,
         * `forbidden`, `server_configuration`, `payload_too_large`,
         * `invalid_request`, `model_not_allowed`, `upstream_timeout` and
         * `upstream_unreachable`, and passes Jev's own type through for upstream
         * errors (for example `authentication_error` or `rate_limit_error`).
         */
        readonly type: string;
        /** A readable message. It never contains the API key. */
        readonly message: string;
        /** How long to wait before retrying, in milliseconds, when the upstream said so. */
        readonly retryAfterMs?: number;
        /** Validation details, passed through from a Jev 422. */
        readonly detail?: AIJsonValue;
    };
}
