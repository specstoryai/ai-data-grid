import type { AIFillExecutionOptions } from "../config/types.js";
import type { BackoffSettings } from "../transport/retry.js";

/** Execution settings with every default filled in. */
export interface ResolvedExecution {
    readonly concurrency: number;
    readonly maxRequestsPerMinute: number;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly backoff: BackoffSettings;
    readonly maxCellsPerRun: number;
    readonly confirmAbove: number;
    readonly maxQuestionsPerRequest: number;
    readonly maxStateChars: number;
    readonly cacheSize: number;
}

/** The defaults from SPST-17 §3.3. */
export const defaultExecution: ResolvedExecution = {
    concurrency: 4,
    maxRequestsPerMinute: 600,
    timeoutMs: 15_000,
    maxRetries: 2,
    backoff: { initialMs: 500, maxMs: 5000, jitter: 0.25 },
    maxCellsPerRun: 1000,
    confirmAbove: 100,
    maxQuestionsPerRequest: 16,
    maxStateChars: 60_000,
    cacheSize: 5000,
};

/** Fills in the defaults for every execution setting that isn't set. */
export function resolveExecution(options: AIFillExecutionOptions | undefined): ResolvedExecution {
    const o = options ?? {};
    return {
        concurrency: o.concurrency ?? defaultExecution.concurrency,
        maxRequestsPerMinute: o.maxRequestsPerMinute ?? defaultExecution.maxRequestsPerMinute,
        timeoutMs: o.timeoutMs ?? defaultExecution.timeoutMs,
        maxRetries: o.maxRetries ?? defaultExecution.maxRetries,
        backoff: {
            initialMs: o.backoff?.initialMs ?? defaultExecution.backoff.initialMs,
            maxMs: o.backoff?.maxMs ?? defaultExecution.backoff.maxMs,
            jitter: o.backoff?.jitter ?? defaultExecution.backoff.jitter,
        },
        maxCellsPerRun: o.maxCellsPerRun ?? defaultExecution.maxCellsPerRun,
        confirmAbove: o.confirmAbove ?? defaultExecution.confirmAbove,
        maxQuestionsPerRequest: o.maxQuestionsPerRequest ?? defaultExecution.maxQuestionsPerRequest,
        maxStateChars: o.maxStateChars ?? defaultExecution.maxStateChars,
        cacheSize: o.cacheSize ?? defaultExecution.cacheSize,
    };
}
