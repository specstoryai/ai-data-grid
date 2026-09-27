import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Metafile } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Caps what AI Fill costs apps that render `DataEditor` without setting
 * `aiFill` (SPST-17, Amendment 1, A7). It bundles a `DataEditor`-only app from
 * the built `dist/esm` with the locked root esbuild, the way a bundler would.
 *
 * Measured on `main` at `a0a121c`: 70,374 B gzip of initial JS and 2,052 B
 * gzip of CSS. Sizes are GNU `gzip -9` of the concatenated output files.
 *
 * esbuild's JS API refuses to run under jsdom, so this runs the esbuild CLI.
 */
const limits = {
    initialJs: 71_900,
    css: 4_600,
    lazyAiChunks: 40_000,
};

/** The only AI Fill module allowed in the initial chunks: the static bridge. */
const allowedInitialAiModules = new Set(["dist/esm/ai-fill/react/bridge.js"]);

const external = ["react", "react-dom", "marked", "lodash", "react-responsive-carousel"];

const entry = [
    'import { DataEditor } from "@specstory/ai-data-grid";',
    'import "@specstory/ai-data-grid/dist/index.css";',
    "export { DataEditor };",
].join("\n");

const coreDir = path.resolve(".");
const esbuildBin = path.resolve(coreDir, "../../node_modules/.bin/esbuild");

interface BundleReport {
    readonly initialJs: number;
    readonly css: number;
    readonly lazyAiChunks: number;
    readonly initialAiModules: readonly string[];
}

function gzipSize(files: readonly string[]): number {
    const contents = Buffer.concat(files.map(file => fs.readFileSync(path.resolve(coreDir, file))));
    return execFileSync("gzip", ["-9", "-c"], { input: contents }).length;
}

function isAiFillModule(input: string): boolean {
    return /(?:^|\/)ai-fill\//.test(input);
}

function bundle(outdir: string): Metafile {
    const metafile = path.join(outdir, "meta.json");
    execFileSync(
        esbuildBin,
        [
            "--bundle",
            "--minify",
            "--splitting",
            "--format=esm",
            ...external.map(name => `--external:${name}`),
            "--sourcefile=bundle-budget-entry.js",
            `--outdir=${outdir}`,
            `--metafile=${metafile}`,
            "--log-level=error",
        ],
        { cwd: coreDir, input: entry }
    );
    return JSON.parse(fs.readFileSync(metafile, "utf8")) as Metafile;
}

function measure(): BundleReport {
    for (const file of ["dist/esm/index.js", "dist/index.css"]) {
        if (!fs.existsSync(path.join(coreDir, file))) {
            throw new Error(`${file} is missing: run \`npm run build\` first`);
        }
    }

    const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-data-grid-bundle-budget-"));
    try {
        const { outputs } = bundle(outdir);

        const entryOutput = Object.keys(outputs).find(
            key => key.endsWith(".js") && outputs[key].entryPoint !== undefined
        );
        if (entryOutput === undefined) throw new Error("esbuild produced no entry chunk");

        // The entry chunk plus every chunk it imports statically, in load order.
        const initial: string[] = [];
        const queue = [entryOutput];
        while (queue.length > 0) {
            const key = queue.shift() ?? "";
            if (initial.includes(key)) continue;
            initial.push(key);
            for (const imported of outputs[key].imports) {
                if (imported.kind === "import-statement" && imported.external !== true) queue.push(imported.path);
            }
        }

        const lazyAi = Object.keys(outputs).filter(
            key =>
                key.endsWith(".js") && !initial.includes(key) && Object.keys(outputs[key].inputs).some(isAiFillModule)
        );
        const css = Object.keys(outputs).filter(key => key.endsWith(".css"));

        return {
            initialJs: gzipSize(initial),
            css: gzipSize(css),
            lazyAiChunks: lazyAi.length === 0 ? 0 : gzipSize(lazyAi),
            initialAiModules: initial.flatMap(key => Object.keys(outputs[key].inputs).filter(isAiFillModule)),
        };
    } finally {
        fs.rmSync(outdir, { recursive: true, force: true });
    }
}

describe("AI Fill bundle budget for a DataEditor-only app", () => {
    let report: BundleReport;

    beforeAll(() => {
        report = measure();
        console.info(
            `bundle-budget: initial JS ${report.initialJs} B gzip, CSS ${report.css} B gzip, ` +
                `lazy AI chunks ${report.lazyAiChunks} B gzip`
        );
    }, 60_000);

    it(`keeps the initial JS at or below ${limits.initialJs} B gzip`, () => {
        expect(report.initialJs).toBeLessThanOrEqual(limits.initialJs);
    });

    it(`keeps the CSS at or below ${limits.css} B gzip`, () => {
        expect(report.css).toBeLessThanOrEqual(limits.css);
    });

    it("keeps AI Fill modules out of the initial chunks, except the bridge", () => {
        expect(report.initialAiModules.filter(input => !allowedInitialAiModules.has(input))).toEqual([]);
    });

    it("keeps the execution layer (transport, engine, server, testing) out of the initial chunks", () => {
        const executionLayer = /(?:^|\/)ai-fill\/(?:transport|engine|server|testing)\//;
        expect(report.initialAiModules.filter(input => executionLayer.test(input))).toEqual([]);
    });

    it(`keeps the lazy AI Fill chunks at or below ${limits.lazyAiChunks} B gzip`, () => {
        expect(report.lazyAiChunks).toBeLessThanOrEqual(limits.lazyAiChunks);
    });
});
