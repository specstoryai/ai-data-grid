#!/usr/bin/env node
/**
 * Smoke test for the built Storybook. Serves `storybook-build/`, visits every
 * story in headless Chromium, and fails on browser console errors that are not
 * on the allowlist below.
 *
 * This script is NOT run in CI (a few stories depend on third-party URLs that
 * are unreliable by nature). Run it locally with:
 *
 *     npm run build-storybook && npm run smoke-storybook
 *
 * Requires the `playwright` root devDependency and its Chromium browser
 * (`npx playwright install chromium`).
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const storybookDir = resolve("storybook-build");

/**
 * Known failures, keyed by story id. A story passes if every console error it
 * produces matches at least one of the substrings listed for it. When a fix
 * lands, remove the entry — a story whose errors no longer occur is reported
 * as FIXED so the allowlist stays current.
 */
const errorAllowlist = {
    // The image-cell demo renders a cell with an undefined URL -> 404 for /undefined.
    "extra-packages-cells--custom-cells": ["Failed to load resource"],
    // These testcase stories hotlink https://i.imgur.com/5J0BftG.jpg; Imgur
    // blocks the hotlink with a 403. The grids still render.
    "tests-testcases--smooth": ["Failed to load resource"],
    "tests-testcases--simplenotest": ["Failed to load resource"],
    "tests-testcases--resizable-columns": ["Failed to load resource"],
    "tests-testcases--grid-add-new-rows": ["Failed to load resource"],
    "tests-testcases--grid-no-trailing-blank-row": ["Failed to load resource"],
    "tests-testcases--grid-selection-out-of-range-no-columns": ["Failed to load resource"],
    "tests-testcases--grid-selection-out-of-range-less-columns-than-selection": ["Failed to load resource"],
};

/** Stories that render no <canvas> on purpose (text-only docs pages). */
const noCanvasAllowlist = new Set(["ai-data-grid-docs--faq"]);

const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
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

const index = JSON.parse(await readFile(join(storybookDir, "index.json"), "utf8"));
const storyIds = Object.entries(index.entries)
    .filter(([, entry]) => entry.type === "story")
    .map(([id]) => id);

const server = await serve(storybookDir);
const { port } = server.address();

const browser = await chromium.launch();
const results = [];
for (const id of storyIds) {
    const page = await browser.newPage();
    const errors = [];
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text().slice(0, 200));
    });
    page.on("pageerror", error => errors.push(`pageerror: ${error.message.slice(0, 200)}`));
    try {
        await page.goto(`http://127.0.0.1:${port}/iframe.html?id=${id}&viewMode=story`, {
            waitUntil: "load",
            timeout: 30_000,
        });
        await page.waitForTimeout(1500);
    } catch (error) {
        errors.push(`nav: ${error.message.slice(0, 120)}`);
    }
    const canvasCount = await page.locator("canvas").count().catch(() => -1);
    results.push({ id, canvasCount, errors: [...new Set(errors)] });
    await page.close();
}
await browser.close();
await new Promise(resolveClose => server.close(resolveClose));

const unexpected = [];
const known = [];
const missingCanvas = [];
for (const { id, canvasCount, errors } of results) {
    const allowed = errorAllowlist[id] ?? [];
    const leftover = errors.filter(error => !allowed.some(substring => error.includes(substring)));
    if (leftover.length > 0) unexpected.push({ id, errors: leftover });
    else if (errors.length > 0) known.push({ id, errors });
    if (canvasCount < 1 && !noCanvasAllowlist.has(id)) missingCanvas.push(id);
}
const fixed = Object.keys(errorAllowlist).filter(id => !known.some(entry => entry.id === id));

console.log(`Visited ${results.length} stories: ${known.length} known failure(s), ${unexpected.length} unexpected failure(s), ${missingCanvas.length} story(ies) without a canvas.`);

for (const { id, errors } of known) console.log(`KNOWN   ${id}: ${errors.join(" || ")}`);
for (const id of fixed) console.log(`FIXED?  ${id}: allowlisted errors no longer occur — consider removing the allowlist entry.`);
for (const id of missingCanvas) console.log(`NOCANVAS ${id}`);
for (const { id, errors } of unexpected) console.log(`FAIL    ${id}: ${errors.join(" || ")}`);

if (unexpected.length > 0 || missingCanvas.length > 0) {
    process.exitCode = 1;
}
