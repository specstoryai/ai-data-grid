// ArticleCell security and editor integration tests (SPST-48, rewritten for the Milkdown
// editor in SPST-61). They run the real Milkdown editor and the real external DOMPurify through
// ArticleCell's public provideEditor API. jsdom doesn't execute scripts or event handlers, so
// the evidence here is the rendered DOM, the saved Markdown and a spy on every live-document
// HTML sink; scripts/check-article-cell-sanitizer.mjs runs the same fixtures in Chromium,
// Firefox and WebKit, where execution is observable.
//
// Groups: R (untrusted Markdown), P (paste), D (drop), C (paste into a code block, P6),
// S (safe content and editor behavior), I (the sanitizer instance).
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@milkdown/prose/view";
import DOMPurify from "dompurify";
import { GridCellKind } from "@specstory/ai-data-grid";
import { articlePurify, safeArticleURL, sanitizePastedHTML } from "../src/cells/article-editor/url-policy.js";
import {
    CONTENT,
    drop,
    installLayoutShims,
    lastText,
    mount,
    paste,
    pngFile,
    setPointTarget,
    spyOnHTMLSinks,
    UNSAFE_SAVED,
    versionAtLeast,
} from "./article-cell-harness.js";
import {
    contentRoots,
    findDangerousDOM,
    htmlOnlyCodePayload,
    normalPasteHTML,
    officeListPasteHTML,
    pastePayloads,
    renderPayloads,
    safeMarkdown,
    safeSelectors,
    safeURLMarkdown,
    safeURLs,
} from "./fixtures/article-sanitizer-payloads.mjs";

// A pass-through wrapper around the real DOMPurify: it records every instance created from the
// module (the article editor's private instance is created when url-policy.ts loads) and
// forwards every call and property unchanged.
const created = vi.hoisted(() => [] as any[]);
vi.mock("dompurify", async importOriginal => {
    const actual = await importOriginal<{ default: any }>();
    const factory = new Proxy(actual.default, {
        apply(target, thisArg, args) {
            const instance = Reflect.apply(target, thisArg, args);
            created.push(instance);
            return instance;
        },
    });
    return { ...actual, default: factory };
});

let sinks: ReturnType<typeof spyOnHTMLSinks>;

beforeAll(() => {
    installLayoutShims();
});

afterEach(() => {
    cleanup();
    setPointTarget(() => null);
    delete (window as any).__xss;
});

// Every test that loads untrusted content runs with the L03 sink spy.
async function withSinkSpy<T>(run: () => Promise<T>): Promise<T> {
    sinks = spyOnHTMLSinks();
    try {
        const result = await run();
        expect(sinks.writes()).toEqual([]);
        return result;
    } finally {
        sinks.restore();
    }
}

const withContext = (markdown: string) => `before\n\n${markdown}\n\nafter`;
const nonDropPayloads = pastePayloads.filter(p => p.drop !== true);
const CODE_DOC = "```\ncode\n```\n\nafter";

// The document as a structure, without the text inside code blocks.
function structure(root: HTMLElement): string {
    const clone = root.cloneNode(true) as HTMLElement;
    for (const code of clone.querySelectorAll("pre code")) code.textContent = "";
    return clone.innerHTML;
}

describe("R: rendering untrusted Markdown", () => {
    it.each(renderPayloads.map(p => [p.id, p.name, p.markdown]))("%s viewer: %s", async (_id, _name, markdown) => {
        await withSinkSpy(async () => {
            const { container } = await mount(withContext(markdown), { readonly: true });
            expect(contentRoots(container)).toHaveLength(1);
            expect(container.textContent).toContain("before");
            expect(findDangerousDOM(container)).toEqual([]);
            expect((window as any).__xss).toBeUndefined();
        });
    });

    it.each(renderPayloads.map(p => [p.id, p.name, p.markdown]))("%s editor: %s", async (_id, _name, markdown) => {
        await withSinkSpy(async () => {
            const editor = await mount(withContext(markdown));
            expect(contentRoots(editor.container)).toHaveLength(1);
            expect(editor.content().textContent).toContain("after");
            expect(findDangerousDOM(editor.container)).toEqual([]);
            expect((window as any).__xss).toBeUndefined();
            // An unchanged Save still returns the stored Markdown (stored URLs aren't rewritten).
            expect(await editor.save()).toBe(withContext(markdown));
        });
    });
});

