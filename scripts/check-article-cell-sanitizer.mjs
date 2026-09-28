// Article cell sanitizer check (SPST-48): runs the shared synthetic XSS fixtures through the
// ArticleCell editor and viewer of an installed @specstory/ai-data-grid-cells, in headless
// Chromium, where script execution is observable (jsdom's unit tests can only inspect DOM).
//
// It bundles an in-memory entry with esbuild that uses public API only
// (ArticleCell.provideEditor(cell).editor) and resolves every package from the consumer's
// node_modules, so it tests exactly what that consumer installed. For each payload it checks
// that no `window.__xss` sentinel ran and that the dangerous-DOM predicate is empty, through
// the Viewer, the editor's initial Markdown, paste (ClipboardEvent), a real drag and drop, and
// a native drop. It also checks that Save after typing returns the typed Markdown.
//
// About drops: Toast UI's dropImage plugin tells ProseMirror every drop is handled, so
// ProseMirror never parses dropped HTML itself. Chromium then performs no native insertion
// either (the page accepted the dragover), so a real drop is a no-op here. Browsers that do
// insert natively hand the new DOM to ProseMirror's DOM observer and parse rules. The
// "native drop" path exercises that route: it really drops the payload on a plain
// contenteditable, so Chromium applies its own drop sanitization, and inserts the resulting
// markup into the editor's DOM.
//
// Usage: node scripts/check-article-cell-sanitizer.mjs [consumer-node_modules]
//        (default test-projects/vite-app/node_modules; run `npm run test-projects` first)
import { build } from "esbuild";
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "packages/cells/test/fixtures/article-sanitizer-payloads.mjs");
const modulesDir = resolve(process.argv[2] ?? join(ROOT, "test-projects/vite-app/node_modules"));
const consumerDir = dirname(modulesDir);
const cellsDir = join(modulesDir, "@specstory/ai-data-grid-cells");
if (!existsSync(join(cellsDir, "package.json"))) {
    console.error(`No @specstory/ai-data-grid-cells in ${modulesDir}. Run \`npm run test-projects\` first.`);
    process.exit(2);
}

const consumerRequire = createRequire(join(consumerDir, "package.json"));
const cellsRequire = createRequire(join(cellsDir, "package.json"));
function tryResolve(req, specifier) {
    try {
        return req.resolve(specifier);
    } catch {
        return undefined;
    }
}
function packageVersion(file) {
    for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
        const pj = join(dir, "package.json");
        if (existsSync(pj)) {
            const manifest = JSON.parse(readFileSync(pj, "utf8"));
            if (manifest.name !== undefined) return `${manifest.name}@${manifest.version}`;
        }
    }
    return "unknown";
}

// The editor CSS: this PR's subpath, or the old @toast-ui path for a consumer of `main`.
const cssFile =
    tryResolve(consumerRequire, "@specstory/ai-data-grid-cells/dist/toastui-editor.css") ??
    tryResolve(cellsRequire, "@toast-ui/editor/dist/toastui-editor.css");

