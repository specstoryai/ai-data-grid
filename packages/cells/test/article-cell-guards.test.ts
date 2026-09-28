// Guards for the article editor's defenses (SPST-61). They fail when a Milkdown or ProseMirror
// update, or a change of ours, alters the schema, adds a node view or an event handler, writes
// markup into the page, reintroduces Toast UI, or loosens the URL policy, so that someone has
// to review it. See AS-BUILT's article editor section.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DOMParser as ProseDOMParser, type Node as ProseNode } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import { createArticleEditor } from "../src/cells/article-editor/create-article-editor.js";
import { safeArticleURL } from "../src/cells/article-editor/url-policy.js";
import { drop, installLayoutShims, mount, paste, setPointTarget, spyOnHTMLSinks } from "./article-cell-harness.js";
import { htmlOnlyCodePayload, pastePayloads, renderPayloads } from "./fixtures/article-sanitizer-payloads.mjs";

const CELLS = path.resolve(__dirname, "..");
const ROOT = path.resolve(CELLS, "../..");

beforeAll(installLayoutShims);
afterEach(() => {
    cleanup();
    setPointTarget(() => null);
});

async function withView<T>(run: (view: EditorView) => T): Promise<T> {
    const root = document.createElement("div");
    document.body.append(root);
    const editor = await createArticleEditor({ root, markdown: "text", readonly: false });
    try {
        return run(editor.view);
    } finally {
        await editor.destroy();
        root.remove();
    }
}

// Props through which a plugin sees paste, drop, clipboard or DOM events, or renders nodes.
const WATCHED_PROPS = [
    "clipboardParser",
    "clipboardTextParser",
    "clipboardTextSerializer",
    "domParser",
    "handleClick",
    "handleClickOn",
    "handleDOMEvents",
    "handleDoubleClick",
    "handleDoubleClickOn",
    "handleDrop",
    "handleKeyDown",
    "handleKeyPress",
    "handlePaste",
    "handleScrollToSelection",
    "handleTextInput",
    "handleTripleClick",
    "handleTripleClickOn",
    "markViews",
    "nodeViews",
    "transformCopied",
    "transformPasted",
    "transformPastedHTML",
    "transformPastedText",
];

function watchedProps(props: Record<string, unknown>): string[] {
    return WATCHED_PROPS.filter(name => props[name] !== undefined).map(name =>
        name === "handleDOMEvents"
            ? `handleDOMEvents(${Object.keys(props[name] as object)
                  .sort()
                  .join(",")})`
            : name
    );
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
    });
}

const packageName = (specifier: string) =>
    specifier
        .split("/")
        .slice(0, specifier.startsWith("@") ? 2 : 1)
        .join("/");

