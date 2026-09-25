// Article cell editor acceptance check (SPST-4 plan step 5): open the custom-cells
// story in headless Chromium, open the @toast-ui/react-editor based article cell
// editor, type, save, reopen, cancel — asserting no console errors throughout.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:9009/iframe.html?id=extra-packages-cells--custom-cells";

// Known allowlisted noise in this story: an image cell with an undefined URL 404s.
const isKnownNoise = t => t.includes("Failed to load resource") && t.includes("404");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const consoleErrors = [];
page.on("console", msg => {
    if (msg.type() === "error" && !isKnownNoise(msg.text())) consoleErrors.push(msg.text());
});
page.on("pageerror", err => consoleErrors.push(String(err)));

await page.goto(url, { waitUntil: "networkidle" });
const canvas = page.locator("canvas").first();
await canvas.waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);

const editor = page.locator("#gdg-markdown-wysiwyg");

async function openArticleEditor() {
    // Double-click the article cell directly. In this story the columns before the
    // Article column (col 8) are 100+150+150+150+250+150+150+150 = 1250px wide, the
    // header is 36px and rows are 34px; row 1 is the first editable article row.
    const box = await canvas.boundingBox();
    const x = box.x + 1250 + 75;
    const y = box.y + 36 + 34 + 17;
    for (let attempt = 1; attempt <= 3; attempt++) {
        await page.mouse.dblclick(x, y);
        try {
            await editor.waitFor({ timeout: 4000 });
            return;
        } catch {
            console.log(`open attempt ${attempt} failed, retrying`);
            await page.keyboard.press("Escape");
        }
    }
    throw new Error("Could not open the article cell editor");
}

await openArticleEditor();
console.log("editor opened");

// Edit: type into the toast-ui WYSIWYG area
const editable = editor.locator(".ProseMirror:visible").first();
await editable.click();
await page.keyboard.type("Edited in React 19");
await page.waitForTimeout(300);

// Save
await editor.locator(".gdg-save-button").click();
await editor.waitFor({ state: "detached", timeout: 10000 });
console.log("save closed the editor");

// Reopen and cancel
await openArticleEditor();
console.log("editor reopened");
await editor.locator(".gdg-close-button").click();
await editor.waitFor({ state: "detached", timeout: 10000 });
console.log("close (cancel) closed the editor");

console.log(`console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  CONSOLE ERROR: ${e}`);
await browser.close();

if (consoleErrors.length > 0) {
    console.error("FAILED");
    process.exit(1);
}
console.log("PASSED");
