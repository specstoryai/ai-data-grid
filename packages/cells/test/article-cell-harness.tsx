// Shared jsdom harness for the ArticleCell tests (SPST-61): it mounts the real editor through
// ArticleCell's public provideEditor API, and dispatches pastes, drops, clicks and selections
// the way a browser would. jsdom has no layout, so ProseMirror gets a few measuring shims,
// and `document.elementFromPoint` returns whatever `setPointTarget` chose (drops use it).
import * as React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import { GridCellKind } from "@specstory/ai-data-grid";
import { ArticleCell, type ArticleCellType } from "../src/index.js";

let pointTarget: () => Element | null = () => null;

/** Chooses the element `document.elementFromPoint` returns, which is where a drop lands. */
export function setPointTarget(target: () => Element | null) {
    pointTarget = target;
}

/** Installs ProseMirror's layout shims. Call it in `beforeAll`. */
export function installLayoutShims() {
    const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
    const rects = Object.assign([], { item: () => null });
    Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => rect as DOMRect;
    (Text.prototype as any).getClientRects = () => rects;
    document.elementFromPoint = () => pointTarget();
}

export function articleCell(markdown: string, readonly = false): ArticleCellType {
    return {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        copyData: markdown,
        readonly,
        data: { kind: "article-cell", markdown },
    };
}

export const CONTENT = ".gdg-article-content";

export type Mounted = Awaited<ReturnType<typeof mount>>;

/** Mounts ArticleCell's editor (or viewer) and waits until it's created. */
export async function mount(markdown: string, { readonly = false, strict = false } = {}) {
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
        () => {
            expect(result.container.querySelector(CONTENT)).not.toBeNull();
            if (!readonly) expect(result.container.querySelector(".gdg-article-toolbar")).not.toBeNull();
        },
        { timeout: 10000 }
    );
    const content = () => result.container.querySelector(CONTENT) as HTMLElement;
    const click = (selector: string) =>
        act(async () => {
            const el = result.container.querySelector(selector) as HTMLElement | null;
            if (el === null) throw new Error(`nothing matches ${selector}`);
            el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
            el.click();
        });
    return {
        ...result,
        onFinishedEditing,
        content,
        click,
        /** Clicks a toolbar button (or menu item) by its accessible name. */
        tool: (label: string) => click(`[aria-label="${label}"]`),
        save: async () => {
            await click(".gdg-save-button");
            return onFinishedEditing.mock.calls.at(-1)?.[0]?.data.markdown as string | undefined;
        },
        close: () => click(".gdg-close-button"),
        /** Places the caret in `node` at `offset`, and lets ProseMirror read the DOM selection. */
        placeCaret: (node: Node, offset: number) =>
            act(async () => {
                content().focus();
                document.getSelection()?.collapse(node, offset);
                document.dispatchEvent(new Event("selectionchange"));
                await new Promise(resolve => setTimeout(resolve, 20));
            }),
        /** Selects the whole document with Ctrl-A. */
        selectAll: () =>
            act(async () => {
                content().focus();
                content().dispatchEvent(
                    new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true })
                );
            }),
    };
}

/** The text node at the end of the first element matching `selector` in the content. */
export function lastText(root: HTMLElement, selector: string): Text {
    const el = root.querySelector(selector);
    if (el === null) throw new Error(`nothing matches ${selector}`);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    while (walker.nextNode() !== null) last = walker.currentNode as Text;
    if (last === null) throw new Error(`no text in ${selector}`);
    return last;
}

interface TransferData {
    readonly html?: string;
    readonly text?: string;
    readonly files?: readonly File[];
    readonly types?: readonly string[];
}

