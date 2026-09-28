// D2: schema overrides for the article editor (SPST-61). They're registered after the
// CommonMark and GFM presets, so they replace the presets' image, link and raw-HTML schemas.
import { codeBlockSchema, headingSchema, htmlSchema, imageSchema, linkSchema } from "@milkdown/preset-commonmark";
import type { DOMOutputSpec, TagParseRule } from "@milkdown/prose/model";
import { safeArticleURL } from "./url-policy.js";

const asString = (value: unknown) => (typeof value === "string" ? value : "");

// Applies D1 to one attribute of every tag parse rule, so neither a paste, a drop nor
// ProseMirror's DOM observer (native mutations) can put an unsafe URL into the document.
function guardParseRules(
    rules: readonly TagParseRule[] | undefined,
    tag: "a" | "img",
    attr: "href" | "src"
): TagParseRule[] {
    return (rules ?? []).map(rule => ({
        ...rule,
        getAttrs: (dom: HTMLElement) => {
            const attrs = rule.getAttrs === undefined ? {} : rule.getAttrs(dom);
            if (attrs === false || attrs === null) return attrs;
            return { ...attrs, [attr]: safeArticleURL(tag, attr, attrs?.[attr]) };
        },
    }));
}

// Replaces one attribute of a `[tag, attrs, ...children]` output spec.
function withAttr(spec: DOMOutputSpec | undefined, attr: string, value: string): DOMOutputSpec {
    if (!Array.isArray(spec)) throw new Error("Unexpected DOM output spec in the article schema");
    const [tag, attrs, ...rest] = spec as [string, Record<string, unknown>, ...unknown[]];
    return [tag, { ...attrs, [attr]: value }, ...rest] as DOMOutputSpec;
}

/**
 * The image: D1 on `src` when rendering and parsing HTML. The Markdown runner maps a missing
 * title or alt to "": mdast gives `title: null` for `![a](u)`, which the schema rejects, and
 * the image would otherwise be lost.
 */
export const articleImageSchema = imageSchema.extendSchema(prev => ctx => {
    const base = prev(ctx);
    return {
        ...base,
        parseDOM: guardParseRules(base.parseDOM as TagParseRule[] | undefined, "img", "src"),
        toDOM: node => withAttr(base.toDOM?.(node), "src", safeArticleURL("img", "src", node.attrs.src)),
        parseMarkdown: {
            ...base.parseMarkdown,
            runner: (state, node, type) => {
                state.addNode(type, { src: asString(node.url), alt: asString(node.alt), title: asString(node.title) });
            },
        },
    };
});

/**
 * The link: D1 on `href` when rendering and parsing HTML, independently of Milkdown's own
 * `sanitizeLinkHref`. The model keeps the stored URL, so an unchanged Save still returns the
 * stored Markdown.
 */
export const articleLinkSchema = linkSchema.extendSchema(prev => ctx => {
    const base = prev(ctx);
    return {
        ...base,
        parseDOM: guardParseRules(base.parseDOM as TagParseRule[] | undefined, "a", "href"),
        toDOM: (mark, inline) =>
            withAttr(base.toDOM?.(mark, inline), "href", safeArticleURL("a", "href", mark.attrs.href)),
    };
});

/**
 * Raw HTML from the Markdown stays an inert atom that shows its source text and is saved byte
 * for byte. It has no parse rule, so no clipboard, drop or DOM-observer input can create one.
 */
export const articleHTMLSchema = htmlSchema.extendSchema(prev => ctx => ({
    ...prev(ctx),
    parseDOM: [],
}));

/**
 * Headings render without the `id` Milkdown derives from their text, so article text can't
 * create named properties on `window` or `document` (DOM clobbering).
 */
export const articleHeadingSchema = headingSchema.extendSchema(prev => ctx => {
    const base = prev(ctx);
    return {
        ...base,
        toDOM: node => {
            const spec = base.toDOM?.(node);
            if (!Array.isArray(spec)) throw new Error("Unexpected DOM output spec in the article schema");
            const [tag, { id: _id, ...attrs }, ...rest] = spec as [string, Record<string, unknown>, ...unknown[]];
            return [tag, attrs, ...rest] as DOMOutputSpec;
        },
    };
});

/**
 * A code block's language, when parsed from HTML (a paste, a drop or a native mutation), is kept
 * only if it looks like a language name, so pasted HTML can't carry quotes or event handlers
 * into the stored fence's info string. A language from the Markdown itself is untouched.
 */
const LANGUAGE = /^[\w#+.-]*$/;
export const articleCodeBlockSchema = codeBlockSchema.extendSchema(prev => ctx => {
    const base = prev(ctx);
    return {
        ...base,
        parseDOM: ((base.parseDOM ?? []) as TagParseRule[]).map(rule => ({
            ...rule,
            getAttrs: (dom: HTMLElement) => {
                const attrs = rule.getAttrs === undefined ? {} : rule.getAttrs(dom);
                if (attrs === false || attrs === null) return attrs;
                const language: unknown = attrs?.language;
                return { ...attrs, language: typeof language === "string" && LANGUAGE.test(language) ? language : "" };
            },
        })),
    };
});

export const articleSchema = [
    articleImageSchema,
    articleLinkSchema,
    articleHTMLSchema,
    articleHeadingSchema,
    articleCodeBlockSchema,
].flat();
