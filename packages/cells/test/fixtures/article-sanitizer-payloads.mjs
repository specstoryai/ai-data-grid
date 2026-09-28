// Synthetic XSS payloads for the ArticleCell sanitizer tests (SPST-48). Shared by
// test/article-cell-sanitizer.test.tsx (Vitest, jsdom) and
// scripts/check-article-cell-sanitizer.mjs (Chromium). Every payload sets
// `window.__xss = "<id>"` if it ever runs. Cells' npm package ships only `dist/`, so these
// fixtures never ship.
//
// Cases marked "upstream" are adapted from DOMPurify's own regression suite
// (test/fixtures/expect.mjs and test/test-suite.js), with alert() replaced by the sentinel.

const x = id => `window.__xss='${id}'`;

/** Article Markdown rendered by the Viewer (read-only) and by the editor's initial load. */
export const renderPayloads = [
    { id: "R01", name: "img onerror", markdown: `<img src=x onerror="${x("R01")}">` },
    { id: "R02", name: "svg onload", markdown: `<svg onload="${x("R02")}"></svg>` },
    { id: "R03", name: "svg script", markdown: `<svg><script>${x("R03")}</script></svg>` },
    { id: "R04", name: "script element", markdown: `<script>${x("R04")}</script>` },
    { id: "R05", name: "iframe javascript: src", markdown: `<iframe src="javascript:${x("R05")}"></iframe>` },
    { id: "R06", name: "iframe srcdoc", markdown: `<iframe srcdoc="<script>parent.__xss='R06'</script>"></iframe>` },
    {
        id: "R07",
        name: "object and embed javascript:",
        markdown: `<object data="javascript:${x("R07")}"></object><embed src="javascript:${x("R07")}">`,
    },
    {
        id: "R08",
        name: "form action and button formaction",
        markdown: `<form action="javascript:${x("R08")}"><button formaction="javascript:${x("R08")}">go</button></form>`,
    },
    { id: "R09", name: "style element", markdown: `<style>@import "javascript:${x("R09")}";</style>` },
    { id: "R10", name: "HTML link javascript:", markdown: `<a href="javascript:${x("R10")}">h</a>` },
    { id: "R11", name: "Markdown link javascript:", markdown: `[x](javascript:${x("R11")})` },
    {
        id: "R12",
        name: "Markdown link data:text/html",
        // base64 of <script>window.__xss='R12'</script>
        markdown: "[x](data:text/html;base64,PHNjcmlwdD53aW5kb3cuX194c3M9J1IxMic8L3NjcmlwdD4=)",
    },
    { id: "R13", name: "Markdown image javascript:", markdown: `![i](javascript:${x("R13")})` },
    {
        id: "R14",
        name: "scheme obfuscation",
        markdown: `[a](JaVaScRiPt:${x("R14")}) [b](&#106;avascript:${x("R14")})`,
    },
    {
        id: "R15",
        name: "upstream nesting-based mXSS 1/5",
        markdown: `<form><math><mtext></form><form><mglyph><style><img src=x onerror="${x("R15")}">`,
    },
    {
        id: "R16",
        name: "upstream nesting-based mXSS 2/5",
        markdown: `<math><mtext><table><mglyph><style><math href=javascript:${x("R16")}>CLICKME</math>`,
    },
    {
        id: "R17",
        name: "GHSA-gx9m depth case (DOMPurify 0ef5e537)",
        markdown: `<div><template>${"<r>".repeat(497)}<img src=x onerror="${x("R17")}">${"</r>".repeat(
            497
        )}</template></div>`,
    },
    {
        id: "R18",
        name: "upstream fake-element namespace confusion 1/2",
        markdown: `a<svg><xss><desc><noscript>&lt;/noscript>&lt;/desc>&lt;s>&lt/s>&lt;style>&lt;a title="&lt;/style>&lt;img src onerror=${x(
            "R18"
        )}>">`,
    },
];

/**
 * HTML put on the clipboard (or a drop's DataTransfer) and pasted into the WYSIWYG editor.
 * Each payload starts with a benign `<p>paste-Pxx</p>` marker, so a test can tell that the
 * paste was applied even when the sanitizer removes everything else.
 */
const pasted = (id, html) => `<p>paste-${id}</p>${html}`;
export const pastePayloads = [
    {
        id: "P01",
        name: "data-raw-html=script on strong (T1)",
        html: pasted("P01", `<p>a <strong data-raw-html="script">${x("P01")}</strong> b</p>`),
    },
    {
        id: "P02",
        name: "data-raw-html=script on code (T1)",
        html: pasted("P02", `<p><code data-raw-html="script">${x("P02")}</code></p>`),
    },
    {
        id: "P03",
        name: "data-raw-html=script on https link (T1)",
        html: pasted("P03", `<p><a href="https://example.com/" data-raw-html="script">${x("P03")}</a></p>`),
    },
    { id: "P04", name: "data-raw-html=iframe (T1)", html: pasted("P04", `<p><em data-raw-html="iframe">z</em></p>`) },
    {
        id: "P05",
        name: "Office list with img onerror (T2)",
        html: pasted(
            "P05",
            `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">item</p><img src=x onerror="${x("P05")}">`
        ),
    },
    { id: "P06", name: "img onerror", html: pasted("P06", `<p><img src="x" onerror="${x("P06")}"></p>`) },
    { id: "P07", name: "link javascript:", html: pasted("P07", `<p><a href="javascript:${x("P07")}">l</a></p>`) },
    {
        id: "P08",
        name: "upstream nesting-based mXSS 1/5",
        html: pasted("P08", `<form><math><mtext></form><form><mglyph><style><img src=x onerror="${x("P08")}">`),
    },
    { id: "P09", name: "svg onload", html: pasted("P09", `<p>x<svg onload="${x("P09")}"></svg></p>`) },
    {
        // Toast UI's dropImage plugin tells ProseMirror every drop is handled, so the browser's
        // native contenteditable drop inserts the markup and ProseMirror parses the DOM change.
        id: "P10",
        name: "data-raw-html=script on strong, dropped (T1)",
        html: pasted("P10", `<p>a <strong data-raw-html="script">${x("P10")}</strong> b</p>`),
        drop: true,
    },
];

