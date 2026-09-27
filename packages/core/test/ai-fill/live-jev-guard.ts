import { afterEach } from "vitest";

/**
 * Keeps tests off the live Jev API (SPST-17 §10 item 1). Installed from
 * `vitest.setup.ts` for every core test file: a `fetch` to `*.typesafe.ai`
 * is rejected, and the test that attempted it fails in `afterEach`, even when
 * the code under test caught the rejection. Tests use `createMockJev` or a
 * fake transport instead.
 */

const blocked: string[] = [];

function urlOf(input: unknown): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (typeof input === "object" && input !== null && typeof (input as { url?: unknown }).url === "string") {
        return (input as { url: string }).url;
    }
    return String(input);
}

/** Whether a URL points at TypeSafe's API. */
export function isLiveJevUrl(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return hostname === "typesafe.ai" || hostname.endsWith(".typesafe.ai");
    } catch {
        return false;
    }
}

/** Wraps the global `fetch` and registers the `afterEach` check. */
export function installLiveJevGuard(): void {
    const original = globalThis.fetch;
    if (typeof original !== "function") return;
    globalThis.fetch = (input, init) => {
        const url = urlOf(input);
        if (isLiveJevUrl(url)) {
            blocked.push(url);
            return Promise.reject(
                new Error(`Blocked a live Jev call to ${url}: tests must use createMockJev or a fake transport`)
            );
        }
        return original(input, init);
    };
    afterEach(() => {
        const attempts = blocked.splice(0);
        if (attempts.length > 0) {
            throw new Error(`This test tried to call the live Jev API (${attempts.join(", ")})`);
        }
    });
}

/** Returns and clears the calls blocked so far. Only the guard's own test uses it. */
export function takeBlockedLiveJevCalls(): string[] {
    return blocked.splice(0);
}
