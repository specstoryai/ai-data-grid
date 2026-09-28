#!/usr/bin/env node
/**
 * First type-to-edit check (SPST-80, GitHub #58). With React 19, a `React.lazy`
 * overlay editor suspends on the first edit after a page load, and React holds
 * the reveal for up to 300 ms. Keys typed in that window reach the grid, not
 * the editor, so a word typed at normal speed is saved without its first
 * letters.
 *
 * It checks a Text cell and a Number cell of the built `vite-app` sample. Each
 * trial loads a fresh page, clicks the cell, presses one key and measures the
 * time from its `keydown` to an `<input>` or `<textarea>` getting focus. It then
 * loads another fresh page, types a word at `--delay` ms per key, presses Enter
 * and reads the saved value back from the grid's accessibility table, then
 * does the same on another row of that page (the second edit). At the end of
 * each browser's run it opens an editor by double-click and one by Enter.
 *
 * It fails if a saved value isn't exactly the typed word, a first-edit gap is
 * over `--max-gap` (default 150 ms), an editor doesn't open, or the page logs
 * an error.
 *
 *     npm run build && npm run test-projects
 *     node scripts/check-first-edit.mjs                          # all browsers
 *     node scripts/check-first-edit.mjs --browser chromium --trials 10
 *     node scripts/check-first-edit.mjs http://localhost:4173/   # a running server
 *
 * The optional positional argument is a directory to serve (default
 * `test-projects/vite-app/dist`) or an `http(s)://` URL. Needs Playwright's
 * browsers (`npx playwright install chromium firefox webkit`).
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium, firefox, webkit } from "playwright";

const engines = { chromium, firefox, webkit };

function parseArgs(argv) {
    const options = { browser: "all", trials: 5, delay: 50, maxGap: 150, target: "test-projects/vite-app/dist" };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            const next = argv[++i];
            if (next === undefined) usage(`${arg} needs a value`);
            return next;
        };
        if (arg === "--browser") options.browser = value();
        else if (arg === "--trials") options.trials = Number(value());
        else if (arg === "--delay") options.delay = Number(value());
        else if (arg === "--max-gap") options.maxGap = Number(value());
        else if (arg.startsWith("--")) usage(`unknown option ${arg}`);
        else options.target = arg;
    }
    if (options.browser !== "all" && !(options.browser in engines)) usage(`unknown browser ${options.browser}`);
    for (const key of ["trials", "delay", "maxGap"]) {
        if (!Number.isFinite(options[key]) || options[key] < 0) usage(`bad value for ${key}`);
    }
    return options;
}

function usage(message) {
    console.error(message);
    console.error(
        "usage: node scripts/check-first-edit.mjs [--browser chromium|firefox|webkit|all] [--trials N] " +
            "[--delay ms-per-key] [--max-gap ms] [dist-dir | url]"
    );
    process.exit(2);
}

const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".map": "application/json",
};

function serve(dir) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? "/", "http://localhost");
            let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
            if (path === "" || path.endsWith("/")) path = join(path, "index.html");
            const file = join(dir, path);
            if (!file.startsWith(dir)) throw new Error("forbidden");
            const body = await readFile(file);
            res.writeHead(200, { "content-type": mimeTypes[extname(file)] ?? "application/octet-stream" });
            res.end(body);
        } catch {
            res.writeHead(404);
            res.end("not found");
        }
    });
    return new Promise((resolveServer, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolveServer(server));
    });
}

// The vite-app sample's layout: Name (Text, 200 px) then Age (Number, 80 px), a 36 px
// header and 34 px rows, no row markers. Row 1 is used for the second edit.
const cases = [
    { kind: "Text", col: 0, x: 100, word: "edited" },
    { kind: "Number", col: 1, x: 240, word: "12345" },
];
const headerHeight = 36;
const rowHeight = 34;

// Installed before the app loads. Records the first keydown after `arm()` and the first
// focus of an input or textarea after it, both from `performance.now()`. The sample has no
// `<div id="portal">`, which the overlay editor needs, so this adds one.
function installProbe() {
    document.addEventListener("DOMContentLoaded", () => {
        if (document.getElementById("portal") !== null) return;
        const portal = document.createElement("div");
        portal.id = "portal";
        document.body.append(portal);
    });
    const probe = { armed: false, keydown: undefined, focus: undefined };
    window.__firstEdit = probe;
    probe.arm = () => {
        probe.armed = true;
        probe.keydown = undefined;
        probe.focus = undefined;
    };
    window.addEventListener(
        "keydown",
        () => {
            if (probe.armed && probe.keydown === undefined) probe.keydown = performance.now();
        },
        true
    );
    document.addEventListener(
        "focusin",
        event => {
            const tag = event.target?.tagName;
            if (probe.keydown !== undefined && probe.focus === undefined && (tag === "INPUT" || tag === "TEXTAREA")) {
                probe.focus = performance.now();
            }
        },
        true
    );
}

async function cellPoint(page, testCase, row) {
    const box = await page.locator("canvas").first().boundingBox();
    return { x: box.x + testCase.x, y: box.y + headerHeight + rowHeight * row + rowHeight / 2 };
}

const savedValue = (page, col, row) => page.locator(`#glide-cell-${col}-${row}`).textContent();

async function readSaved(page, col, row, expected) {
    let value;
    for (let i = 0; i < 20; i++) {
        value = (await savedValue(page, col, row))?.trim();
        if (value === expected) break;
        await page.waitForTimeout(50);
    }
    return value;
}

async function selectCell(page, testCase, row) {
    const point = await cellPoint(page, testCase, row);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__firstEdit.arm());
}

const readGap = async page =>
    await page.evaluate(() => {
        const { keydown, focus } = window.__firstEdit;
        return focus === undefined ? undefined : focus - keydown;
    });

/** Presses one key on the selected cell and returns the time until an editor has focus. */
async function measureGap(page, testCase, row) {
    await selectCell(page, testCase, row);
    await page.keyboard.press(testCase.word[0]);
    for (let i = 0; i < 40; i++) {
        const gap = await readGap(page);
        if (gap !== undefined) {
            await page.keyboard.press("Escape");
            return gap;
        }
        await page.waitForTimeout(50);
    }
    return undefined;
}

