// Acceptance check for AI Fill in the built vite-app sample (test-projects/vite-app,
// `#ai-fill`): fill → suggest → accept → app edit, through the installed package's
// lazy AI chunk and the `/testing` mock. It makes no request to another origin.
//
// 1. Loads the plain sample (no hash) and records its scripts: AI Fill's code must not load there.
// 2. Loads `#ai-fill` and waits for the canvas and `window.__aiFillSmoke` (set from `aiFill.onReady`).
// 3. Asserts a script loaded there that the plain sample never loads: AI Fill's lazy chunk.
// 4. Runs `api.fill("column-empty", { columns: ["persona"] })` and awaits `run.done`.
// 5. Asserts every row's `getCellState(rowId, "persona")` is `suggested` with the mock's answer.
// 6. Runs `api.accept({ column: "persona", filter: "eligible" })` and asserts the app's rows now
//    hold the answers, written through `onCellEdited`.
// Fails on any console error, page error or request to another origin.
//
// Usage: node scripts/check-ai-fill-consumer.mjs <base-url>
import { chromium } from "playwright";

const [baseUrl] = process.argv.slice(2);
if (baseUrl === undefined) {
    console.error("Usage: node scripts/check-ai-fill-consumer.mjs <base-url>");
    process.exit(2);
}
const origin = new URL(baseUrl).origin;
const failures = [];

const browser = await chromium.launch();
const context = await browser.newContext();

/** Opens a page that records its errors, its scripts and any request to another origin. */
async function open(url) {
    const page = await context.newPage();
    const record = { errors: [], scripts: [], foreign: [] };
    page.on("console", msg => {
        if (msg.type() === "error") record.errors.push(msg.text());
    });
    page.on("pageerror", err => record.errors.push(String(err)));
    page.on("request", req => {
        const u = new URL(req.url());
        if (u.protocol !== "data:" && u.protocol !== "blob:" && u.origin !== origin) record.foreign.push(req.url());
        if (req.resourceType() === "script") record.scripts.push(u.pathname);
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas", { timeout: 30000 });
    return { page, record };
}

// --- 1. The plain sample ------------------------------------------------------
const plain = await open(baseUrl);
await plain.page.waitForTimeout(1000);
const plainScripts = new Set(plain.record.scripts);
await plain.page.close();

// --- 2. The AI Fill scenario --------------------------------------------------
const ai = await open(new URL("#ai-fill", baseUrl).href);
await ai.page.waitForFunction(() => window.__aiFillSmoke !== undefined, undefined, { timeout: 30000 });

// --- 3. The lazy chunk --------------------------------------------------------
const aiOnly = ai.record.scripts.filter(s => !plainScripts.has(s));
console.log(`scripts on the plain sample: ${[...plainScripts].join(", ")}`);
console.log(`scripts only on #ai-fill: ${aiOnly.join(", ") || "(none)"}`);
if (aiOnly.length === 0) failures.push("no separate script loaded for AI Fill: the lazy chunk is missing");

// --- 4 and 5. Fill and suggest ---------------------------------------------------
const filled = await ai.page.evaluate(async () => {
    const { api, getRows, expected } = window.__aiFillSmoke;
    const run = api.fill("column-empty", { columns: ["persona"] });
    if (run.error !== undefined) return { error: `${run.error.kind}: ${run.error.message}` };
    const summary = await run.done;
    const states = getRows().map(r => {
        const s = api.getCellState(r.id, "persona");
        return { rowId: r.id, status: s?.status, value: s?.output?.value, expected: expected[r.id] };
    });
    return { cells: run.cells, requests: run.requests, summary, states };
});
if (filled.error !== undefined) {
    failures.push(`fill could not start: ${filled.error}`);
} else {
    console.log(
        `fill: ${filled.cells} cells, ${filled.requests} requests, counts ${JSON.stringify(filled.summary.counts)}`
    );
    if (filled.cells !== filled.states.length)
        failures.push(`fill covered ${filled.cells} of ${filled.states.length} rows`);
    for (const s of filled.states) {
        console.log(`  ${s.rowId}: ${s.status} "${s.value}"`);
        if (s.status !== "suggested" || s.value !== s.expected) {
            failures.push(`${s.rowId} is ${s.status} "${s.value}", expected suggested "${s.expected}"`);
        }
    }
}

// --- 6. Accept, and the app's edit -------------------------------------------------
const commitId = await ai.page.evaluate(() =>
    window.__aiFillSmoke.api.accept({ column: "persona", filter: "eligible" })
);
console.log(`accept: commit ${commitId}`);
if (typeof commitId !== "string") failures.push("accept wrote nothing");
try {
    await ai.page.waitForFunction(
        () => {
            const { getRows, expected } = window.__aiFillSmoke;
            return getRows().every(r => r.persona === expected[r.id]);
        },
        undefined,
        { timeout: 10000 }
    );
} catch {
    // Reported below with the rows as they are.
}
const after = await ai.page.evaluate(() => {
    const { api, getRows, expected } = window.__aiFillSmoke;
    return getRows().map(r => ({
        rowId: r.id,
        persona: r.persona,
        expected: expected[r.id],
        status: api.getCellState(r.id, "persona")?.status,
    }));
});
for (const r of after) {
    console.log(`  ${r.rowId}: app row "${r.persona}", cell ${r.status}`);
    if (r.persona !== r.expected)
        failures.push(`${r.rowId}: the app's row holds "${r.persona}", expected "${r.expected}"`);
}
await ai.page.close();
await browser.close();

// --- Errors and foreign requests ------------------------------------------------
for (const [name, record] of [
    ["plain", plain.record],
    ["#ai-fill", ai.record],
]) {
    for (const e of record.errors) failures.push(`${name}: console error: ${e}`);
    for (const u of record.foreign) failures.push(`${name}: request to another origin: ${u}`);
}

if (failures.length > 0) {
    for (const f of failures) console.error(`FAIL ${f}`);
    console.error(`FAILED: ${failures.length} problem(s)`);
    process.exit(1);
}
console.log("PASSED");
