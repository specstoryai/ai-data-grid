// Article cell sanitizer check (SPST-48): runs the shared synthetic XSS fixtures through the
// ArticleCell editor and viewer of an installed @specstory/ai-data-grid-cells, in headless
// Chromium, Firefox and WebKit, where script execution is observable (jsdom's unit tests can
// only inspect DOM).
//
// It bundles an in-memory entry with esbuild that uses public API only
// (ArticleCell.provideEditor(cell).editor) and resolves every package from the consumer's
// node_modules, so it tests exactly what that consumer installed. For each payload it checks
// that no `window.__xss` sentinel ran and that the dangerous-DOM predicate is empty, through
// the Viewer, the editor's initial Markdown, a real clipboard paste and a real drag and drop
// onto a paragraph and onto a code block, and (Chromium only) a native drop. The page's copy
// handler puts the payload on the clipboard, and the browser hands it to the paste handlers
// unsanitized (a synthetic ClipboardEvent carries no data in Firefox). It also checks that Save after typing returns the typed Markdown, and
// that dragging a selection within the editor moves it.
//
// About drops: ProseMirror parses a drop through transformPastedHTML (patch P2), and patch P5
// prevents every drop ProseMirror declines or never sees, such as one on a code block, whose
// node view stops events. Without P5, Toast UI's dropImage plugin left every drop to the
// browser's native insertion, which runs the dropped markup's event handlers in Firefox.
// Code blocks also leave paste to the browser: it inserts its own sanitized copy of the
// markup, which ProseMirror then discards, so there "Applied" means the paste reached the
// code block.
// The "native drop" path is defense in depth for ProseMirror's DOM observer and parse rules
// (P3): it really drops the payload on a plain contenteditable, where Chromium applies its
// own drop sanitization, and inserts the resulting markup into the editor's DOM. Other
// browsers don't sanitize that staging drop, so it only runs in Chromium.
//
// Usage: node scripts/check-article-cell-sanitizer.mjs [--browser chromium|firefox|webkit|all] [consumer-node_modules]
//        (defaults: all, test-projects/vite-app/node_modules; run `npm run test-projects` first)
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "packages/cells/test/fixtures/article-sanitizer-payloads.mjs");
const BROWSERS = { chromium, firefox, webkit };
const args = process.argv.slice(2);
const browserFlag = args.indexOf("--browser");
const browserArg = browserFlag === -1 ? "all" : args.splice(browserFlag, 2)[1];
if (browserArg !== "all" && !(browserArg in BROWSERS)) {
    console.error(`--browser must be one of ${Object.keys(BROWSERS).join(", ")} or all`);
    process.exit(2);
}
const browserNames = browserArg === "all" ? Object.keys(BROWSERS) : [browserArg];
const modulesDir = resolve(args[0] ?? join(ROOT, "test-projects/vite-app/node_modules"));
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

const css = cssFile === undefined ? "" : readFileSync(cssFile, "utf8");
const WYSIWYG = ".toastui-editor-ww-container .ProseMirror";
const COPY_KEY = process.platform === "darwin" ? "Meta" : "Control";

