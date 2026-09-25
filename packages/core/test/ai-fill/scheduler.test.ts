import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { RequestScheduler, type SchedulerLimits } from "../../src/ai-fill/engine/scheduler.js";
import { LruCache } from "../../src/ai-fill/engine/lru-cache.js";

interface Probe {
    readonly started: number[];
    readonly finishers: (() => void)[];
    active: number;
    maxActive: number;
}

function probe(): Probe {
    return { started: [], finishers: [], active: 0, maxActive: 0 };
}

/** A task that stays active until its finisher is called. */
function task(p: Probe, id: number, cancelled: () => boolean = () => false) {
    return {
        cancelled,
        start: () =>
            new Promise<void>(resolve => {
                p.started.push(id);
                p.active++;
                p.maxActive = Math.max(p.maxActive, p.active);
                p.finishers[id] = () => {
                    p.active--;
                    resolve();
                };
            }),
    };
}

let limits: SchedulerLimits;

beforeEach(() => {
    vi.useFakeTimers();
    limits = { concurrency: 3, maxRequestsPerMinute: 60_000 };
});

afterEach(() => {
    vi.useRealTimers();
});

describe("RequestScheduler", () => {
    it("never runs more than `concurrency` tasks, and starts them in FIFO order", async () => {
        const p = probe();
        const scheduler = new RequestScheduler(() => limits);
        for (let i = 0; i < 10; i++) scheduler.enqueue(task(p, i));
        expect(p.started).toEqual([0, 1, 2]);
        for (let i = 0; i < 10; i++) {
            p.finishers[i]();
            await vi.advanceTimersByTimeAsync(0);
            expect(p.active).toBeLessThanOrEqual(3);
        }
        expect(p.started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(p.maxActive).toBe(3);
    });

    it("spaces requests by maxRequestsPerMinute with a token bucket", async () => {
        limits = { concurrency: 10, maxRequestsPerMinute: 60 };
        const p = probe();
        const scheduler = new RequestScheduler(() => limits);
        for (let i = 0; i < 3; i++) scheduler.enqueue(task(p, i));
        expect(p.started).toEqual([0]);
        await vi.advanceTimersByTimeAsync(999);
        expect(p.started).toEqual([0]);
        await vi.advanceTimersByTimeAsync(1);
        expect(p.started).toEqual([0, 1]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(p.started).toEqual([0, 1, 2]);
    });

    it("starts nothing new while paused, and resumes after the delay", async () => {
        const p = probe();
        const scheduler = new RequestScheduler(() => limits);
        scheduler.pause(5000);
        scheduler.enqueue(task(p, 0));
        expect(scheduler.resumesAt).toBe(Date.now() + 5000);
        await vi.advanceTimersByTimeAsync(4999);
        expect(p.started).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(p.started).toEqual([0]);
    });

    it("drops cancelled tasks without starting them", async () => {
        const p = probe();
        limits = { concurrency: 1, maxRequestsPerMinute: 60_000 };
        const scheduler = new RequestScheduler(() => limits);
        let cancelled = false;
        scheduler.enqueue(task(p, 0));
        scheduler.enqueue(task(p, 1, () => cancelled));
        scheduler.enqueue(task(p, 2));
        cancelled = true;
        expect(scheduler.prune()).toBe(1);
        p.finishers[0]();
        await vi.advanceTimersByTimeAsync(0);
        expect(p.started).toEqual([0, 2]);
        expect(scheduler.queuedCount).toBe(0);
    });

    it("applies a new concurrency limit to the next dispatch", async () => {
        const p = probe();
        const scheduler = new RequestScheduler(() => limits);
        limits = { concurrency: 1, maxRequestsPerMinute: 60_000 };
        scheduler.enqueue(task(p, 0));
        scheduler.enqueue(task(p, 1));
        expect(p.started).toEqual([0]);
        limits = { concurrency: 2, maxRequestsPerMinute: 60_000 };
        scheduler.enqueue(task(p, 2));
        expect(p.started).toEqual([0, 1]);
        expect(scheduler.activeCount).toBe(2);
    });
});

describe("LruCache", () => {
    it("evicts the least recently used entry beyond its capacity", () => {
        const cache = new LruCache<number>(() => 2);
        cache.set("a", 1);
        cache.set("b", 2);
        expect(cache.get("a")).toBe(1);
        cache.set("c", 3);
        expect(cache.has("b")).toBe(false);
        expect(cache.has("a")).toBe(true);
        expect(cache.size).toBe(2);
    });
});