describe("P: paste into the editor", () => {
    it.each(pastePayloads.map(p => [p.id, p.name, p.html, p.drop === true]))(
        "%s: %s",
        async (id, _name, html, isDrop) => {
            const editor = await mount("start");
            await withSinkSpy(async () => {
                if (isDrop) {
                    setPointTarget(() => editor.content().querySelector("p"));
                    const event = await drop(editor.content(), { html, text: `paste-${id}` });
                    expect(event.defaultPrevented).toBe(true);
                } else {
                    const event = await paste(editor.content(), { html, text: `paste-${id}` });
                    expect(event.defaultPrevented).toBe(true);
                }
            });
            // The paste was applied (it isn't silently dropped)...
            expect(editor.content().textContent).toContain(`paste-${id}`);
            // ...and left nothing dangerous in the document or the saved Markdown.
            expect(findDangerousDOM(editor.container)).toEqual([]);
            expect(editor.content().querySelector('span[data-type="html"]')).toBeNull();
            const saved = await editor.save();
            expect(saved).not.toMatch(UNSAFE_SAVED);
            if (id === "P11") expect(saved).not.toMatch(/<img/i);
            // D2's code-block rule drops a pasted language that isn't a language name.
            if (id === "P13") expect(saved).toContain("\n```\ncode-P13");
            expect((window as any).__xss).toBeUndefined();
        }
    );
});