/** Every supported formatting feature, for the safe-content cases (S01, S02). */
export const safeMarkdown = [
    "# Heading 1",
    "",
    "## Heading 2",
    "",
    "### Heading 3",
    "",
    "Some **bold**, *italic*, ~~strike~~ and `inline code` with a [link](https://example.com/page).",
    "",
    "* bullet one",
    "* bullet two",
    "",
    "1. first",
    "2. second",
    "",
    "* [ ] open task",
    "* [x] done task",
    "",
    "| Name | Value |",
    "| --- | --- |",
    "| a | 1 |",
    "",
    "> a quote",
    "",
    "```",
    "const code = 1;",
    "```",
    "",
    "***",
    "",
    "last line",
].join("\n");

/** The elements S01/S02 expect to find in the rendered safe Markdown. */
export const safeSelectors = [
    "h1",
    "h2",
    "h3",
    "strong",
    "em",
    "del",
    "code",
    "ul",
    "ol",
    "li",
    "table",
    "th",
    "td",
    "blockquote",
    "pre",
    "hr",
    'a[href="https://example.com/page"]',
];

/** Safe URLs that must survive in both the Viewer and the editor (S03). */
export const safeURLMarkdown = [
    "[https](https://example.com/a) [http](http://example.com/b) [mail](mailto:someone@example.com)",
    "[relative](docs/page.html) [anchor](#section)",
    "",
    "![remote](https://example.com/image.png)",
    "",
    "![inline](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)",
].join("\n");

export const safeURLs = {
    links: [
        "https://example.com/a",
        "http://example.com/b",
        "mailto:someone@example.com",
        "docs/page.html",
        "#section",
    ],
    images: [
        "https://example.com/image.png",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    ],
};

/** Clipboard HTML for a normal paste (S09): bold, an https link, a list and a table. */
export const normalPasteHTML =
    '<p data-pm-slice="1 1 []">pasted <strong>bold</strong> and <a href="https://example.com/pasted">a link</a></p>' +
    "<ul><li><p>pasted item</p></li></ul>" +
    "<table><thead><tr><th><p>H</p></th></tr></thead><tbody><tr><td><p>V</p></td></tr></tbody></table>";

/** A benign Office list paste (S10). */
export const officeListPasteHTML =
    "<html><body><!--StartFragment-->" +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.<span> </span></span>office one</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.<span> </span></span>office two</p>' +
    "<!--EndFragment--></body></html>";

const DANGEROUS_ELEMENTS = "script, iframe, frame, object, embed, form, input, button, style, link, meta, base";
const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "xlink:href"];

/**
 * The rendered article content inside an editor or viewer container: the Viewer's and the
 * hidden Markdown preview's `.toastui-editor-contents`, and the WYSIWYG ProseMirror element
 * (which has the same class). The editor's own toolbar and dialogs are outside these roots.
 */
export function contentRoots(container) {
    return Array.from(container.querySelectorAll(".toastui-editor-contents"));
}

/**
 * The "dangerous DOM" predicate. Returns a description of every dangerous element or
 * attribute under `container`'s content roots: the elements above, any on* or srcdoc
 * attribute, javascript:/vbscript: URLs, and data: URLs anywhere except img[src].
 * Empty <svg>/<math> elements and inline style attributes are allowed, as DOMPurify's
 * defaults allow them.
 */
export function findDangerousDOM(container) {
    const found = [];
    for (const root of contentRoots(container)) {
        for (const el of root.querySelectorAll(DANGEROUS_ELEMENTS)) found.push(`<${el.localName}>`);
        for (const el of root.querySelectorAll("*")) {
            for (const attr of Array.from(el.attributes)) {
                const name = attr.name.toLowerCase();
                if (name.startsWith("on") || name === "srcdoc") {
                    found.push(`${el.localName}[${name}]`);
                    continue;
                }
                if (!URL_ATTRIBUTES.includes(name)) continue;
                // eslint-disable-next-line no-control-regex
                const value = attr.value.replace(/[\u0000- \u007f-\u009f]/g, "").toLowerCase();
                if (value.startsWith("javascript:") || value.startsWith("vbscript:")) {
                    found.push(`${el.localName}[${name}=${value.slice(0, 16)}]`);
                } else if (value.startsWith("data:") && !(el.localName === "img" && name === "src")) {
                    found.push(`${el.localName}[${name}=${value.slice(0, 16)}]`);
                }
            }
        }
    }
    return found;
}
