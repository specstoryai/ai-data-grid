// Guards the vendored, patched Toast UI editor (SPST-48): the committed files are exactly
// what the generator produces from the pinned input, the embedded DOMPurify is gone, and
// no source or dependency reaches the unpatched @toast-ui packages.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CELLS = path.resolve(__dirname, "..");
const ROOT = path.resolve(CELLS, "../..");
const editorJs = readFileSync(path.join(CELLS, "vendor/toast-ui/editor.js"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(CELLS, "package.json"), "utf8"));

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
    });
}

function packageName(specifier: string) {
    const parts = specifier.split("/");
    return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

describe("V: vendored Toast UI editor", () => {
    it("V01 the committed files match the generator's output from the pinned input", () => {
        const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/vendor-toast-ui.mjs"), "--check"], {
            encoding: "utf8",
        });
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("ok packages/cells/vendor/toast-ui/editor.js");
        expect(result.stdout).toContain("ok packages/cells/vendor/toast-ui/toastui-editor.css");
    });

    it("V02 editor.js has no embedded DOMPurify, imports dompurify once and carries P1-P5", () => {
        expect(editorJs).not.toContain("createDOMPurify");
        expect(editorJs).not.toContain("DOMPurify.version = '2.3.3'");
        expect(editorJs).not.toContain("@license DOMPurify");
        expect(editorJs.match(/^import .* from 'dompurify';$/gm)).toEqual(["import DOMPurify from 'dompurify';"]);
        expect(editorJs).toContain("var purify = DOMPurify();");
        for (const marker of ["P1", "P2", "P3", "P4", "P5"]) expect(editorJs).toContain(`ai-data-grid patch ${marker}`);
        expect(editorJs.match(/safeRawHTMLTag\(\w+\) \/\* ai-data-grid patch P3 \*\//g)).toHaveLength(14);
        expect(editorJs.match(/safeURL\('(a|img)', '(href|src)', /g)).toHaveLength(3);
    });

    it("V03 no source imports @toast-ui, and the dependencies match editor.js's imports", () => {
        for (const file of sourceFiles(path.join(CELLS, "src"))) {
            expect(readFileSync(file, "utf8"), path.relative(CELLS, file)).not.toMatch(/["']@toast-ui\//);
        }

        const deps: Record<string, string> = manifest.dependencies;
        expect(Object.keys(deps).filter(name => name.startsWith("@toast-ui/"))).toEqual([]);
        expect(deps.dompurify).toMatch(/^\^3\.(4\.(1[6-9]|[2-9]\d)|([5-9]|\d{2,})\.\d+)$/);
        expect(manifest.devDependencies["@toast-ui/editor"]).toBe("3.2.2");
        expect(Object.keys(manifest.devDependencies).filter(name => name.startsWith("@toast-ui/"))).toEqual([
            "@toast-ui/editor",
        ]);

        const imports = [...editorJs.matchAll(/^import .* from '([^']+)';$/gm)].map(m => packageName(m[1]));
        expect(imports.length).toBeGreaterThan(0);
        for (const name of new Set(imports)) expect(deps[name], name).toBeDefined();
    });
});
