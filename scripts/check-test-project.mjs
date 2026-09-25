// Acceptance check for the test-projects samples: loads a built sample in headless
// Chromium, asserts a canvas renders with no console errors, and asserts that the
// sample's node_modules contains exactly one copy of react.
//
// Usage: node scripts/check-test-project.mjs <base-url> <sample-node_modules-dir>
import { chromium } from "playwright";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [url, modulesDir] = process.argv.slice(2);
if (url === undefined || modulesDir === undefined) {
    console.error("Usage: node scripts/check-test-project.mjs <base-url> <sample-node_modules-dir>");
    process.exit(2);
}

// --- React copy count -------------------------------------------------------
const reactInstalls = [];
function recordReact(pkgDir) {
    const pj = join(pkgDir, "package.json");
    if (!existsSync(pj)) return;
    const manifest = JSON.parse(readFileSync(pj, "utf8"));
    if (manifest.name === "react") reactInstalls.push(`${pkgDir}: ${manifest.version}`);
}
function scanNodeModules(nmDir) {
    let entries;
    try {
        entries = readdirSync(nmDir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const p = join(nmDir, entry.name);
        if (entry.name === "react") {
            recordReact(p);
        } else if (entry.name.startsWith("@")) {
            for (const sub of readdirSync(p)) {
                const sp = join(p, sub);
                if (!statSync(sp).isDirectory()) continue;
                if (sub === "react") recordReact(sp);
                const nested = join(sp, "node_modules");
                if (existsSync(nested)) scanNodeModules(nested);
            }
        } else {
            const nested = join(p, "node_modules");
            if (existsSync(nested)) scanNodeModules(nested);
        }
    }
}
scanNodeModules(modulesDir);

console.log(`react installs found:`);
for (const r of reactInstalls) console.log(`  ${r}`);

// --- Browser check -----------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", err => consoleErrors.push(String(err)));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("canvas", { timeout: 30000 });
await page.waitForTimeout(2000);

const canvasCount = await page.locator("canvas").count();
await browser.close();

console.log(`canvases: ${canvasCount}`);
console.log(`console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  CONSOLE ERROR: ${e}`);

const reactVersions = new Set(reactInstalls.map(r => r.split(": ").pop()));
if (canvasCount === 0 || consoleErrors.length > 0 || reactVersions.size !== 1) {
    console.error(
        `FAILED: canvases=${canvasCount} consoleErrors=${consoleErrors.length} distinctReactVersions=${reactVersions.size}`
    );
    process.exit(1);
}
console.log("PASSED");