describe("L: guards", () => {
    it("L01 the schema: nodes, marks, attributes and parse rules (snapshot)", async () => {
        const { schema, parsed } = await withView(view => {
            // D2's parse rules, run directly on HTML that hasn't been through D3, as the DOM
            // observer does with a native mutation. Each unsafe value is removed by the parse
            // rule itself; each safe value is kept.
            const parse = (html: string) => {
                const dom = document.createElement("div");
                dom.innerHTML = html;
                const found: Record<string, unknown>[] = [];
                ProseDOMParser.fromSchema(view.state.schema)
                    .parse(dom)
                    .descendants((node: ProseNode) => {
                        if (node.type.name === "image") found.push({ image: node.attrs.src });
                        if (node.type.name === "code_block") found.push({ language: node.attrs.language });
                        for (const mark of node.marks) {
                            if (mark.type.name === "link") found.push({ link: mark.attrs.href });
                        }
                    });
                return found;
            };
            const rules = (spec: { parseDOM?: readonly { tag?: string; style?: string }[] }) =>
                (spec.parseDOM ?? []).map(rule => rule.tag ?? `style=${rule.style}`);
            const describeType = (type: { spec: any }) => ({
                attrs: Object.keys(type.spec.attrs ?? {}).sort(),
                parseDOM: rules(type.spec),
                ...(type.spec.code === true ? { code: true } : {}),
            });
            const { nodes, marks } = view.state.schema;
            return {
                schema: {
                    nodes: Object.fromEntries(Object.entries(nodes).map(([name, type]) => [name, describeType(type)])),
                    marks: Object.fromEntries(Object.entries(marks).map(([name, type]) => [name, describeType(type)])),
                },
                parsed: {
                    unsafe: parse(
                        '<p><img src="javascript:void(0)" alt="i"><a href="javascript:void(0)">l</a></p>' +
                            '<pre data-language="x&quot; onmouseover=&quot;y"><code>c</code></pre>'
                    ),
                    safe: parse(
                        '<p><img src="https://example.com/i.png" alt="i"><a href="https://example.com/">l</a></p>' +
                            '<pre data-language="c++"><code>c</code></pre>'
                    ),
                },
            };
        });
        // Raw HTML from the Markdown can never be created from HTML (D2).
        expect(schema.nodes.html.parseDOM).toEqual([]);
        // The image and link parse rules apply D1, and the code-block rule filters the language.
        expect(parsed.unsafe).toEqual([{ image: "" }, { link: "" }, { language: "" }]);
        expect(parsed.safe).toEqual([
            { image: "https://example.com/i.png" },
            { link: "https://example.com/" },
            { language: "c++" },
        ]);
        expect(schema).toMatchSnapshot();
    });

    it("L02 no node views, and the plugins that see paste, drop or DOM events (snapshot)", async () => {
        const handlers = await withView(view => {
            const plugins = view.state.plugins.map(plugin => ({
                key: ((plugin.spec.key as any)?.key ?? "(no key)").replace(/\$\d*$/, ""),
                props: watchedProps(plugin.props as Record<string, unknown>),
            }));
            return {
                view: watchedProps(view.props as unknown as Record<string, unknown>),
                viewNodeViews: Object.keys(view.props.nodeViews ?? {}),
                viewMarkViews: Object.keys(view.props.markViews ?? {}),
                plugins: plugins.filter(p => p.props.length > 0),
            };
        });
        expect(handlers.viewNodeViews).toEqual([]);
        expect(handlers.viewMarkViews).toEqual([]);
        expect(handlers.plugins.filter(p => p.props.some(prop => /nodeViews|markViews/.test(prop)))).toEqual([]);
        expect(handlers).toMatchSnapshot();
    });

    it("L03 no markup reaches a live-document HTML sink across the R, P, D and C corpus", async () => {
        const sinks = spyOnHTMLSinks();
        try {
            for (const p of renderPayloads) {
                for (const readonly of [true, false]) {
                    await mount(`before\n\n${p.markdown}\n\nafter`, { readonly });
                    cleanup();
                }
            }
            for (const p of [...pastePayloads, htmlOnlyCodePayload]) {
                for (const where of ["paragraph", "code block"] as const) {
                    const editor = await mount(where === "paragraph" ? "start" : "```\ncode\n```\n\nafter");
                    await paste(editor.content(), { html: p.html, text: "copied" });
                    await paste(editor.content(), { html: p.html });
                    setPointTarget(() => editor.content().querySelector(where === "paragraph" ? "p" : "pre code"));
                    await drop(editor.content(), { html: p.html, text: "dropped" });
                    await drop(editor.content(), { html: p.html });
                    await editor.save();
                    cleanup();
                }
            }
            expect(sinks.writes()).toEqual([]);
        } finally {
            sinks.restore();
        }
    });

    it("L04 no Toast UI, declared imports only, one Milkdown range, and a DOMPurify floor of 3.4.16", () => {
        const manifest = JSON.parse(readFileSync(path.join(CELLS, "package.json"), "utf8"));
        const lockfile = readFileSync(path.join(ROOT, "package-lock.json"), "utf8");
        // Stories are Storybook-only: the build excludes them, and they use devDependencies.
        const files = sourceFiles(path.join(CELLS, "src")).filter(file => !/\.stories\.tsx$/.test(file));
        expect(JSON.stringify(manifest)).not.toMatch(/@toast-ui/);
        expect(lockfile).not.toMatch(/@toast-ui/);
        const imported = new Set<string>();
        for (const file of files) {
            const text = readFileSync(file, "utf8");
            expect(text, path.relative(CELLS, file)).not.toMatch(/@toast-ui|toastui/i);
            // Imports and re-exports with `from`, side-effect imports, and dynamic imports.
            const statements =
                /(?:^|\n)\s*(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']/g;
            for (const [, from, sideEffect, dynamic] of text.matchAll(statements)) {
                const specifier = from ?? sideEffect ?? dynamic;
                if (!specifier.startsWith(".")) imported.add(packageName(specifier));
            }
        }
        const declared = { ...manifest.dependencies, ...manifest.peerDependencies };
        // Every bare import of the source is a declared dependency...
        for (const name of imported) expect(declared, name).toHaveProperty([name]);
        // ...ProseMirror comes only through @milkdown/prose...
        expect([...imported].filter(name => name.startsWith("prosemirror-"))).toEqual([]);
        expect(Object.keys(declared).filter(name => name.startsWith("prosemirror-"))).toEqual([]);
        // ...every declared @milkdown package is imported, and all share one ~ range.
        const milkdown = Object.keys(manifest.dependencies).filter(name => name.startsWith("@milkdown/"));
        expect(milkdown.filter(name => !imported.has(name))).toEqual([]);
        expect(new Set(milkdown.map(name => manifest.dependencies[name])).size).toBe(1);
        expect(manifest.dependencies[milkdown[0]]).toMatch(/^~7\.\d+\.\d+$/);
        const floor = /^\^3\.(\d+)\.(\d+)$/.exec(manifest.dependencies.dompurify);
        expect(floor, manifest.dependencies.dompurify).not.toBeNull();
        const [minor, patch] = [Number(floor![1]), Number(floor![2])];
        expect(minor > 4 || (minor === 4 && patch >= 16)).toBe(true);
        expect(Object.keys(manifest.exports)).toEqual([".", "./dist/index.css"]);
    });

    it("L05 the URL policy (D1)", () => {
        const png =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
        const table: [tag: "a" | "img", attr: "href" | "src", value: unknown, allowed: boolean][] = [
            ["a", "href", "https://example.com/a?b=c#d", true],
            ["a", "href", "http://example.com/", true],
            ["a", "href", "mailto:someone@example.com", true],
            ["a", "href", "tel:+15555550100", true],
            ["a", "href", "docs/page.html", true],
            ["a", "href", "/absolute/path", true],
            ["a", "href", "#section", true],
            ["a", "href", "?query=1", true],
            ["a", "href", "javascript:alert(1)", false],
            ["a", "href", "JaVaScRiPt:alert(1)", false],
            ["a", "href", " javascript:alert(1)", false],
            ["a", "href", "jav\tascript:alert(1)", false],
            ["a", "href", "java\nscript:alert(1)", false],
            ["a", "href", "\u0001javascript:alert(1)", false],
            ["a", "href", "vbscript:msgbox(1)", false],
            ["a", "href", "data:text/html;base64,PHNjcmlwdD4=", false],
            ["a", "href", png, false],
            ["img", "src", "https://example.com/i.png", true],
            ["img", "src", "images/i.png", true],
            ["img", "src", png, true],
            ["img", "src", "javascript:alert(1)", false],
            ["img", "src", "vbscript:msgbox(1)", false],
            ["img", "src", "", false],
            ["img", "src", undefined, false],
            ["img", "src", null, false],
        ];
        for (const [tag, attr, value, allowed] of table) {
            expect(safeArticleURL(tag, attr, value), `${tag}[${attr}=${JSON.stringify(value)}]`).toBe(
                allowed ? value : ""
            );
        }
    });
});
