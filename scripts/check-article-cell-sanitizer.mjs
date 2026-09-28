// Article cell sanitizer check (SPST-48, updated for the Milkdown editor in SPST-61): runs the
// shared synthetic XSS fixtures through the ArticleCell editor and viewer of an installed
// @specstory/ai-data-grid-cells, in headless Chromium, Firefox and WebKit, where script
// execution is observable (jsdom's unit tests can only inspect DOM).
//
// It bundles an in-memory entry with esbuild that uses public API only
// (ArticleCell.provideEditor(cell).editor) and resolves every package from the consumer's
// node_modules, so it tests exactly what that consumer installed. It loads cells' CSS the way a
// consumer does: dist/index.css with its @imports inlined. For each payload it checks that no
// `window.__xss` sentinel ran and that the dangerous-DOM predicate is empty, through the
// viewer, the editor's initial Markdown, a real clipboard paste and a real drag and drop onto a
// paragraph and onto a code block, a paste into a code block, and (Chromium only) a native
// drop. The page's copy handler puts the payload on the clipboard, and the browser hands it to
// the paste handlers unsanitized (a synthetic ClipboardEvent carries no data in Firefox).
//
// The "Native" column records whether a paste or drop on the editor reached `document` without
// `defaultPrevented`, which means the browser's native insertion ran (P6). With the Milkdown
// editor every paste and drop row must say "no", a code block must receive only the plain
// text, and an HTML-only paste or drop onto a code block (A1) must change nothing. It also
// checks that Save after typing returns the typed Markdown, that dragging a selection within
// the editor moves it, and that the link dialog's URL field accepts a paste (A2).
//
// The "native drop" path is defense in depth for ProseMirror's DOM observer and parse rules: it
// really drops the payload on a plain contenteditable, where Chromium applies its own drop
// sanitization, and inserts the resulting markup into the editor's DOM. Other browsers don't
// sanitize that staging drop, so it only runs in Chromium.
//
// It also runs against a consumer of `main` before SPST-61 (the vendored Toast UI editor),
// which it detects from the rendered DOM, for a before-and-after record. There the Toast UI
// selectors are used and the code-block checks only record what happened.
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

// The article CSS, as a consumer loads it: before SPST-61 it was dist/toastui-editor.css (or
// Toast UI's own file before SPST-48); from SPST-61 on it's part of dist/index.css.
const legacyCss =
    tryResolve(consumerRequire, "@specstory/ai-data-grid-cells/dist/toastui-editor.css") ??
    tryResolve(cellsRequire, "@toast-ui/editor/dist/toastui-editor.css");
