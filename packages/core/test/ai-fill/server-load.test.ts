// @vitest-environment node
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `@specstory/ai-data-grid/server` loads and runs in plain Node, with no DOM,
 * through both `import()` and `require()` (SPST-17, Amendment 1, A3). Core's
 * `dist/cjs` is ESM like the rest of the package, so `require()` relies on
 * Node's `require(esm)`. Needs `npm run build` first.
 */

const coreDir = path.resolve(".");
const esmEntry = path.join(coreDir, "dist/esm/ai-fill/server/index.js");
const cjsEntry = path.join(coreDir, "dist/cjs/ai-fill/server/index.js");

type ServerModule = typeof import("../../src/ai-fill/server/index.js");

function requireBuilt(file: string): void {
    if (!fs.existsSync(file))
        throw new Error(`${path.relative(coreDir, file)} is missing: run \`npm run build\` first`);
}

async function exercise(server: ServerModule): Promise<void> {
    const handle = server.createJevHandler({
        apiKey: "test-key",
        authorize: () => true,
        fetch: async () => new Response(JSON.stringify({ model: "jev-1.13.0", answers: {} }), { status: 200 }),
    });
    const response = await handle(
        new Request("http://localhost/api/jev", {
            method: "POST",
            body: JSON.stringify({
                model: "jev-latest",
                state: "s",
                questions: { q0: { type: "noul", instructions: "?" } },
            }),
        })
    );
    expect(response.status).toBe(200);
    expect(typeof server.toNodeListener(handle)).toBe("function");
}

describe("/server in plain Node", () => {
    it("runs without a DOM", () => {
        expect(typeof window).toBe("undefined");
        expect(typeof document).toBe("undefined");
    });

    it("loads with import()", async () => {
        requireBuilt(esmEntry);
        const server = (await import(pathToFileURL(esmEntry).href)) as ServerModule;
        expect(Object.keys(server).sort()).toEqual(["createJevHandler", "toNodeListener"]);
        await exercise(server);
    });

    it("loads with require()", async () => {
        requireBuilt(cjsEntry);
        const server = createRequire(import.meta.url)(cjsEntry) as ServerModule;
        expect(
            Object.keys(server)
                .filter(name => name !== "__esModule" && name !== "module.exports")
                .sort()
        ).toEqual(["createJevHandler", "toNodeListener"]);
        await exercise(server);
    });

    it("maps ./server to those files in package.json", () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(coreDir, "package.json"), "utf8")) as {
            exports: Record<string, Record<string, string>>;
        };
        expect(manifest.exports["./server"]).toEqual({
            types: "./dist/dts/ai-fill/server/index.d.ts",
            import: "./dist/esm/ai-fill/server/index.js",
            require: "./dist/cjs/ai-fill/server/index.js",
        });
        expect(manifest.exports["./testing"]).toEqual({
            types: "./dist/dts/ai-fill/testing/index.d.ts",
            import: "./dist/esm/ai-fill/testing/index.js",
            require: "./dist/cjs/ai-fill/testing/index.js",
        });
    });
});
