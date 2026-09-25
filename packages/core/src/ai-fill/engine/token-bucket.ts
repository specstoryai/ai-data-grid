/**
 * A token bucket for `maxRequestsPerMinute`. It refills continuously at the
 * configured rate and holds up to one second's worth of requests (at least
 * one), so a burst never exceeds that.
 */
export class TokenBucket {
    private tokens = 0;
    private updatedAt: number | undefined;

    constructor(private readonly perMinute: () => number) {}

    /** Takes a token and returns 0, or returns how many milliseconds until one is available. */
    take(now: number): number {
        const rate = this.perMinute();
        const capacity = Math.max(1, Math.ceil(rate / 60));
        this.tokens =
            this.updatedAt === undefined
                ? capacity
                : Math.min(capacity, this.tokens + ((now - this.updatedAt) * rate) / 60_000);
        this.updatedAt = now;
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return 0;
        }
        return Math.max(1, Math.ceil(((1 - this.tokens) * 60_000) / rate));
    }
}