const indexCss = tryResolve(consumerRequire, "@specstory/ai-data-grid-cells/dist/index.css");
const cssFile = legacyCss ?? indexCss;
let css = "";
if (legacyCss !== undefined) {
    css = readFileSync(legacyCss, "utf8");
} else if (indexCss !== undefined) {
    // Inline dist/index.css's @imports, as a bundler would.
    const cssBundle = await build({ entryPoints: [indexCss], bundle: true, write: false, logLevel: "warning" });
    css = cssBundle.outputFiles[0].text;
}

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
    loader: { ".css": "empty" },
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
const purifyVersions = [...code.matchAll(/DOMPurify\.version = ['"]([\d.]+)['"]/g)].map(m => m[1]);
console.log(
    `DOMPurify version literals in the bundle: ${purifyVersions.length === 0 ? "none" : purifyVersions.join(", ")}`
);
// Module inputs, not the bundle's text: the bundled fixtures name Toast UI's legacy selector.
const toastInputs = Object.keys(bundle.metafile.inputs).filter(f => /toast-?ui/i.test(f));
console.log(`Toast UI modules in the bundle: ${toastInputs.length === 0 ? "none" : toastInputs.length}`);
console.log(`article CSS: ${cssFile === undefined ? "not found" : relative(consumerDir, cssFile)}`);

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
    await page.evaluate(() => {
        document.addEventListener("copy", e => {
            if (window.__copyPayload === undefined) return;
            const { html, text } = window.__copyPayload;
            if (html !== undefined) e.clipboardData.setData("text/html", html);
            if (text !== undefined) e.clipboardData.setData("text/plain", text);
            e.preventDefault();
            window.__copyPayload = undefined;
        });
        // The "Native" column: a paste or drop on the editor that reaches the document without
        // defaultPrevented is left to the browser's native insertion.
        window.__native = [];
        for (const type of ["paste", "drop"]) {
            document.addEventListener(type, e => {
                if (document.getElementById("root").contains(e.target) && !e.defaultPrevented) {
                    window.__native.push(type);
                }
            });
        }
    });

    // Which editor this consumer ships: the Milkdown editor (.gdg-article-content), or the
    // vendored Toast UI editor of `main` before SPST-61 (legacy mode).
    await page.evaluate(() => window.mountArticle("probe", false));
    await page.waitForSelector("#root .gdg-article-content, #root .toastui-editor-contents", {
        state: "attached",
        timeout: 10000,
    });
    const legacy = await page.evaluate(() => document.querySelector("#root .gdg-article-content") === null);
    const EDITOR = legacy ? "#root .toastui-editor-ww-container .ProseMirror" : "#root .gdg-article-content";
    const VIEWER = legacy ? "#root .toastui-editor-contents" : "#root .gdg-article-content";
    const CODE_BLOCK = `${EDITOR} pre code`;

    async function mount(markdown, readonly) {
        await page.evaluate(() => {
            window.__xss = undefined;
            window.__native = [];
        });
        await page.evaluate(([md, ro]) => window.mountArticle(md, ro), [markdown, readonly]);
        await page.waitForSelector(readonly ? VIEWER : EDITOR, { timeout: 10000 });
        await page.waitForTimeout(250);
    }

    async function observe() {
        await page.waitForTimeout(400);
        return page.evaluate(
            ([editorSelector, codeSelector]) => {
                const content = document.querySelector(editorSelector);
                const codeEl = document.querySelector(codeSelector);
                let structure;
                if (content !== null) {
                    // The content without the code block's text, to tell what else changed.
                    const clone = content.cloneNode(true);
                    for (const c of clone.querySelectorAll("pre code")) c.textContent = "";
                    structure = clone.innerHTML;
                }
                return {
                    executed: window.__xss ?? null,
                    dangerous: window.fixtures.findDangerousDOM(document.getElementById("root")),
                    text: document.getElementById("root").textContent,
                    native: window.__native.length > 0,
                    codeText: codeEl?.textContent ?? null,
                    structure,
                    html: content?.innerHTML,
                };
            },
            [EDITOR, CODE_BLOCK]
        );
    }

    const snapshot = () =>
        page.evaluate(
            ([editorSelector]) => {
                const content = document.querySelector(editorSelector);
                const clone = content.cloneNode(true);
                for (const c of clone.querySelectorAll("pre code")) c.textContent = "";
                return { structure: clone.innerHTML, html: content.innerHTML };
            },
            [EDITOR]
        );

    const rows = [];
    function record(id, caseName, path, result, applied, { mustApply = false, eventPath = false, failure } = {}) {
        const failures = [];
        if (mustApply && applied === false) failures.push(`${path} not applied`);
        if (!legacy && eventPath && result.native) failures.push("native insertion");
        if (!legacy && failure !== undefined) failures.push(failure);
        const ok = result.executed === null && result.dangerous.length === 0 && failures.length === 0;
        rows.push({ id, name: caseName, path, ...result, applied, eventPath, failures, ok });
    }

    const { renderPayloads, pastePayloads, htmlOnlyCodePayload } = await page.evaluate(() => ({
        renderPayloads: window.fixtures.renderPayloads,
        pastePayloads: window.fixtures.pastePayloads,
        htmlOnlyCodePayload: window.fixtures.htmlOnlyCodePayload,
    }));

    for (const p of renderPayloads) {
        for (const readonly of [true, false]) {
            await mount(`before\n\n${p.markdown}\n\nafter`, readonly);
            record(p.id, p.name, readonly ? "viewer" : "editor", await observe(), undefined);
        }
    }

    // A trusted paste with the keyboard, so the browser's own paste runs where the editor
    // doesn't handle it. Returns the tag name of the element the paste event targeted.
    async function pasteData(data, target) {
        await page.evaluate(d => {
            window.__copyPayload = d;
            window.__pasteTarget = undefined;
            window.addEventListener("paste", e => (window.__pasteTarget = e.target.nodeName), {
                capture: true,
                once: true,
            });
        }, data);
        await page.locator("#copy-src").focus();
        await page.keyboard.press(`${COPY_KEY}+a`);
        await page.keyboard.press(`${COPY_KEY}+c`);
        await page.locator(target).click();
        await page.keyboard.press("End");
        // Chromium can paste at a stale selection right after a click, so let it settle.
        await page.waitForTimeout(150);
        await page.keyboard.press(`${COPY_KEY}+v`);
        return page.evaluate(() => window.__pasteTarget);
    }

    async function dragAndDropData(data, target) {
        await page.evaluate(d => {
            const src = document.getElementById("drag-src");
            src.ondragstart = e => {
                if (d.html !== undefined) e.dataTransfer.setData("text/html", d.html);
                if (d.text !== undefined) e.dataTransfer.setData("text/plain", d.text);
            };
        }, data);
        await page.dragAndDrop("#drag-src", target);
    }

    // A browser's native contenteditable drop: Chromium's natively dropped markup, inserted into
    // the editor's DOM, where ProseMirror's DOM observer parses it with the schema's parse rules.
    async function nativeDropHTML(html) {
        await page.evaluate(() => (document.getElementById("native-drop").innerHTML = "<p>drop here</p>"));
        await dragAndDropData({ html, text: "dropped" }, "#native-drop p");
        const dropped = await page.evaluate(() => document.getElementById("native-drop").innerHTML);
        await page.locator(EDITOR).click();
        await page.keyboard.press("End");
        await page.evaluate(h => document.execCommand("insertHTML", false, h), dropped);
    }

    // A code block may only gain the plain-text flavor (P6), and nothing else may change.
    function codeBlockCheck(before, result, inserted) {
        if (result.codeText === null) return "code block gone";
        if (result.structure !== before.structure) return "more than plain text inserted";
        if (result.codeText.replace(inserted, "") !== "code") return "code text changed";
        return undefined;
    }

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
            const before = path.startsWith("code block") ? await snapshot() : undefined;
            let pasteTarget;
            if (path === "paste") pasteTarget = await pasteData({ html: p.html, text: "copied" }, `${EDITOR} p`);
            else if (path === "drop") await dragAndDropData({ html: p.html, text: "dropped" }, `${EDITOR} p`);
            else if (path === "code block drop") await dragAndDropData({ html: p.html, text: "dropped" }, CODE_BLOCK);
            else if (path === "code block paste")
                pasteTarget = await pasteData({ html: p.html, text: "copied" }, CODE_BLOCK);
            else await nativeDropHTML(p.html);
            const result = await observe();
            if (path === "code block paste") {
                // Toast UI (legacy): the paste reached the code block; Milkdown: only "copied" went in.
                const failure = legacy ? undefined : codeBlockCheck(before, result, "copied");
                const applied = legacy ? pasteTarget === "CODE" : failure === undefined;
                record(p.id, p.name, path, result, applied, { mustApply: true, eventPath: true, failure });
            } else if (path === "code block drop") {
                // Toast UI (legacy) prevents a code-block drop; Milkdown inserts only "dropped".
                const failure = legacy ? undefined : codeBlockCheck(before, result, "dropped");
                const applied = legacy ? result.codeText !== "code" : failure === undefined;
                record(p.id, p.name, path, result, applied, { mustApply: !legacy, eventPath: true, failure });
            } else {
                // Chromium may reject natively dropped markup and fall back to the text/plain flavour.
                const applied =
                    result.text.includes(marker) || (path === "native drop" && result.text.includes("dropped"));
                record(p.id, p.name, path, result, applied, { mustApply: true, eventPath: path !== "native drop" });
            }
        }
    }

    // A1: an HTML-only paste or drop onto a code block changes nothing.
    for (const path of ["code block paste, HTML only", "code block drop, HTML only"]) {
        await mount("start\n\n```\ncode\n```", false);
        const before = await snapshot();
        if (path.includes("paste")) await pasteData({ html: htmlOnlyCodePayload.html }, CODE_BLOCK);
        else await dragAndDropData({ html: htmlOnlyCodePayload.html }, CODE_BLOCK);
        const result = await observe();
        const unchanged = result.html === before.html;
        record(htmlOnlyCodePayload.id, htmlOnlyCodePayload.name, path, result, !unchanged, {
            eventPath: true,
            failure: unchanged ? undefined : "the code block or document changed",
        });
    }

    // Save after typing returns the edited Markdown.
    await mount("hello", false);
    await page.locator(EDITOR).click();
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
    }, EDITOR);
    await page.mouse.dblclick(boxes.from.x, boxes.from.y);
    // Wait out the double-click interval, so the next press isn't a triple click.
    await page.waitForTimeout(1000);
    await page.mouse.move(boxes.from.x, boxes.from.y);
    await page.mouse.down();
    await page.mouse.move(boxes.from.x + 5, boxes.from.y, { steps: 5 });
    await page.mouse.move(boxes.to.x, boxes.to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const moved = await page.evaluate(selector => document.querySelector(selector).textContent, EDITOR);
    const moveOk = /^\s*beta gamma\s*alpha\s*$/.test(moved);

    // A2: the link dialog's URL field accepts an ordinary paste (Milkdown editor only).
    let linkPaste;
    if (!legacy) {
        await mount("link text", false);
        await page.locator(EDITOR).click();
        await page.keyboard.press(`${COPY_KEY}+a`);
        await page.locator('#root [aria-label="Insert link"]').click();
        await page.evaluate(() => (window.__copyPayload = { text: "https://example.com/pasted" }));
        await page.locator("#copy-src").focus();
        await page.keyboard.press(`${COPY_KEY}+a`);
        await page.keyboard.press(`${COPY_KEY}+c`);
        await page.locator("#root .gdg-article-link-url").click();
        await page.keyboard.press(`${COPY_KEY}+v`);
        const value = await page.locator("#root .gdg-article-link-url").inputValue();
        linkPaste = { value, ok: value === "https://example.com/pasted" };
    }

    await browser.close();
    return { name, version: browser.version(), legacy, rows, saved, saveOk, moved, moveOk, linkPaste, pageErrors };
}

