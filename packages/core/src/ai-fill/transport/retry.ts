import { abortError } from "./errors.js";

/** Retry backoff settings, all required. */
export interface BackoffSettings {
    /** The first delay, in milliseconds. */
    readonly initialMs: number;
    /** The longest delay, in milliseconds. */
    readonly maxMs: number;
    /** How much of each delay is randomly removed, in [0, 1]. */
    readonly jitter: number;
}

/** The longest server-requested delay that is honored. Longer ones fall back to normal backoff. */
export const maxRetryAfterMs = 60_000;

/**
 * The delay before retry number `attempt + 1`: `initialMs * 2^attempt`, capped
 * at `maxMs`, minus up to `jitter` of it at random. With the defaults that is
 * 500 ms, 1 s, 2 s, 4 s, then 5 s, each reduced by up to 25%.
 */
export function backoffDelay(attempt: number, backoff: BackoffSettings, random: () => number): number {
    const base = Math.min(backoff.initialMs * 2 ** attempt, backoff.maxMs);
    return base * (1 - backoff.jitter * random());
}

/**
 * The delay before retrying after `error`: the server's `retryAfterMs` when it
 * is at most 60 s, otherwise {@link backoffDelay}.
 */
export function retryDelay(
    error: { readonly retryAfterMs?: number },
    attempt: number,
    backoff: BackoffSettings,
    random: () => number
): number {
    const requested = error.retryAfterMs;
    if (requested !== undefined && requested <= maxRetryAfterMs) return requested;
    return backoffDelay(attempt, backoff, random);
}

/** Waits `ms` milliseconds. Rejects with an abort error as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted === true) {
            reject(abortError());
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
