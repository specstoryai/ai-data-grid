// ArticleCell sanitizer and editor integration tests (SPST-48). They run the real, vendored
// Toast UI editor and the real external DOMPurify through ArticleCell's public
// provideEditor API. jsdom doesn't execute scripts or event handlers, so the evidence here
// is the rendered DOM (plus an innerHTML-sink spy); scripts/check-article-cell-sanitizer.mjs
// runs the same fixtures in Chromium, Firefox and WebKit, where execution is observable.
import * as React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCellKind } from "@specstory/ai-data-grid";
import DOMPurify from "dompurify";
import { ArticleCell, type ArticleCellType } from "../src/index.js";
import { Editor } from "../vendor/toast-ui/editor.js";
import {
    contentRoots,
    findDangerousDOM,
    normalPasteHTML,
    officeListPasteHTML,
    pastePayloads,
    renderPayloads,
    safeMarkdown,
    safeSelectors,
    safeURLMarkdown,
    safeURLs,
} from "./fixtures/article-sanitizer-payloads.mjs";

// A pass-through wrapper around the real DOMPurify: it records every instance created
// from the module (Toast UI's private instance is created when editor.js loads) and
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

// ProseMirror measures layout, which jsdom doesn't implement.
beforeAll(() => {
    const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
    const rects = Object.assign([], { item: () => null });
    Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => rect as DOMRect;
    (Text.prototype as any).getClientRects = () => rects;
    document.elementFromPoint = () => document.querySelector(".toastui-editor-ww-container .ProseMirror p");
});

afterEach(() => {
    cleanup();
    delete (window as any).__xss;
});

function articleCell(markdown: string, readonly = false): ArticleCellType {
    return {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        copyData: markdown,
        readonly,
        data: { kind: "article-cell", markdown },
    };
}

const WYSIWYG = ".toastui-editor-ww-container .ProseMirror";
const MD_PREVIEW = ".toastui-editor-md-preview .toastui-editor-contents";

async function mount(markdown: string, { readonly = false, strict = false } = {}) {
    const cell = articleCell(markdown, readonly);
    const provided = ArticleCell.provideEditor?.({ ...cell, location: [0, 0] } as any);
    const CellEditor = (provided as any).editor as React.FC<any>;
    const onFinishedEditing = vi.fn();
    const element = (
        <CellEditor
            value={cell}
            onFinishedEditing={onFinishedEditing}
            onChange={() => undefined}
            isHighlighted={false}
            target={{ x: 0, y: 0, width: 100, height: 100 }}
            forceEditMode={false}
        />
    );
    const result = render(strict ? <React.StrictMode>{element}</React.StrictMode> : element);
    await waitFor(
        () => expect(result.container.querySelector(readonly ? ".toastui-editor-contents" : WYSIWYG)).not.toBeNull(),
        {
            timeout: 10000,
        }
    );
    const click = (selector: string) =>
        act(() => {
            (result.container.querySelector(selector) as HTMLElement).click();
        });
    return {
        ...result,
        onFinishedEditing,
        wysiwyg: () => result.container.querySelector(WYSIWYG) as HTMLElement,
        save: async () => {
            await click(".gdg-save-button");
            return onFinishedEditing.mock.calls.at(-1)?.[0]?.data.markdown as string | undefined;
        },
        close: () => click(".gdg-close-button"),
    };
}

function clipboard(html: string | undefined, text = "", files: File[] = []) {
    const data: Record<string, string> = { "text/plain": text };
    if (html !== undefined) data["text/html"] = html;
    return { getData: (type: string) => data[type] ?? "", types: Object.keys(data), items: [], files };
}

async function paste(target: HTMLElement, html: string | undefined, text = "") {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboard(html, text) });
    await act(async () => {
        target.focus();
        target.dispatchEvent(event);
    });
}

