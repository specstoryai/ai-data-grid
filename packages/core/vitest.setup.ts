import { vi } from "vitest";
import { installLiveJevGuard } from "./test/ai-fill/live-jev-guard.js";

installLiveJevGuard();

// DOM-only setup. Tests marked `// @vitest-environment node` have no window and skip it.
if (typeof window !== "undefined") {
    await import("vitest-canvas-mock");

    // this is needed to make the canvas mock work for some reason
    global.jest = vi;

    global.ResizeObserver = vi.fn().mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
    }));

    Image.prototype.decode = () => new Promise(resolve => window.setTimeout(resolve, 10));
}
