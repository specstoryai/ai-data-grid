// Article cell editor acceptance check (SPST-4 plan step 5, extended in SPST-48 and for the
// Milkdown editor in SPST-61): open the custom-cells story in headless Chromium, open the
// article cell editor, type, make text bold with the toolbar, save and check the saved
// Markdown, reopen, cancel, and open a read-only article cell in the viewer — asserting no
// console errors throughout.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:9009/iframe.html?id=extra-packages-cells--custom-cells";

// Known allowlisted noise in this story: an image cell with an undefined URL 404s.
const isKnownNoise = t => t.includes("Failed to load resource") && t.includes("404");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const consoleErrors = [];
// The story logs onCellEdited as console.log("Edit Cell", cell, newValue).
const edits = [];
page.on("console", async msg => {
    if (msg.type() === "error" && !isKnownNoise(msg.text())) consoleErrors.push(msg.text());
    if (msg.type() === "log" && msg.text().startsWith("Edit Cell")) {
        edits.push(await msg.args()[2]?.jsonValue());
    }
});
page.on("pageerror", err => consoleErrors.push(String(err)));

await page.goto(url, { waitUntil: "networkidle" });
const canvas = page.locator("canvas").first();
await canvas.waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);

const editor = page.locator("#gdg-markdown-wysiwyg");

async function openArticleCell(row, overlay) {
    // Double-click the article cell directly. In this story the columns before the
    // Article column (col 8) are 100+150+150+150+250+150+150+150 = 1250px wide, the
    // header is 36px and rows are 34px; even rows are read-only, so row 1 is the first
    // editable article row.
    const box = await canvas.boundingBox();
    const x = box.x + 1250 + 75;
    const y = box.y + 36 + 34 * row + 17;
    for (let attempt = 1; attempt <= 3; attempt++) {
        await page.mouse.dblclick(x, y);
        try {
            await overlay.waitFor({ timeout: 4000 });
            return;
        } catch {
            console.log(`open attempt ${attempt} failed, retrying`);
            await page.keyboard.press("Escape");
        }
    }
    throw new Error("Could not open the article cell editor");
}

const openArticleEditor = () => openArticleCell(1, editor);

await openArticleEditor();
console.log("editor opened");

// Edit: type at the end of the article, then type bold text with the toolbar's Bold button.
const editable = editor.locator(".gdg-article-content");
await editable.click();
// Chromium can apply a key press to a stale selection right after a click, so let it settle.
await page.waitForTimeout(150);
await page.keyboard.press("Control+End");
await page.keyboard.press("Enter");
await page.keyboard.type("Edited in React 19 ");
const bold = editor.locator('.gdg-article-toolbar [aria-label="Bold"]');
await bold.click();
await page.keyboard.type("Bold text");
await bold.click();
await page.waitForTimeout(300);

// Save
await editor.locator(".gdg-save-button").click();
await editor.waitFor({ state: "detached", timeout: 10000 });
console.log("save closed the editor");
for (let i = 0; i < 20 && edits.length === 0; i++) await page.waitForTimeout(100);
const savedMarkdown = edits[0]?.data?.markdown;
console.log(`saved markdown: ${JSON.stringify(savedMarkdown)}`);
if (
    typeof savedMarkdown !== "string" ||
    !savedMarkdown.includes("Edited in React 19") ||
    !savedMarkdown.includes("**Bold text**")
) {
    throw new Error("Save did not report the edited Markdown through onCellEdited");
}

// Reopen and cancel
await openArticleEditor();
console.log("editor reopened");
await editor.locator(".gdg-close-button").click();
await editor.waitFor({ state: "detached", timeout: 10000 });
console.log("close (cancel) closed the editor");
if (edits.length !== 1) throw new Error(`expected 1 onCellEdited call, got ${edits.length}`);

// Read-only: row 0 opens the viewer only.
const readonlyViewer = page.locator("#gdg-markdown-readonly");
await openArticleCell(0, readonlyViewer);
const viewerText = await readonlyViewer.locator(".gdg-article-content").innerText();
if (!viewerText.includes("This is a test")) throw new Error(`read-only viewer shows ${JSON.stringify(viewerText)}`);
const editorParts = await readonlyViewer
    .locator('.gdg-article-toolbar, [contenteditable="true"], .gdg-save-button, .gdg-close-button')
    .count();
if (editorParts !== 0) throw new Error("read-only cell rendered editor UI");
console.log("read-only cell opened the viewer only");
await page.keyboard.press("Escape");
await readonlyViewer.waitFor({ state: "detached", timeout: 10000 });

console.log(`console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  CONSOLE ERROR: ${e}`);
await browser.close();

if (consoleErrors.length > 0) {
    console.error("FAILED");
    process.exit(1);
}
console.log("PASSED");
