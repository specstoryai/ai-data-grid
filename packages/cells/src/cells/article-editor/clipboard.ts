// Paste and drop handling for the article editor (SPST-61): D3, D4 and D5. Together they
// make sure no paste or drop is left to the browser's native insertion (P6), and that a
// code block only ever receives plain text.
import { Fragment, type ResolvedPos, type Schema, Slice } from "@milkdown/prose/model";
import { dropPoint } from "@milkdown/prose/transform";
import type { EditorProps, EditorView } from "@milkdown/prose/view";
import { safeArticleURL, sanitizePastedHTML } from "./url-policy.js";

const isCode = ($pos: ResolvedPos) => $pos.parent.type.spec.code === true;

const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, "\n");

// Plain text as paragraphs, the way ProseMirror parses a plain-text paste.
function plainTextSlice(schema: Schema, text: string): Slice {
    const paragraphs = normalizeNewlines(text)
        .split(/\n+/)
        .map(line => schema.nodes.paragraph.create(null, line === "" ? null : schema.text(line)));
    return Slice.maxOpen(Fragment.from(paragraphs));
}

function imageFiles(data: DataTransfer | null): File[] | undefined {
    if (data === null || data.files.length === 0) return undefined;
    return Array.from(data.files).filter(file => file.type.startsWith("image/"));
}

// An image file becomes a `data:image/…` image, as Toast UI's image hook did (SPST-48's D02).
function insertImageFiles(view: EditorView, files: readonly File[], pos: number | undefined) {
    for (const file of files) {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            const src = safeArticleURL("img", "src", reader.result);
            if (view.isDestroyed || src === "") return;
            const { state } = view;
            const image = state.schema.nodes.image.create({ src, alt: file.name, title: "" });
            let tr = state.tr;
            if (pos === undefined) {
                tr = tr.replaceSelectionWith(image);
            } else {
                const at = dropPoint(
                    state.doc,
                    Math.min(pos, state.doc.content.size),
                    new Slice(Fragment.from(image), 0, 0)
                );
                tr = tr.insert(at ?? pos, image);
            }
            view.dispatch(tr.scrollIntoView());
        });
        reader.readAsDataURL(file);
    }
}

/** D3 and D4, as ProseMirror editor props. */
export const articleClipboardProps: Pick<EditorProps, "transformPastedHTML" | "handlePaste" | "handleDrop"> = {
    // D3: every HTML paste and drop that ProseMirror parses goes through the private DOMPurify.
    transformPastedHTML: html => sanitizePastedHTML(html),

    handlePaste: (view, event, slice) => {
        const data = event.clipboardData;
        const { state } = view;
        event.preventDefault();
        // A1: a code block gets the text/plain flavor only, whatever else is on the clipboard.
        if (isCode(state.selection.$from)) {
            const text = normalizeNewlines(data?.getData("text/plain") ?? "");
            if (text !== "") view.dispatch(state.tr.insertText(text).scrollIntoView().setMeta("uiEvent", "paste"));
            return true;
        }
        const images = imageFiles(data);
        if (images !== undefined) {
            // Any other file is ignored.
            insertImageFiles(view, images, undefined);
            return true;
        }
        if (slice.size > 0) return false;
        // An empty slice would send ProseMirror to its native-paste fallback (capturePaste).
        // Insert the plain-text flavor instead: that's also where a paste lands when D3
        // fails closed.
        const text = data?.getData("text/plain") ?? "";
        if (text !== "") {
            view.dispatch(
                state.tr
                    .replaceSelection(plainTextSlice(state.schema, text))
                    .scrollIntoView()
                    .setMeta("uiEvent", "paste")
            );
        }
        return true;
    },

    handleDrop: (view, event, slice) => {
        // Moving or copying a selection within the editor stays ProseMirror's.
        if (view.dragging !== null) return false;
        event.preventDefault();
        const data = event.dataTransfer;
        const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (target === null) return true;
        const { state } = view;
        const $pos = state.doc.resolve(target.pos);
        // A1: a code block gets the text/plain flavor only.
        if (isCode($pos)) {
            const text = normalizeNewlines(data?.getData("text/plain") ?? "");
            if (text !== "") view.dispatch(state.tr.insertText(text, target.pos).setMeta("uiEvent", "drop"));
            return true;
        }
        const images = imageFiles(data);
        if (images !== undefined) {
            insertImageFiles(view, images, target.pos);
            return true;
        }
        if (slice.size > 0) return false;
        const text = data?.getData("text/plain") ?? "";
        if (text !== "") {
            const content = plainTextSlice(state.schema, text);
            const at = dropPoint(state.doc, target.pos, content) ?? target.pos;
            view.dispatch(state.tr.replaceRange(at, at, content).setMeta("uiEvent", "drop"));
        }
        return true;
    },
};

/**
 * D5: prevents every paste and drop on the editor's frame that nothing else handled, such as
 * a paste during composition, a drop ProseMirror can't place, or one outside the ProseMirror
 * element. Returns a function that removes the listeners.
 */
export function installPasteDropBackstop(frame: HTMLElement): () => void {
    const backstop = (event: Event) => {
        if (!event.defaultPrevented) event.preventDefault();
    };
    frame.addEventListener("paste", backstop);
    frame.addEventListener("drop", backstop);
    return () => {
        frame.removeEventListener("paste", backstop);
        frame.removeEventListener("drop", backstop);
    };
}
