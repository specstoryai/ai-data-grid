// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createJevTransport } from "../../src/ai-fill/transport/client.js";
import { isLiveJevUrl, takeBlockedLiveJevCalls } from "./live-jev-guard.js";

/** The guard from `vitest.setup.ts` that keeps every core test off the live Jev API (SPST-17 §10). */
describe("live Jev guard", () => {
    it("recognizes TypeSafe's API hosts", () => {
        expect(isLiveJevUrl("https://api.typesafe.ai/v1/systemone")).toBe(true);
        expect(isLiveJevUrl("https://typesafe.ai/")).toBe(true);
        expect(isLiveJevUrl("http://localhost:8787/v1/systemone")).toBe(false);
        expect(isLiveJevUrl("/api/jev")).toBe(false);
    });

    it("blocks a fetch to api.typesafe.ai and records it, so the test would fail", async () => {
        await expect(fetch("https://api.typesafe.ai/v1/systemone", { method: "POST" })).rejects.toThrow(
            /Blocked a live Jev call/
        );
        expect(takeBlockedLiveJevCalls()).toEqual(["https://api.typesafe.ai/v1/systemone"]);
    });

    it("catches direct mode falling back to the global fetch", async () => {
        const transport = createJevTransport(
            { mode: "direct", apiKey: "not-a-real-key" },
            { timeoutMs: 1000, maxRetries: 0, backoff: { initialMs: 1, maxMs: 1, jitter: 0 }, isBrowser: false }
        );
        await expect(transport.send({ state: "s", model: "jev-latest", questions: {} })).rejects.toMatchObject({
            kind: "network",
        });
        expect(takeBlockedLiveJevCalls()).toEqual(["https://api.typesafe.ai/v1/systemone"]);
    });
});