/** Types the word at `delay` ms per key and presses Enter; returns the gap and the saved value. */
async function typeToEdit(page, testCase, row, delay) {
    await selectCell(page, testCase, row);
    await page.keyboard.type(testCase.word, { delay });
    await page.waitForTimeout(delay);
    await page.keyboard.press("Enter");
    const gap = await readGap(page);
    return { gap, saved: await readSaved(page, testCase.col, row, testCase.word) };
}

async function openPage(browser, url, errors) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 700 } });
    await context.addInitScript(installProbe);
    const page = await context.newPage();
    page.on("console", msg => {
        if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", err => errors.push(String(err)));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("canvas").first().waitFor({ timeout: 30_000 });
    return { context, page };
}

async function waitForEditor(page) {
    const editor = page.locator("input, textarea").first();
    await editor.waitFor({ state: "visible", timeout: 5000 });
}

/** Opens the Text cell by double-click and the Number cell by Enter, then closes both with Escape. */
async function openByMouseAndEnter(browser, url, errors) {
    const failures = [];
    const { context, page } = await openPage(browser, url, errors);
    const text = await cellPoint(page, cases[0], 3);
    await page.mouse.dblclick(text.x, text.y);
    try {
        await waitForEditor(page);
        await page.keyboard.press("Escape");
    } catch {
        failures.push("double-click did not open the Text editor");
    }
    await selectCell(page, cases[1], 3);
    await page.keyboard.press("Enter");
    try {
        await waitForEditor(page);
        await page.keyboard.press("Escape");
    } catch {
        failures.push("Enter did not open the Number editor");
    }
    await context.close();
    return failures;
}

const fmt = ms => (ms === undefined ? "none" : `${Math.round(ms)}`);

/**
 * One trial is two fresh pages. On the first, one key press on row 0 measures the gap
 * (typing more keys would let a later key's render reveal the editor early). On the
 * second, the word is typed into row 0 and then into row 2 (Enter moves the selection to
 * row 1, and clicking a selected cell opens its editor).
 */
async function trial(browser, url, errors, testCase, delay) {
    const gapPage = await openPage(browser, url, errors);
    const gap = await measureGap(gapPage.page, testCase, 0);
    await gapPage.context.close();

    const typingPage = await openPage(browser, url, errors);
    const first = await typeToEdit(typingPage.page, testCase, 0, delay);
    const second = await typeToEdit(typingPage.page, testCase, 2, delay);
    await typingPage.context.close();
    return { gap, first, second };
}

async function run(name, url, options) {
    const browser = await engines[name].launch();
    const failures = [];
    const errors = [];
    console.log(`\n=== ${name} ${browser.version()}, ${options.trials} trials, ${options.delay} ms per key ===`);
    console.log("| Cell | Trial | First-edit gap (ms) | First edit saved | Second-edit gap (ms) | Second edit saved |");
    console.log("|---|---|---|---|---|---|");
    const summary = [];
    for (const testCase of cases) {
        const gaps = [];
        for (let n = 1; n <= options.trials; n++) {
            const { gap, first, second } = await trial(browser, url, errors, testCase, options.delay);
            gaps.push(gap);
            console.log(
                `| ${testCase.kind} | ${n} | ${fmt(gap)} | ${JSON.stringify(first.saved)} | ` +
                    `${fmt(second.gap)} | ${JSON.stringify(second.saved)} |`
            );
            const at = `${testCase.kind} trial ${n}`;
            if (gap === undefined) failures.push(`${at}: the first key never focused an editor`);
            else if (gap > options.maxGap) failures.push(`${at}: first-edit gap ${fmt(gap)} ms > ${options.maxGap} ms`);
            if (first.saved !== testCase.word) failures.push(`${at}: first edit saved ${JSON.stringify(first.saved)}`);
            if (second.saved !== testCase.word) {
                failures.push(`${at}: second edit saved ${JSON.stringify(second.saved)}`);
            }
            if (second.gap === undefined) failures.push(`${at}: the second edit never focused an editor`);
        }
        summary.push(`${name} ${testCase.kind} first-edit gaps (ms): ${gaps.map(fmt).join(", ")}`);
    }
    failures.push(...(await openByMouseAndEnter(browser, url, errors)));
    failures.push(...errors.map(e => `page error: ${e}`));
    await browser.close();
    for (const line of summary) console.log(line);
    return failures;
}

const options = parseArgs(process.argv.slice(2));
let server;
let url = options.target;
if (!/^https?:\/\//.test(url)) {
    const dir = resolve(options.target);
    if (!existsSync(join(dir, "index.html"))) {
        usage(`${dir} has no index.html: run \`npm run build && npm run test-projects\` first`);
    }
    server = await serve(dir);
    url = `http://127.0.0.1:${server.address().port}/`;
}
console.log(`first-edit check against ${url}`);

const browsers = options.browser === "all" ? Object.keys(engines) : [options.browser];
const failures = [];
try {
    for (const name of browsers) {
        failures.push(...(await run(name, url, options)).map(f => `${name}: ${f}`));
    }
} finally {
    server?.close();
}

if (failures.length > 0) {
    console.error(`\nFAILED (${failures.length})`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
}
console.log("\nPASSED");
