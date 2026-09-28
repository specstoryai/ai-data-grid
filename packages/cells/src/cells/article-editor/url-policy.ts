// The article editor's private DOMPurify instance (SPST-61). It backs D1, the URL policy for
// every link and image in the editor and the viewer, and D3, the sanitizer for pasted and
// dropped HTML. `DOMPurify()` creates a new instance, so an app's `setConfig` and `addHook`
// calls on the shared default instance don't reach it (as in SPST-48). Nothing calls
// `setConfig` on it either: D3 passes its configuration per call.
import DOMPurify from "dompurify";

export const articlePurify = DOMPurify();

/**
 * D1: returns `value` if DOMPurify's attribute policy accepts it for `tag` and `attr`, and ""
 * otherwise. `https:`, `http:`, `mailto:`, `tel:` and relative URLs pass; `data:` passes only
 * on `img[src]`; `javascript:`, `vbscript:` and obfuscated forms don't. It fails closed: if
 * DOMPurify reports itself unsupported, every URL is rejected.
 */
export function safeArticleURL(tag: "a" | "img", attr: "href" | "src", value: unknown): string {
    if (typeof value !== "string" || value === "") return "";
    if (!articlePurify.isSupported) return "";
    return articlePurify.isValidAttribute(tag, attr, value) ? value : "";
}

// `data-type` and `data-value` are how Milkdown's DOM output marks raw-HTML, footnote and
// hard-break nodes. Forbidding them means clipboard HTML can never name a raw-HTML node, even
// if a future schema adds a parse rule for one. `<style>` is dropped because ProseMirror
// copies a pasted stylesheet's rules onto the pasted elements before parsing them.
const PASTE_CONFIG = {
    FORBID_ATTR: ["data-type", "data-value"],
    FORBID_TAGS: ["style"],
};

/**
 * D3: sanitizes clipboard or drop HTML before ProseMirror parses it. It returns "" when
 * DOMPurify reports itself unsupported, so the paste falls back to the plain-text flavor.
 */
export function sanitizePastedHTML(html: string): string {
    if (!articlePurify.isSupported) return "";
    return articlePurify.sanitize(html, PASTE_CONFIG);
}