describe("D: drops onto the editor", () => {
    it.each(nonDropPayloads.map(p => [p.id, p.name, p.html]))("D01 %s dropped: %s", async (id, _name, html) => {
        const editor = await mount("start");
        setPointTarget(() => editor.content().querySelector("p"));
        const sanitize = vi.spyOn(articlePurify, "sanitize");
        try {
            await withSinkSpy(async () => {
                const event = await drop(editor.content(), { html, text: "dropped" });
                expect(event.defaultPrevented).toBe(true);
            });
            // ProseMirror parsed the drop through transformPastedHTML, so D3 sanitized it.
            expect(sanitize).toHaveBeenCalled();
        } finally {
            sanitize.mockRestore();
        }
        expect(editor.content().textContent).toContain(`paste-${id}`);
        expect(findDangerousDOM(editor.container)).toEqual([]);
        expect(await editor.save()).not.toMatch(UNSAFE_SAVED);
        expect((window as any).__xss).toBeUndefined();
    });

    it("D13 an image file drop inserts a data:image/png image", async () => {
        const editor = await mount("start");
        setPointTarget(() => editor.content().querySelector("p"));
        const event = await drop(editor.content(), { files: [pngFile()] });
        expect(event.defaultPrevented).toBe(true);
        await waitFor(() =>
            expect(editor.content().querySelector('img[src^="data:image/png;base64,"]')).not.toBeNull()
        );
        expect(await editor.save()).toMatch(/!\[dot\.png\]\(data:image\/png;base64,/);
    });

    it("D14 a text/plain drop is applied", async () => {
        const editor = await mount("start");
        setPointTarget(() => editor.content().querySelector("p"));
        const event = await drop(editor.content(), { text: "plain dropped text" });
        expect(event.defaultPrevented).toBe(true);
        expect(editor.content().textContent).toContain("plain dropped text");
    });

    it("D15 a drop onto a code block inserts its text only", async () => {
        const editor = await mount(CODE_DOC);
        const before = structure(editor.content());
        setPointTarget(() => editor.content().querySelector("pre code"));
        const html = pastePayloads.find(p => p.id === "P06")!.html;
        const event = await drop(editor.content().querySelector("pre code")!, { html, text: "dropped" });
        expect(event.defaultPrevented).toBe(true);
        expect(editor.content().querySelector("pre code")?.textContent).toMatch(/^(dropped)?code(dropped)?$/);
        expect(editor.content().querySelector("pre code")?.textContent).toContain("dropped");
        expect(structure(editor.content())).toBe(before);
    });

    it("D16 a drop that ProseMirror doesn't place is prevented by the backstop (D5) and changes nothing", async () => {
        const editor = await mount("start");
        const before = editor.content().innerHTML;
        // Nothing of the editor at the drop point: ProseMirror returns without handling the drop.
        setPointTarget(() => null);
        const event = await drop(
            editor.content().querySelector("p")!,
            { html: pastePayloads.find(p => p.id === "P06")!.html, text: "dropped" },
            { far: true }
        );
        expect(event.defaultPrevented).toBe(true);
        expect(editor.content().innerHTML).toBe(before);
        expect(await editor.save()).toBe("start");
    });

    it("D17 an HTML-only drop onto a code block adds no node, mark or raw HTML (A1)", async () => {
        const editor = await mount(CODE_DOC);
        const before = editor.content().innerHTML;
        setPointTarget(() => editor.content().querySelector("pre code"));
        const event = await drop(editor.content().querySelector("pre code")!, { html: htmlOnlyCodePayload.html });
        expect(event.defaultPrevented).toBe(true);
        expect(editor.content().innerHTML).toBe(before);
        expect(await editor.save()).toBe(CODE_DOC);
    });
});

describe("C: paste into a code block (P6)", () => {
    // A document that starts with a code block has its initial selection inside it.
    it.each(nonDropPayloads.map(p => [p.id, p.name, p.html]))(
        "C01 %s pasted into a code block: %s",
        async (id, _name, html) => {
            const editor = await mount(CODE_DOC);
            const before = structure(editor.content());
            await withSinkSpy(async () => {
                const event = await paste(editor.content(), { html, text: `plain-${id}\r\nline` });
                expect(event.defaultPrevented).toBe(true);
            });
            // The code block gained exactly the clipboard's plain text, and nothing else changed.
            expect(editor.content().querySelector("pre code")?.textContent).toBe(`plain-${id}\nlinecode`);
            expect(structure(editor.content())).toBe(before);
            expect(findDangerousDOM(editor.container)).toEqual([]);
            expect(await editor.save()).toBe(`\`\`\`\nplain-${id}\nlinecode\n\`\`\`\n\nafter\n`);
            expect((window as any).__xss).toBeUndefined();
        }
    );

    it("C13 a paste with no text/html or text/plain is prevented and inserts nothing", async () => {
        const editor = await mount("start");
        const before = editor.content().innerHTML;
        const file = new File(["x"], "notes.bin", { type: "application/octet-stream" });
        const withFile = await paste(editor.content(), { files: [file] });
        expect(withFile.defaultPrevented).toBe(true);
        const unknown = await paste(editor.content(), { types: ["application/x-unknown"] });
        expect(unknown.defaultPrevented).toBe(true);
        expect(editor.content().innerHTML).toBe(before);
        expect(await editor.save()).toBe("start");
    });

    it("C14 a paste ProseMirror leaves unhandled is prevented by the backstop (D5)", async () => {
        const editor = await mount("start");
        const before = editor.content().innerHTML;
        const html = pastePayloads.find(p => p.id === "P06")!.html;
        // On the editor's frame, outside the ProseMirror element.
        const frame = editor.container.querySelector(".milkdown") as HTMLElement;
        const outside = await paste(frame, { html, text: "x" });
        expect(outside.defaultPrevented).toBe(true);
        // During composition, ProseMirror leaves a paste to the browser.
        await act(async () => {
            editor.content().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        });
        const composing = await paste(editor.content(), { html, text: "x" });
        expect(composing.defaultPrevented).toBe(true);
        await act(async () => {
            editor.content().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
        });
        expect(editor.content().innerHTML).toBe(before);
    });

    it("C15 an HTML-only paste into a code block adds no node, mark or raw HTML (A1)", async () => {
        const editor = await mount(CODE_DOC);
        const before = editor.content().innerHTML;
        await withSinkSpy(async () => {
            const event = await paste(editor.content(), { html: htmlOnlyCodePayload.html });
            expect(event.defaultPrevented).toBe(true);
        });
        expect(editor.content().innerHTML).toBe(before);
        expect(findDangerousDOM(editor.container)).toEqual([]);
        expect(await editor.save()).toBe(CODE_DOC);
    });
});

interface ToolbarCase {
    readonly feature: string;
    readonly markdown: string;
    /** "all" selects the document; a selector puts the caret at the end of that element's text. */
    readonly select?: "all" | string;
    readonly clicks: readonly string[];
    readonly saved: string;
}

const toolbarCases: readonly ToolbarCase[] = [
    { feature: "heading", markdown: "text", clicks: ["Headings", "Heading 2"], saved: "## text\n" },
    { feature: "bold", markdown: "text", select: "all", clicks: ["Bold"], saved: "**text**\n" },
    { feature: "italic", markdown: "text", select: "all", clicks: ["Italic"], saved: "*text*\n" },
    { feature: "strike", markdown: "text", select: "all", clicks: ["Strike"], saved: "~~text~~\n" },
    { feature: "horizontal rule", markdown: "one\n\ntwo", clicks: ["Line"], saved: "one\n\n***\n\ntwo\n" },
    { feature: "quote", markdown: "text", clicks: ["Blockquote"], saved: "> text\n" },
    { feature: "bullet list", markdown: "text", clicks: ["Unordered list"], saved: "* text\n" },
    { feature: "ordered list", markdown: "text", clicks: ["Ordered list"], saved: "1. text\n" },
    { feature: "task list", markdown: "text", clicks: ["Task"], saved: "* [ ] text\n" },
    { feature: "indent", markdown: "* a\n* b", select: "li:nth-child(2) p", clicks: ["Indent"], saved: "* a\n  * b\n" },
    { feature: "outdent", markdown: "* a\n  * b", select: "li li p", clicks: ["Outdent"], saved: "* a\n* b\n" },
    {
        feature: "table",
        markdown: "text",
        clicks: ["Insert table", "Add row", "Add column"],
        // The table goes before the caret's paragraph: a header row and three rows (one added),
        // four columns (one added).
        saved: "|    |    |    |    |\n| :- | :- | :- | :- |\n|    |    |    |    |\n|    |    |    |    |\n|    |    |    |    |\n\ntext\n",
    },
    {
        feature: "link",
        markdown: "text",
        select: "all",
        clicks: ["Insert link", "__url:https://example.com/x", "__apply"],
        saved: "[text](https://example.com/x)\n",
    },
    { feature: "inline code", markdown: "text", select: "all", clicks: ["Code"], saved: "`text`\n" },
    { feature: "code block", markdown: "text", clicks: ["Code block"], saved: "```\ntext\n```\n" },
];

describe("S: safe content and editor behavior", () => {
    it("S01 the viewer renders every supported formatting feature", async () => {
        const { container } = await mount(safeMarkdown, { readonly: true });
        const root = contentRoots(container)[0];
        for (const selector of safeSelectors) expect(root.querySelector(selector), selector).not.toBeNull();
        expect(root.querySelectorAll('li[data-item-type="task"]')).toHaveLength(2);
        expect(root.querySelector('li[data-item-type="task"][data-checked="true"]')?.textContent).toContain(
            "done task"
        );
        expect(findDangerousDOM(container)).toEqual([]);
    });

    it("S02 the editor renders every supported formatting feature", async () => {
        const editor = await mount(safeMarkdown);
        const root = editor.content();
        for (const selector of safeSelectors) expect(root.querySelector(selector), selector).not.toBeNull();
        expect(root.querySelectorAll('li[data-item-type="task"]')).toHaveLength(2);
        expect(findDangerousDOM(editor.container)).toEqual([]);
    });

    it("S03 safe link and image URLs survive in the viewer and the editor", async () => {
        const check = (root: Element) => {
            for (const href of safeURLs.links) expect(root.querySelector(`a[href="${href}"]`), href).not.toBeNull();
            for (const src of safeURLs.images) expect(root.querySelector(`img[src="${src}"]`), src).not.toBeNull();
        };
        const viewer = await mount(safeURLMarkdown, { readonly: true });
        check(contentRoots(viewer.container)[0]);
        cleanup();
        const editor = await mount(safeURLMarkdown);
        check(editor.content());
    });

    it("S04 Save with no change returns the original Markdown byte for byte", async () => {
        const original = `${safeMarkdown}\n\n*  odd   spacing*\n\n\n- dash\n+ plus\n`;
        const editor = await mount(original);
        expect(await editor.save()).toBe(original);
        expect(editor.onFinishedEditing).toHaveBeenCalledTimes(1);
    });

    it("S05 Save after a change returns the edited GFM, not the editor type", async () => {
        const editor = await mount("hello **bold** world");
        await paste(editor.content(), { text: "EDITED " });
        const saved = await editor.save();
        expect(saved).not.toBe("wysiwyg");
        expect(saved).toBe("EDITED hello **bold** world\n");
        const call = editor.onFinishedEditing.mock.calls[0][0];
        expect(call.kind).toBe(GridCellKind.Custom);
        expect(call.data.kind).toBe("article-cell");
    });

    it("S06 Close calls onFinishedEditing(undefined)", async () => {
        const editor = await mount("hello");
        await editor.close();
        expect(editor.onFinishedEditing).toHaveBeenCalledTimes(1);
        expect(editor.onFinishedEditing.mock.calls[0][0]).toBeUndefined();
    });

    it("S07 a read-only cell has no toolbar and no footer and isn't editable", async () => {
        const { container } = await mount("This is **read only**", { readonly: true });
        expect(container.querySelector("#gdg-markdown-readonly")).not.toBeNull();
        expect(container.querySelector("#gdg-markdown-wysiwyg")).toBeNull();
        expect(container.querySelector(".gdg-article-toolbar, .gdg-footer, .gdg-save-button")).toBeNull();
        expect(container.querySelector(CONTENT)?.getAttribute("contenteditable")).toBe("false");
        expect(container.querySelector('[contenteditable="true"]')).toBeNull();
        expect(contentRoots(container)[0].querySelector("strong")?.textContent).toBe("read only");
    });

    it("S08 StrictMode leaves one editor, unmount destroys it, and reopening shows the initial value", async () => {
        const destroy = vi.spyOn(EditorView.prototype, "destroy");
        try {
            // StrictMode mounts, unmounts and remounts effects: exactly one editor remains.
            const first = await mount("initial text", { strict: true });
            await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
            expect(first.container.querySelectorAll(CONTENT)).toHaveLength(1);
            await paste(first.content(), { text: "unsaved " });
            expect(first.content().textContent).toContain("unsaved");
            first.unmount();
            // Milkdown's destroy is async.
            await waitFor(() => expect(destroy).toHaveBeenCalledTimes(2));
            expect(document.querySelector(CONTENT)).toBeNull();
            const second = await mount("initial text");
            expect(second.content().textContent).toBe("initial text");
        } finally {
            destroy.mockRestore();
        }
    });

    it("S09 a normal paste keeps bold, links, lists and tables", async () => {
        const editor = await mount("start");
        await paste(editor.content(), { html: normalPasteHTML, text: "pasted" });
        const root = editor.content();
        expect(root.querySelector("strong")?.textContent).toBe("bold");
        expect(root.querySelector('a[href="https://example.com/pasted"]')?.textContent).toBe("a link");
        expect(root.querySelector("ul li")?.textContent).toContain("pasted item");
        expect(root.querySelector("table th")?.textContent).toBe("H");
        const saved = await editor.save();
        expect(saved).toContain("**bold**");
        expect(saved).toContain("[a link](https://example.com/pasted)");
        expect(saved).toMatch(/\* pasted item/);
        expect(saved).toMatch(/\| H +\|/);
    });

    it("S10 a benign Office list paste keeps its text", async () => {
        const editor = await mount("start");
        await paste(editor.content(), { html: officeListPasteHTML, text: "office one\noffice two" });
        expect(editor.content().textContent).toContain("office one");
        expect(editor.content().textContent).toContain("office two");
        expect(await editor.save()).toMatch(/office one[\s\S]*office two/);
    });

    it.each(toolbarCases.map(c => [c.feature, c]))("S11 toolbar: %s", async (_feature, c) => {
        const editor = await mount(c.markdown);
        if (c.select === "all") await editor.selectAll();
        else if (c.select !== undefined) await editor.placeCaret(lastText(editor.content(), c.select), 1);
        for (const click of c.clicks) {
            if (click.startsWith("__url:")) {
                const input = editor.container.querySelector(".gdg-article-link-url") as HTMLInputElement;
                fireEvent.change(input, { target: { value: click.slice("__url:".length) } });
            } else if (click === "__apply") {
                await editor.click(".gdg-article-link-apply");
            } else {
                await editor.tool(click);
            }
        }
        expect(await editor.save()).toBe(c.saved);
    });

    it("S12 the link dialog rejects javascript: and data: URLs, accepts https:, and accepts a paste", async () => {
        const editor = await mount("text");
        await editor.selectAll();
        await editor.tool("Insert link");
        const input = () => editor.container.querySelector(".gdg-article-link-url") as HTMLInputElement;
        // A2: the dialog is outside the editor's frame, so the backstop leaves its paste alone.
        const pasted = await paste(input(), { text: "https://example.com/pasted" });
        expect(pasted.defaultPrevented).toBe(false);
        for (const unsafe of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>"]) {
            fireEvent.change(input(), { target: { value: unsafe } });
            await editor.click(".gdg-article-link-apply");
            expect(editor.container.querySelector('[role="alert"]')).not.toBeNull();
            expect(editor.content().querySelector("a")).toBeNull();
        }
        fireEvent.change(input(), { target: { value: "https://example.com/ok" } });
        await editor.click(".gdg-article-link-apply");
        expect(editor.container.querySelector(".gdg-article-link-url")).toBeNull();
        expect(editor.content().querySelector('a[href="https://example.com/ok"]')?.textContent).toBe("text");
        expect(await editor.save()).toBe("[text](https://example.com/ok)\n");
    });

    it("S13 clicking a task checkbox toggles it, and Save writes [x]", async () => {
        const editor = await mount("* [ ] open task\n* [x] done task");
        const [open] = editor.content().querySelectorAll('li[data-item-type="task"]');
        await act(async () => {
            open.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 0 }));
        });
        expect(editor.content().querySelector('li[data-item-type="task"]')?.getAttribute("data-checked")).toBe("true");
        expect(await editor.save()).toBe("* [x] open task\n* [x] done task\n");
    });

    it("S14 key events in the editor, the link dialog and the heading menu don't reach the grid", async () => {
        const reached = vi.fn();
        document.addEventListener("keydown", reached);
        try {
            const editor = await mount("text");
            const key = (el: Element) =>
                act(async () => {
                    el.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }));
                });
            await key(editor.content());
            await editor.tool("Insert link");
            await key(editor.container.querySelector(".gdg-article-link-url")!);
            await editor.tool("Insert link");
            await editor.tool("Headings");
            await key(editor.container.querySelector('[aria-label="Heading 1"]')!);
            expect(reached).not.toHaveBeenCalled();
        } finally {
            document.removeEventListener("keydown", reached);
        }
    });

    it("S15 an image file paste inserts a data:image image", async () => {
        const editor = await mount("start");
        const event = await paste(editor.content(), { files: [pngFile("pasted.png")] });
        expect(event.defaultPrevented).toBe(true);
        await waitFor(() =>
            expect(editor.content().querySelector('img[src^="data:image/png;base64,"]')).not.toBeNull()
        );
        expect(await editor.save()).toMatch(/!\[pasted\.png\]\(data:image\/png;base64,/);
    });

    it("S16 copy and paste within the editor keep task items, tables, code blocks and hard breaks", async () => {
        const source =
            "* [x] done task\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\nline one\\\nline two";
        const copied: Record<string, string> = {};
        const editor = await mount(source);
        await editor.selectAll();
        const copy = new Event("copy", { bubbles: true, cancelable: true });
        Object.defineProperty(copy, "clipboardData", {
            value: { clearData: () => undefined, setData: (type: string, value: string) => (copied[type] = value) },
        });
        await act(async () => {
            editor.content().dispatchEvent(copy);
        });
        expect(copied["text/html"]).toBeDefined();
        cleanup();
        const target = await mount("start");
        await paste(target.content(), { html: copied["text/html"], text: copied["text/plain"] });
        const saved = await target.save();
        expect(saved).toContain("* [x] done task");
        expect(saved).toMatch(/\| A +\| B +\|/);
        expect(saved).toContain("```js\nconst x = 1;\n```");
        expect(saved).toContain("line one\\\nline two");
    });
});