let failures = 0;
for (const name of browserNames) {
    const r = await runBrowser(name);
    console.log("");
    console.log(`## ${r.name} ${r.version}${r.legacy ? " (legacy mode: Toast UI editor)" : ""}`);
    console.log("");
    console.log("| ID | Case | Path | Applied | Executed | Dangerous DOM | Native | Result |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of r.rows) {
        const dangerous =
            row.dangerous.length === 0 ? "none" : [...new Set(row.dangerous)].join(", ").replace(/\|/g, "\\|");
        const result = row.ok ? "pass" : `**FAIL**${row.failures.length === 0 ? "" : ` (${row.failures.join("; ")})`}`;
        const applied = row.applied === undefined ? "n/a" : row.applied ? "yes" : "no";
        const native = row.eventPath ? (row.native ? "**yes**" : "no") : "n/a";
        console.log(
            `| ${row.id} | ${row.name} | ${row.path} | ${applied} | ${row.executed === null ? "no" : "**yes**"} | ${dangerous} | ${native} | ${result} |`
        );
    }
    console.log("");
    console.log(`save after typing "hello" + " world": ${JSON.stringify(r.saved)} -> ${r.saveOk ? "pass" : "FAIL"}`);
    console.log(
        `drag "alpha" to the end of "alpha beta gamma": ${JSON.stringify(r.moved)} -> ${r.moveOk ? "pass" : "FAIL"}`
    );
    if (r.linkPaste !== undefined) {
        console.log(
            `paste a URL into the link dialog: ${JSON.stringify(r.linkPaste.value)} -> ${r.linkPaste.ok ? "pass" : "FAIL"}`
        );
    }
    console.log(`page errors: ${r.pageErrors.length}`);
    for (const e of r.pageErrors) console.log(`  PAGE ERROR: ${e.slice(0, 200)}`);

    const failed = r.rows.filter(row => !row.ok).length;
    const nativeRows = r.rows.filter(row => row.eventPath && row.native).length;
    const linkOk = r.linkPaste === undefined || r.linkPaste.ok;
    if (failed > 0 || !r.saveOk || !r.moveOk || !linkOk || r.pageErrors.length > 0) {
        failures++;
        console.error(
            `${r.name} FAILED: ${failed} of ${r.rows.length} case(s)${r.saveOk ? "" : ", save"}${
                r.moveOk ? "" : ", drag move"
            }${linkOk ? "" : ", link dialog paste"}${r.pageErrors.length > 0 ? ", page errors" : ""}; native: ${nativeRows}`
        );
    } else {
        console.log(
            `${r.name} PASSED: ${r.rows.length} cases, native: ${nativeRows}, save, drag move${
                r.linkPaste === undefined ? "" : ", link dialog paste"
            }, no page errors`
        );
    }
}
if (failures > 0) process.exit(1);