// A drop on the editor. It must never be left to the browser's native insertion (P5), which
// runs the dropped markup's event handlers in Firefox: ProseMirror parses it through
// transformPastedHTML (P2), or it's prevented. scripts/check-article-cell-sanitizer.mjs does
// real drags and drops in Chromium, Firefox and WebKit.
async function drop(target: HTMLElement, html: string | undefined, text = "dropped", files: File[] = []) {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: clipboard(html, text, files) });
    Object.defineProperty(event, "clientX", { value: 1 });
    Object.defineProperty(event, "clientY", { value: 1 });
    await act(async () => {
        target.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
}

// Records every innerHTML assignment to an element of the live document. In a browser,
// such an assignment runs inline event handlers, so none may carry one (the T2 sink).
function spyOnLiveInnerHTML() {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (descriptor?.set === undefined) throw new Error("Element.prototype.innerHTML is not an accessor");
    const writes: string[] = [];
    Object.defineProperty(Element.prototype, "innerHTML", {
        ...descriptor,
        set(this: Element, value: string) {
            if (this.ownerDocument === document) writes.push(String(value));
            descriptor.set?.call(this, value);
        },
    });
    return {
        unsafeWrites: () => writes.filter(w => /<script|\son[a-z]+\s*=/i.test(w)),
        restore: () => Object.defineProperty(Element.prototype, "innerHTML", descriptor),
    };
}

// The private instance Toast UI created from the external dompurify module.
function toastInstance() {
    expect(created.length).toBeGreaterThan(0);
    return created[0];
}

function versionAtLeast(version: string, floor: string) {
    const a = version.split(".").map(Number);
    const b = floor.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return true;
}

const withContext = (markdown: string) => `before\n\n${markdown}\n\nafter`;

describe("R: rendering untrusted Markdown", () => {
    it.each(renderPayloads.map(p => [p.id, p.name, p.markdown]))("%s viewer: %s", async (_id, _name, markdown) => {
        const { container } = await mount(withContext(markdown), { readonly: true });
        expect(contentRoots(container)).toHaveLength(1);
        // Unclosed payloads may swallow the text after them, so only the text before is checked.
        expect(container.textContent).toContain("before");
        expect(findDangerousDOM(container)).toEqual([]);
        expect((window as any).__xss).toBeUndefined();
    });

    it.each(renderPayloads.map(p => [p.id, p.name, p.markdown]))("%s editor: %s", async (_id, _name, markdown) => {
        const spy = spyOnLiveInnerHTML();
        try {
            const { container } = await mount(withContext(markdown));
            // The WYSIWYG document and the hidden Markdown preview are both checked.
            expect(container.querySelector(MD_PREVIEW)).not.toBeNull();
            expect(contentRoots(container)).toHaveLength(2);
            expect(container.querySelector(WYSIWYG)?.textContent).toContain("after");
            expect(findDangerousDOM(container)).toEqual([]);
            expect(spy.unsafeWrites()).toEqual([]);
            expect((window as any).__xss).toBeUndefined();
        } finally {
            spy.restore();
        }
    });
});

describe("P: paste and drop into the WYSIWYG editor", () => {
    it.each(pastePayloads.map(p => [p.id, p.name, p.html, p.drop === true]))(
        "%s: %s",
        async (id, _name, html, isDrop) => {
            const editor = await mount("start");
            const spy = spyOnLiveInnerHTML();
            try {
                if (isDrop) await drop(editor.wysiwyg(), html);
                else await paste(editor.wysiwyg(), html);
                expect(spy.unsafeWrites()).toEqual([]);
            } finally {
                spy.restore();
            }
            // The paste or drop was applied (it isn't silently dropped)...
            expect(editor.wysiwyg().textContent).toContain(`paste-${id}`);
            // ...and left nothing dangerous in the document or the saved Markdown.
            expect(findDangerousDOM(editor.container)).toEqual([]);
            expect(await editor.save()).not.toMatch(/<\s*(script|iframe)|\son[a-z]+\s*=|javascript:/i);
            expect((window as any).__xss).toBeUndefined();
        }
    );
});

describe("D: drops onto the WYSIWYG editor (P5)", () => {
    it.each(pastePayloads.filter(p => p.drop !== true).map(p => [p.id, p.name, p.html]))(
        "D01 %s dropped: %s",
        async (id, _name, html) => {
            const editor = await mount("start");
            const instance = toastInstance();
            const sanitize = vi.spyOn(instance, "sanitize");
            const spy = spyOnLiveInnerHTML();
            try {
                await drop(editor.wysiwyg(), html);
                expect(spy.unsafeWrites()).toEqual([]);
                // ProseMirror parsed the drop through transformPastedHTML, so P2 sanitized it.
                expect(sanitize.mock.calls.some(([, cfg]: any[]) => cfg?.FORBID_ATTR?.includes("data-raw-html"))).toBe(
                    true
                );
            } finally {
                spy.restore();
                sanitize.mockRestore();
            }
            expect(editor.wysiwyg().textContent).toContain(`paste-${id}`);
            expect(findDangerousDOM(editor.container)).toEqual([]);
            expect(await editor.save()).not.toMatch(/<\s*(script|iframe)|\son[a-z]+\s*=|javascript:/i);
            expect((window as any).__xss).toBeUndefined();
        }
    );

    it("D02 an image file drop goes to the image hook and is prevented", async () => {
        const editor = await mount("start");
        // Toast UI's default hook reads the file as a data: URL and inserts the image.
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        await drop(editor.wysiwyg(), undefined, "", [new File([png], "dot.png", { type: "image/png" })]);
        await waitFor(() =>
            expect(editor.wysiwyg().querySelector('img[src^="data:image/png;base64,"]')).not.toBeNull()
        );
        expect(await editor.save()).toMatch(/!\[dot\.png\]\(data:image\/png;base64,/);
    });

    it("D03 a text/plain drop is applied", async () => {
        const editor = await mount("start");
        await drop(editor.wysiwyg(), undefined, "plain dropped text");
        expect(editor.wysiwyg().textContent).toContain("plain dropped text");
    });

    it("D04 a drop inside a code block, whose node view stops events, is prevented and changes nothing", async () => {
        const editor = await mount("```\ncode\n```");
        const code = editor.wysiwyg().querySelector("pre code") as HTMLElement;
        expect(code).not.toBeNull();
        const before = editor.wysiwyg().innerHTML;
        await drop(code, pastePayloads.find(p => p.id === "P06")!.html);
        expect(editor.wysiwyg().innerHTML).toBe(before);
        expect(await editor.save()).toBe("```\ncode\n```");
    });

    it("D05 markup inserted outside ProseMirror, as a native drop would, is parsed with P3", async () => {
        const editor = await mount("start");
        await act(async () => {
            editor.wysiwyg().insertAdjacentHTML("beforeend", pastePayloads.find(p => p.id === "P10")!.html);
            // Let ProseMirror's MutationObserver read the change.
            await new Promise(resolve => setTimeout(resolve, 50));
        });
        expect(editor.wysiwyg().textContent).toContain("paste-P10");
        expect(findDangerousDOM(editor.container)).toEqual([]);
        expect(await editor.save()).not.toMatch(/<\s*(script|iframe)|\son[a-z]+\s*=|javascript:/i);
    });
});

describe("S: safe content and editor behavior", () => {
    it("S01 the Viewer renders every supported formatting feature", async () => {
        const { container } = await mount(safeMarkdown, { readonly: true });
        const root = contentRoots(container)[0];
        for (const selector of safeSelectors) expect(root.querySelector(selector), selector).not.toBeNull();
        expect(root.querySelectorAll("li.task-list-item")).toHaveLength(2);
        expect(root.querySelector("li.task-list-item.checked")?.textContent).toContain("done task");
        expect(findDangerousDOM(container)).toEqual([]);
    });

    it("S02 the WYSIWYG editor renders every supported formatting feature", async () => {
        const editor = await mount(safeMarkdown);
        const root = editor.wysiwyg();
        for (const selector of safeSelectors) expect(root.querySelector(selector), selector).not.toBeNull();
        expect(root.querySelectorAll("li.task-list-item")).toHaveLength(2);
        expect(findDangerousDOM(editor.container)).toEqual([]);
    });

    it("S03 safe link and image URLs survive in the Viewer and the editor", async () => {
        const viewer = await mount(safeURLMarkdown, { readonly: true });
        const check = (root: Element) => {
            for (const href of safeURLs.links) expect(root.querySelector(`a[href="${href}"]`), href).not.toBeNull();
            for (const src of safeURLs.images) expect(root.querySelector(`img[src="${src}"]`), src).not.toBeNull();
        };
        check(contentRoots(viewer.container)[0]);
        cleanup();
        const editor = await mount(safeURLMarkdown);
        check(editor.wysiwyg());
    });

    it("S04 Save with no change returns the original Markdown byte for byte", async () => {
        const original = `${safeMarkdown}\n\n*  odd   spacing*\n`;
        const editor = await mount(original);
        expect(await editor.save()).toBe(original);
        expect(editor.onFinishedEditing).toHaveBeenCalledTimes(1);
    });

    it("S05 Save after a change returns the edited Markdown, not the editor type (B1)", async () => {
        const editor = await mount("hello **bold** world");
        await paste(editor.wysiwyg(), undefined, "EDITED ");
        const saved = await editor.save();
        expect(saved).not.toBe("wysiwyg");
        expect(saved).toContain("EDITED");
        expect(saved).toContain("**bold**");
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

    it("S07 a read-only cell renders the Viewer only", async () => {
        const { container } = await mount("This is **read only**", { readonly: true });
        expect(container.querySelector("#gdg-markdown-readonly")).not.toBeNull();
        expect(container.querySelector("#gdg-markdown-wysiwyg")).toBeNull();
        expect(container.querySelector(".toastui-editor-toolbar")).toBeNull();
        expect(container.querySelector(".ProseMirror")).toBeNull();
        expect(container.querySelector(".gdg-save-button, .gdg-close-button")).toBeNull();
        expect(contentRoots(container)[0].querySelector("strong")?.textContent).toBe("read only");
    });

    it("S08 unmount destroys the editor, and reopening shows the initial value", async () => {
        const destroy = vi.spyOn(Editor.prototype, "destroy");
        try {
            // StrictMode mounts, unmounts and remounts effects: exactly one editor remains.
            const first = await mount("initial text", { strict: true });
            expect(first.container.querySelectorAll(".toastui-editor-defaultUI")).toHaveLength(1);
            expect(destroy).toHaveBeenCalledTimes(1);
            await paste(first.wysiwyg(), undefined, "unsaved ");
            expect(first.wysiwyg().textContent).toContain("unsaved");
            first.unmount();
            expect(destroy).toHaveBeenCalledTimes(2);
            const second = await mount("initial text");
            expect(second.wysiwyg().textContent).toBe("initial text");
        } finally {
            destroy.mockRestore();
        }
    });

    it("S09 a normal paste keeps bold, links, lists and tables", async () => {
        const editor = await mount("start");
        await paste(editor.wysiwyg(), normalPasteHTML);
        const root = editor.wysiwyg();
        expect(root.querySelector("strong")?.textContent).toBe("bold");
        expect(root.querySelector('a[href="https://example.com/pasted"]')?.textContent).toBe("a link");
        expect(root.querySelector("ul li")?.textContent).toContain("pasted item");
        expect(root.querySelector("table th")?.textContent).toBe("H");
        const saved = await editor.save();
        expect(saved).toContain("**bold**");
        expect(saved).toContain("[a link](https://example.com/pasted)");
        expect(saved).toMatch(/\* pasted item/);
        expect(saved).toMatch(/\| H \|/);
    });

    it("S10 a benign Office list paste still becomes a list", async () => {
        const editor = await mount("start");
        await paste(editor.wysiwyg(), officeListPasteHTML);
        const items = Array.from(editor.wysiwyg().querySelectorAll("ol li, ul li")).map(li => li.textContent);
        expect(items.join("|")).toContain("office one");
        expect(items.join("|")).toContain("office two");
    });
});

describe("I: sanitizer identity", () => {
    it("I01 the Viewer sanitizes through a private instance of the external dompurify", async () => {
        const instance = toastInstance();
        expect(instance).not.toBe(DOMPurify);
        expect(versionAtLeast(instance.version, "3.4.16")).toBe(true);
        expect(instance.isSupported).toBe(true);
        const sanitize = vi.spyOn(instance, "sanitize");
        try {
            await mount("<b>x</b>", { readonly: true });
            expect(sanitize).toHaveBeenCalled();
        } finally {
            sanitize.mockRestore();
        }
    });

    it("I02 editor load and paste sanitize through the same private instance", async () => {
        const instance = toastInstance();
        const sanitize = vi.spyOn(instance, "sanitize");
        const shared = vi.spyOn(DOMPurify, "sanitize");
        try {
            const editor = await mount("<b>x</b>\n\n<div>block</div>");
            const afterLoad = sanitize.mock.calls.length;
            expect(afterLoad).toBeGreaterThan(0);
            await paste(editor.wysiwyg(), "<p>pasted <b>html</b></p>");
            expect(sanitize.mock.calls.length).toBeGreaterThan(afterLoad);
            expect(sanitize.mock.calls.some(([, cfg]: any[]) => cfg?.FORBID_ATTR?.includes("data-raw-html"))).toBe(
                true
            );
            expect(shared).not.toHaveBeenCalled();
        } finally {
            sanitize.mockRestore();
            shared.mockRestore();
        }
    });

    it("I03 prototype pollution doesn't widen the Viewer's allowlist (GHSA-p3vf, upstream 2/2)", async () => {
        const markdown = `<img src=x onerror="window.__xss='I03'">`;
        // Load the lazy editor module first, so the polluted render below is synchronous.
        await mount(markdown, { readonly: true });
        cleanup();
        const cell = articleCell(markdown, true);
        const CellEditor = (ArticleCell.provideEditor?.({ ...cell, location: [0, 0] } as any) as any).editor;
        const proto = Object.prototype as any;
        const hasOwnProperty = proto.hasOwnProperty;
        let container: HTMLElement;
        try {
            const obj: any = {};
            obj.__proto__.hasOwnProperty = Object;
            obj.constructor.prototype.ALLOWED_ATTR = ["src", "onerror"];
            ({ container } = render(
                <CellEditor value={cell} onFinishedEditing={vi.fn()} onChange={vi.fn()} isHighlighted={false} />
            ));
        } finally {
            delete proto.ALLOWED_ATTR;
            proto.hasOwnProperty = hasOwnProperty;
        }
        expect(container.querySelector(".toastui-editor-contents img[src]")).not.toBeNull();
        expect(findDangerousDOM(container)).toEqual([]);
    });

    it("I04 an app's setConfig and hooks on the default instance don't weaken article sanitization", async () => {
        DOMPurify.setConfig({ ADD_ATTR: ["onerror"] });
        DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
            data.forceKeepAttr = true;
        });
        try {
            // The app's configuration is in effect on the shared default instance...
            expect(DOMPurify.sanitize(`<img src=x onerror="a()">`)).toContain("onerror");
            // ...but not on the article editor's private instance.
            const viewer = await mount(`<img src=x onerror="window.__xss='I04'">`, { readonly: true });
            expect(findDangerousDOM(viewer.container)).toEqual([]);
            cleanup();
            const editor = await mount("start");
            await paste(editor.wysiwyg(), `<p><img src=x onerror="window.__xss='I04'"></p>`);
            expect(findDangerousDOM(editor.container)).toEqual([]);
        } finally {
            DOMPurify.clearConfig();
            DOMPurify.removeAllHooks();
        }
    });

    it("I05 fails closed when DOMPurify reports itself unsupported", async () => {
        const instance = toastInstance();
        const errors: unknown[] = [];
        class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
            state = { failed: false };
            static getDerivedStateFromError() {
                return { failed: true };
            }
            componentDidCatch(error: unknown) {
                errors.push(error);
            }
            render() {
                return this.state.failed ? <p>failed</p> : this.props.children;
            }
        }
        const spy = spyOnLiveInnerHTML();
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        instance.isSupported = false;
        try {
            const cell = articleCell(`<img src=x onerror="window.__xss='I05'">`, true);
            const CellEditor = (ArticleCell.provideEditor?.({ ...cell, location: [0, 0] } as any) as any).editor;
            const { container } = render(
                <Boundary>
                    <CellEditor value={cell} onFinishedEditing={vi.fn()} onChange={vi.fn()} isHighlighted={false} />
                </Boundary>
            );
            await waitFor(() => expect(errors).toHaveLength(1), { timeout: 10000 });
            expect(String(errors[0])).toMatch(/DOMPurify is not supported/);
            expect(container.querySelector("img")).toBeNull();
            expect(spy.unsafeWrites()).toEqual([]);
        } finally {
            instance.isSupported = true;
            consoleError.mockRestore();
            spy.restore();
        }
    });
});