/** A DataTransfer-like object with exactly the flavors given. */
export function transfer({ html, text, files = [], types }: TransferData) {
    const data: Record<string, string> = {};
    if (text !== undefined) data["text/plain"] = text;
    if (html !== undefined) data["text/html"] = html;
    const fileList = Object.assign([...files], { item: (i: number) => files[i] ?? null });
    return {
        getData: (type: string) => data[type] ?? "",
        types: types ?? [...Object.keys(data), ...(files.length > 0 ? ["Files"] : [])],
        items: [],
        files: fileList,
        dropEffect: "none",
        effectAllowed: "all",
    };
}

/** Dispatches a paste on `target`, the way a keyboard paste reaches the page. */
export async function paste(target: Element, data: TransferData): Promise<Event> {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: transfer(data) });
    await act(async () => {
        target.dispatchEvent(event);
        await new Promise(resolve => setTimeout(resolve, 0));
    });
    return event;
}

/**
 * Dispatches a drop on `target`; `document.elementFromPoint` decides where it lands. The editor
 * has a zero-size box in jsdom, so a drop at `far` coordinates is outside it.
 */
export async function drop(target: Element, data: TransferData, { far = false } = {}): Promise<Event> {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer(data) });
    Object.defineProperty(event, "clientX", { value: far ? 5000 : 1 });
    Object.defineProperty(event, "clientY", { value: far ? 5000 : 1 });
    await act(async () => {
        target.dispatchEvent(event);
        await new Promise(resolve => setTimeout(resolve, 0));
    });
    return event;
}

/**
 * L03's sink spy: records every markup write to an element of the live document through the
 * `innerHTML` and `outerHTML` setters, `insertAdjacentHTML`, `Range.createContextualFragment`
 * and `document.write`. In a browser, each of these runs inline event handlers. ProseMirror
 * parses clipboard HTML in a detached document, which doesn't count.
 */
export function spyOnHTMLSinks() {
    const writes: string[] = [];
    const live = (node: Node | null) => node !== null && node.ownerDocument === document && node.isConnected;
    const record = (sink: string, value: unknown) => {
        const text = String(value);
        if (/</.test(text)) writes.push(`${sink}: ${text.slice(0, 80)}`);
    };
    const restores: (() => void)[] = [];
    for (const prop of ["innerHTML", "outerHTML"] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, prop);
        if (descriptor?.set === undefined) throw new Error(`Element.prototype.${prop} is not an accessor`);
        Object.defineProperty(Element.prototype, prop, {
            ...descriptor,
            set(this: Element, value: string) {
                if (live(this)) record(prop, value);
                descriptor.set?.call(this, value);
            },
        });
        restores.push(() => Object.defineProperty(Element.prototype, prop, descriptor));
    }
    const insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function (this: Element, position: InsertPosition, text: string) {
        if (live(this)) record("insertAdjacentHTML", text);
        return insertAdjacentHTML.call(this, position, text);
    };
    restores.push(() => (Element.prototype.insertAdjacentHTML = insertAdjacentHTML));
    const createContextualFragment = Range.prototype.createContextualFragment;
    Range.prototype.createContextualFragment = function (this: Range, text: string) {
        if (live(this.startContainer)) record("createContextualFragment", text);
        return createContextualFragment.call(this, text);
    };
    restores.push(() => (Range.prototype.createContextualFragment = createContextualFragment));
    const write = document.write;
    document.write = (...text: string[]) => {
        record("document.write", text.join(""));
        return write.apply(document, text);
    };
    restores.push(() => (document.write = write));
    return {
        writes: () => [...writes],
        restore: () => {
            for (const restore of restores.reverse()) restore();
        },
    };
}

export function versionAtLeast(version: string, floor: string) {
    const a = version.split(".").map(Number);
    const b = floor.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return true;
}

/** Markdown a saved paste or drop must never contain. */
export const UNSAFE_SAVED = /<\s*(script|iframe)|\son[a-z]+\s*=|javascript:|data-value/i;

/** A 1×1 PNG. */
export function pngFile(name = "dot.png") {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return new File([png], name, { type: "image/png" });
}