const entry = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ArticleCell } from "@specstory/ai-data-grid-cells";
import * as fixtures from ${JSON.stringify(FIXTURES)};
window.fixtures = fixtures;
let root;
window.mountArticle = (markdown, readonly) => {
    const el = document.getElementById("root");
    if (root !== undefined) flushSync(() => root.unmount());
    el.replaceChildren();
    window.__saved = undefined;
    const cell = { kind: "custom", allowOverlay: true, copyData: "", readonly, data: { kind: "article-cell", markdown } };
    const CellEditor = ArticleCell.provideEditor({ ...cell, location: [0, 0] }).editor;
    root = createRoot(el);
    root.render(React.createElement(CellEditor, {
        value: cell,
        onChange: () => undefined,
        onFinishedEditing: v => (window.__saved = v === undefined ? { closed: true } : { markdown: v.data.markdown }),
        isHighlighted: false,
        forceEditMode: false,
        target: { x: 0, y: 0, width: 800, height: 600 },
    }));
};
`;

const bundle = await build({
    stdin: { contents: entry, resolveDir: consumerDir, sourcefile: "check-article-cell-sanitizer-entry.js" },
    nodePaths: [modulesDir],
    bundle: true,
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
});
const code = bundle.outputFiles[0].text;
const sanitizerInputs = Object.keys(bundle.metafile.inputs).filter(f => /dompurify|toast-?ui/i.test(f));
const dompurifyInput = sanitizerInputs.find(f => /dompurify/.test(f));

console.log(`consumer: ${relative(process.cwd(), modulesDir) || "."}`);
console.log(`cells: ${packageVersion(join(cellsDir, "package.json"))}`);
console.log(`bundle: ${code.length} B; sanitizer-related esbuild inputs:`);
for (const f of sanitizerInputs) console.log(`  ${f}`);
console.log(
    `dompurify resolved from the cells package: ${
        tryResolve(cellsRequire, "dompurify") === undefined ? "none" : packageVersion(cellsRequire.resolve("dompurify"))
    }; bundled: ${dompurifyInput === undefined ? "none" : packageVersion(resolve(dompurifyInput))}`
);
console.log(
    `embedded DOMPurify 2.3.3 copies in the bundle: ${(code.match(/DOMPurify\.version = ['"]2\.3\.3['"]/g) ?? []).length}`
);
console.log(`editor CSS: ${cssFile === undefined ? "not found" : relative(consumerDir, cssFile)}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const pageErrors = [];
page.on("pageerror", err => pageErrors.push(String(err)));
page.on("console", msg => {
    // src=x payloads fail to load; that's expected noise.
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) pageErrors.push(msg.text());
});
const css = cssFile === undefined ? "" : readFileSync(cssFile, "utf8");
await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body>` +
        `<div id="drag-src" draggable="true" style="padding:8px;border:1px solid #888;width:120px">drag source</div>` +
        `<div id="native-drop" contenteditable="true" style="min-height:40px;border:1px solid #888"><p>drop here</p></div>` +
        `<div id="root"></div></body></html>`
);
await page.addScriptTag({ content: code, type: "module" });
await page.waitForFunction(() => typeof window.mountArticle === "function");

const WYSIWYG = ".toastui-editor-ww-container .ProseMirror";

async function mount(markdown, readonly) {
    await page.evaluate(() => (window.__xss = undefined));
    await page.evaluate(([md, ro]) => window.mountArticle(md, ro), [markdown, readonly]);
    await page.waitForSelector(readonly ? "#root .toastui-editor-contents" : `#root ${WYSIWYG}`, { timeout: 10000 });
    await page.waitForTimeout(250);
}

async function observe() {
    await page.waitForTimeout(400);
    return page.evaluate(() => ({
        executed: window.__xss ?? null,
        dangerous: window.fixtures.findDangerousDOM(document.getElementById("root")),
        text: document.getElementById("root").textContent,
    }));
}

const rows = [];
function record(id, name, path, result, applied, mustApply = false) {
    const extraFailure = mustApply && applied === false ? `${path} not applied` : undefined;
    const ok = result.executed === null && result.dangerous.length === 0 && extraFailure === undefined;
    rows.push({ id, name, path, ...result, applied, extraFailure, ok });
}

const { renderPayloads, pastePayloads } = await page.evaluate(() => ({
    renderPayloads: window.fixtures.renderPayloads,
    pastePayloads: window.fixtures.pastePayloads,
}));

for (const p of renderPayloads) {
    for (const readonly of [true, false]) {
        await mount(`before\n\n${p.markdown}\n\nafter`, readonly);
        record(p.id, p.name, readonly ? "viewer" : "editor", await observe(), undefined);
    }
}

async function pasteHTML(html) {
    await page.evaluate(
        ([selector, h]) => {
            const pm = document.querySelector(selector);
            pm.focus();
            const dt = new DataTransfer();
            dt.setData("text/html", h);
            dt.setData("text/plain", "plain");
            pm.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        },
        [WYSIWYG, html]
    );
}

async function dragAndDropHTML(html, target = `#root ${WYSIWYG} p`) {
    await page.evaluate(h => {
        const src = document.getElementById("drag-src");
        src.ondragstart = e => {
            e.dataTransfer.setData("text/html", h);
            e.dataTransfer.setData("text/plain", "dropped");
        };
    }, html);
    await page.dragAndDrop("#drag-src", target);
}

// A browser's native contenteditable drop: Chromium's natively dropped markup, inserted into
// the editor's DOM, where ProseMirror's DOM observer parses it with the schema's parse rules.
async function nativeDropHTML(html) {
    await page.evaluate(() => (document.getElementById("native-drop").innerHTML = "<p>drop here</p>"));
    await dragAndDropHTML(html, "#native-drop p");
    const dropped = await page.evaluate(() => document.getElementById("native-drop").innerHTML);
    await page.locator(`#root ${WYSIWYG}`).click();
    await page.keyboard.press("End");
    await page.evaluate(h => document.execCommand("insertHTML", false, h), dropped);
}

for (const p of pastePayloads) {
    const marker = `paste-${p.id}`;
    // Every payload goes through each path; P10 is the drop case, so it isn't pasted.
    for (const path of p.drop ? ["drop", "native drop"] : ["paste", "drop", "native drop"]) {
        await mount("start", false);
        if (path === "paste") await pasteHTML(p.html);
        else if (path === "drop") await dragAndDropHTML(p.html);
        else await nativeDropHTML(p.html);
        const result = await observe();
        // A real drop is a no-op in Chromium (see above); paste and native drop must apply.
        // Chromium may reject dropped markup and fall back to the text/plain flavour.
        const applied = result.text.includes(marker) || (path === "native drop" && result.text.includes("dropped"));
        record(p.id, p.name, path, result, applied, path !== "drop");
    }
}

// Save after typing returns the edited Markdown (B1).
await mount("hello", false);
await page.locator(`#root ${WYSIWYG}`).click();
await page.keyboard.press("End");
await page.keyboard.type(" world");
await page.locator("#root .gdg-save-button").click();
const saved = await page.evaluate(() => window.__saved);
const saveOk = typeof saved?.markdown === "string" && saved.markdown.includes("hello world");

await browser.close();

console.log("");
console.log("| ID | Case | Path | Applied | Executed | Dangerous DOM | Result |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
    const dangerous = r.dangerous.length === 0 ? "none" : [...new Set(r.dangerous)].join(", ").replace(/\|/g, "\\|");
    const result = r.ok ? "pass" : `**FAIL**${r.extraFailure === undefined ? "" : ` (${r.extraFailure})`}`;
    const applied = r.applied === undefined ? "n/a" : r.applied ? "yes" : "no";
    console.log(
        `| ${r.id} | ${r.name} | ${r.path} | ${applied} | ${r.executed === null ? "no" : "**yes**"} | ${dangerous} | ${result} |`
    );
}
console.log("");
console.log(`save after typing "hello" + " world": ${JSON.stringify(saved)} -> ${saveOk ? "pass" : "FAIL"}`);
console.log(`page errors: ${pageErrors.length}`);
for (const e of pageErrors) console.log(`  PAGE ERROR: ${e.slice(0, 200)}`);

const failed = rows.filter(r => !r.ok).length;
if (failed > 0 || !saveOk || pageErrors.length > 0) {
    console.error(`FAILED: ${failed} case(s)${saveOk ? "" : ", save"}${pageErrors.length > 0 ? ", page errors" : ""}`);
    process.exit(1);
}
console.log(`PASSED: ${rows.length} cases, save, no page errors`);
