import { TokenBucket } from "./token-bucket.js";

/** The scheduler limits, read again before every dispatch so config changes apply. */
export interface SchedulerLimits {
    readonly concurrency: number;
    readonly maxRequestsPerMinute: number;
}

/** One queued request. */
export interface SchedulerTask {
    /** Whether every run waiting on this task was cancelled. Cancelled tasks are dropped without starting. */
    readonly cancelled: () => boolean;
    /** Sends the request. It should not reject; a rejection is ignored. */
    readonly start: () => Promise<void>;
}

/**
 * A FIFO request queue with bounded concurrency, a token bucket for
 * `maxRequestsPerMinute`, and a pause for server-requested delays. It never
 * has more than `concurrency` tasks started and unfinished.
 */
export class RequestScheduler {
    private readonly queue: SchedulerTask[] = [];
    private readonly bucket: TokenBucket;
    private active = 0;
    private pausedUntil = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;

    constructor(private readonly limits: () => SchedulerLimits) {
        this.bucket = new TokenBucket(() => this.limits().maxRequestsPerMinute);
    }

    /** Tasks started and not finished. */
    get activeCount(): number {
        return this.active;
    }

    /** Tasks waiting to start. */
    get queuedCount(): number {
        return this.queue.length;
    }

    /** When the queue resumes after a pause, in epoch milliseconds, or 0. */
    get resumesAt(): number {
        return this.pausedUntil > Date.now() ? this.pausedUntil : 0;
    }

    enqueue(task: SchedulerTask): void {
        if (this.disposed) return;
        this.queue.push(task);
        this.pump();
    }

    /** Drops every queued task whose runs were all cancelled. Returns how many were dropped. */
    prune(): number {
        const before = this.queue.length;
        const kept = this.queue.filter(task => !task.cancelled());
        this.queue.splice(0, this.queue.length, ...kept);
        return before - kept.length;
    }

    /** Starts no new task for `ms` milliseconds. Tasks already started continue. */
    pause(ms: number): void {
        this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
        this.pump();
    }

    dispose(): void {
        this.disposed = true;
        this.queue.length = 0;
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
    }

    private wake(ms: number): void {
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.pump();
        }, ms);
    }

    private pump(): void {
        if (this.disposed) return;
        this.prune();
        while (this.queue.length > 0 && this.active < Math.max(1, this.limits().concurrency)) {
            const now = Date.now();
            if (now < this.pausedUntil) {
                this.wake(this.pausedUntil - now);
                return;
            }
            const wait = this.bucket.take(now);
            if (wait > 0) {
                this.wake(wait);
                return;
            }
            const task = this.queue.shift() as SchedulerTask;
            this.active++;
            const done = () => {
                this.active--;
                this.pump();
            };
            task.start().then(done, done);
        }
    }
}