describe("I: the sanitizer instance", () => {
    it("I01 D3 uses a private instance of the external dompurify, 3.4.16 or later", async () => {
        expect(created).toContain(articlePurify);
        expect(articlePurify).not.toBe(DOMPurify);
        expect(versionAtLeast(articlePurify.version, "3.4.16")).toBe(true);
        expect(articlePurify.isSupported).toBe(true);
        const sanitize = vi.spyOn(articlePurify, "sanitize");
        const shared = vi.spyOn(DOMPurify, "sanitize");
        try {
            const editor = await mount("start");
            await paste(editor.content(), { html: "<p>pasted <b>html</b></p>", text: "pasted html" });
            expect(sanitize).toHaveBeenCalled();
            expect(sanitize.mock.calls.some(([, cfg]: any[]) => cfg?.FORBID_ATTR?.includes("data-type"))).toBe(true);
            expect(shared).not.toHaveBeenCalled();
        } finally {
            sanitize.mockRestore();
            shared.mockRestore();
        }
    });

    it("I02 an app's setConfig and hooks on the default instance don't weaken D1 or D3", async () => {
        DOMPurify.setConfig({ ADD_ATTR: ["onerror"], ALLOWED_URI_REGEXP: /.*/ });
        DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
            data.forceKeepAttr = true;
        });
        try {
            // The app's configuration is in effect on the shared default instance...
            expect(DOMPurify.sanitize(`<img src=x onerror="a()">`)).toContain("onerror");
            // ...but not on the article editor's private instance.
            expect(safeArticleURL("a", "href", "javascript:alert(1)")).toBe("");
            expect(sanitizePastedHTML(`<img src=x onerror="a()">`)).not.toContain("onerror");
            const editor = await mount("start");
            await paste(editor.content(), { html: `<p><img src=x onerror="window.__xss='I02'"></p>`, text: "x" });
            expect(findDangerousDOM(editor.container)).toEqual([]);
        } finally {
            DOMPurify.clearConfig();
            DOMPurify.removeAllHooks();
        }
    });

    it("I03 prototype pollution doesn't widen D3's allowlist (GHSA-p3vf, upstream 2/2)", () => {
        const proto = Object.prototype as any;
        const hasOwnProperty = proto.hasOwnProperty;
        let polluted: string;
        let pollutedAttr: string;
        try {
            const obj: any = {};
            obj.__proto__.hasOwnProperty = Object;
            obj.constructor.prototype.ALLOWED_ATTR = ["src", "onerror"];
            polluted = sanitizePastedHTML(`<img src=x onerror="window.__xss='I03'">`);
            proto.hasOwnProperty = hasOwnProperty;
            pollutedAttr = sanitizePastedHTML(`<p><img src=x onerror="window.__xss='I03'"></p>`);
        } finally {
            delete proto.ALLOWED_ATTR;
            proto.hasOwnProperty = hasOwnProperty;
        }
        expect(polluted).toContain("<img");
        expect(polluted).not.toContain("onerror");
        expect(pollutedAttr).not.toContain("onerror");
    });

    it("I04 fails closed when DOMPurify reports itself unsupported", async () => {
        const editor = await mount("start");
        articlePurify.isSupported = false;
        try {
            // Every URL is rejected...
            for (const url of ["https://example.com/", "http://example.com/", "mailto:a@example.com", "docs/a.html"]) {
                expect(safeArticleURL("a", "href", url)).toBe("");
            }
            expect(sanitizePastedHTML("<p><b>x</b></p>")).toBe("");
            // ...and pasted HTML inserts its plain text only.
            const event = await paste(editor.content(), {
                html: `<p><strong>rich</strong><img src=x onerror="window.__xss='I04'"></p>`,
                text: "plain-I04 ",
            });
            expect(event.defaultPrevented).toBe(true);
            expect(editor.content().textContent).toContain("plain-I04");
            expect(editor.content().querySelector("strong, img")).toBeNull();
        } finally {
            articlePurify.isSupported = true;
        }
        expect(await editor.save()).toBe("plain-I04 start\n");
    });
});