async function runBrowser(name) {
    const browser = await BROWSERS[name].launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const pageErrors = [];
    page.on("pageerror", err => pageErrors.push(String(err)));
    page.on("console", msg => {
        // src=x payloads fail to load; that's expected noise.
        if (msg.type() === "error" && !/Failed to load resource|Cannot load image/.test(msg.text())) {
            pageErrors.push(msg.text());
        }
    });
    // #copy-src feeds a real copy: the page's copy handler puts the payload on the clipboard.
    await page.setContent(
        `<!doctype html><html><head><style>${css}</style></head><body>` +
            `<div id="drag-src" draggable="true" style="padding:8px;border:1px solid #888;width:120px">drag source</div>` +
            `<div id="native-drop" contenteditable="true" style="min-height:40px;border:1px solid #888"><p>drop here</p></div>` +
            `<textarea id="copy-src">copy source</textarea>` +
            `<div id="root"></div></body></html>`
    );
    await page.addScriptTag({ content: code, type: "module" });
    await page.waitForFunction(() => typeof window.mountArticle === "function");
    await page.evaluate(() =>
        document.addEventListener("copy", e => {
            if (window.__copyPayload === undefined) return;
            e.clipboardData.setData("text/html", window.__copyPayload);
            e.clipboardData.setData("text/plain", "copied");
            e.preventDefault();
            window.__copyPayload = undefined;
        })
    );

    async function mount(markdown, readonly) {
        await page.evaluate(() => (window.__xss = undefined));
        await page.evaluate(([md, ro]) => window.mountArticle(md, ro), [markdown, readonly]);
        await page.waitForSelector(readonly ? "#root .toastui-editor-contents" : `#root ${WYSIWYG}`, {
            timeout: 10000,
        });
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
    function record(id, caseName, path, result, applied, mustApply = false) {
        const extraFailure = mustApply && applied === false ? `${path} not applied` : undefined;
        const ok = result.executed === null && result.dangerous.length === 0 && extraFailure === undefined;
        rows.push({ id, name: caseName, path, ...result, applied, extraFailure, ok });
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

    // A trusted paste with the keyboard, so the browser's own paste runs where ProseMirror
    // doesn't handle it.
    // Returns the tag name of the element the paste event targeted.
    async function pasteHTML(html, target) {
        await page.evaluate(h => {
            window.__copyPayload = h;
            window.__pasteTarget = undefined;
            window.addEventListener("paste", e => (window.__pasteTarget = e.target.nodeName), {
                capture: true,
                once: true,
            });
        }, html);
        await page.locator("#copy-src").focus();
        await page.keyboard.press(`${COPY_KEY}+a`);
        await page.keyboard.press(`${COPY_KEY}+c`);
        await page.locator(target).click();
        await page.keyboard.press("End");
        await page.keyboard.press(`${COPY_KEY}+v`);
        return page.evaluate(() => window.__pasteTarget);
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

    const CODE_BLOCK = `#root ${WYSIWYG} pre code`;
    for (const p of pastePayloads) {
        const marker = `paste-${p.id}`;
        // Every payload goes through each path; P10 is the drop case, so it isn't pasted.
        const paths = [
            ...(p.drop ? [] : ["paste"]),
            "drop",
            "code block drop",
            ...(p.drop ? [] : ["code block paste"]),
        ];
        if (name === "chromium") paths.push("native drop");
        for (const path of paths) {
            await mount(path.startsWith("code block") ? "start\n\n```\ncode\n```" : "start", false);
            let pasteTarget;
            if (path === "paste") pasteTarget = await pasteHTML(p.html, `#root ${WYSIWYG} p`);
            else if (path === "drop") await dragAndDropHTML(p.html);
            else if (path === "code block drop") await dragAndDropHTML(p.html, CODE_BLOCK);
            else if (path === "code block paste") pasteTarget = await pasteHTML(p.html, CODE_BLOCK);
            else await nativeDropHTML(p.html);
            const result = await observe();
            // A drop on a code block is prevented (P5), so it inserts nothing. Chromium may
            // reject natively dropped markup and fall back to the text/plain flavour.
            const applied =
                path === "code block paste"
                    ? pasteTarget === "CODE"
                    : result.text.includes(marker) || (path === "native drop" && result.text.includes("dropped"));
            record(p.id, p.name, path, result, applied, path !== "code block drop");
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

    // Dragging a selected word within the editor moves it (ProseMirror handles the drop).
    await mount("alpha beta gamma", false);
    const boxes = await page.evaluate(selector => {
        const text = document.querySelector(`${selector} p`).firstChild;
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, "alpha".length);
        const from = range.getBoundingClientRect();
        range.setStart(text, text.length);
        range.setEnd(text, text.length);
        const to = range.getBoundingClientRect();
        return {
            from: { x: from.x + from.width / 2, y: from.y + from.height / 2 },
            to: { x: to.x + 2, y: to.y + to.height / 2 },
        };
    }, `#root ${WYSIWYG}`);
    await page.mouse.dblclick(boxes.from.x, boxes.from.y);
    // Wait out the double-click interval, so the next press isn't a triple click.
    await page.waitForTimeout(1000);
    await page.mouse.move(boxes.from.x, boxes.from.y);
    await page.mouse.down();
    await page.mouse.move(boxes.from.x + 5, boxes.from.y, { steps: 5 });
    await page.mouse.move(boxes.to.x, boxes.to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const moved = await page.evaluate(selector => document.querySelector(selector).textContent, `#root ${WYSIWYG}`);
    const moveOk = /^\s*beta gamma\s*alpha\s*$/.test(moved);

    await browser.close();
    return { name, version: browser.version(), rows, saved, saveOk, moved, moveOk, pageErrors };
}

let failures = 0;
for (const name of browserNames) {
    const r = await runBrowser(name);
    console.log("");
    console.log(`## ${r.name} ${r.version}`);
    console.log("");
    console.log("| ID | Case | Path | Applied | Executed | Dangerous DOM | Result |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of r.rows) {
        const dangerous =
            row.dangerous.length === 0 ? "none" : [...new Set(row.dangerous)].join(", ").replace(/\|/g, "\\|");
        const result = row.ok ? "pass" : `**FAIL**${row.extraFailure === undefined ? "" : ` (${row.extraFailure})`}`;
        const applied = row.applied === undefined ? "n/a" : row.applied ? "yes" : "no";
        console.log(
            `| ${row.id} | ${row.name} | ${row.path} | ${applied} | ${row.executed === null ? "no" : "**yes**"} | ${dangerous} | ${result} |`
        );
    }
    console.log("");
    console.log(`save after typing "hello" + " world": ${JSON.stringify(r.saved)} -> ${r.saveOk ? "pass" : "FAIL"}`);
    console.log(
        `drag "alpha" to the end of "alpha beta gamma": ${JSON.stringify(r.moved)} -> ${r.moveOk ? "pass" : "FAIL"}`
    );
    console.log(`page errors: ${r.pageErrors.length}`);
    for (const e of r.pageErrors) console.log(`  PAGE ERROR: ${e.slice(0, 200)}`);

    const failed = r.rows.filter(row => !row.ok).length;
    if (failed > 0 || !r.saveOk || !r.moveOk || r.pageErrors.length > 0) {
        failures++;
        console.error(
            `${r.name} FAILED: ${failed} case(s)${r.saveOk ? "" : ", save"}${r.moveOk ? "" : ", drag move"}${
                r.pageErrors.length > 0 ? ", page errors" : ""
            }`
        );
    } else {
        console.log(`${r.name} PASSED: ${r.rows.length} cases, save, drag move, no page errors`);
    }
}
if (failures > 0) process.exit(1);
