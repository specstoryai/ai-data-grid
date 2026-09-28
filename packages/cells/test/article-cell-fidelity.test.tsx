// ArticleCell Markdown fidelity tests (SPST-61): the synthetic corpus in
// fixtures/article-markdown-corpus.mjs through the real Milkdown editor. Each document must
// save byte for byte when unchanged, serialize to a fixed point after one round trip, and lose
// no text. F25 and F26 snapshot the serializer's output and the viewer's DOM, so a dependency
// update that changes either fails here until someone reviews the diff.
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createArticleEditor } from "../src/cells/article-editor/create-article-editor.js";
import { CONTENT, installLayoutShims, mount } from "./article-cell-harness.js";
import { markdownCorpus } from "./fixtures/article-markdown-corpus.mjs";

beforeAll(installLayoutShims);
afterEach(cleanup);

// Parses `markdown` into a fresh editor and returns what an edited Save would write, and the
// document's text.
async function roundTrip(markdown: string) {
    const root = document.createElement("div");
    document.body.append(root);
    const editor = await createArticleEditor({ root, markdown, readonly: false });
    try {
        return { markdown: editor.serialize(), text: editor.view.state.doc.textContent };
    } finally {
        await editor.destroy();
        root.remove();
    }
}

describe("F: Markdown fidelity", () => {
    it.each(markdownCorpus.map(d => [d.id, d.name, d.markdown]))("%s %s", async (_id, _name, markdown) => {
        // An unchanged Save returns the input bytes.
        const editor = await mount(markdown);
        expect(await editor.save()).toBe(markdown);
        // serialize∘parse is idempotent: the second pass equals the first...
        const first = await roundTrip(markdown);
        const second = await roundTrip(first.markdown);
        expect(second.markdown).toBe(first.markdown);
        // ...and no text is lost on the way.
        expect(second.text).toBe(first.text);
    });

    it("F25 the edited-save output of the corpus (snapshot)", async () => {
        const output: Record<string, string> = {};
        for (const d of markdownCorpus) output[`${d.id} ${d.name}`] = (await roundTrip(d.markdown)).markdown;
        expect(output).toMatchSnapshot();
    });

    it("F26 the viewer's DOM for the corpus (snapshot)", async () => {
        const output: Record<string, string> = {};
        for (const d of markdownCorpus) {
            const viewer = await mount(d.markdown, { readonly: true });
            output[`${d.id} ${d.name}`] = viewer.container.querySelector(CONTENT)?.innerHTML ?? "";
            cleanup();
        }
        expect(output).toMatchSnapshot();
    });
});
