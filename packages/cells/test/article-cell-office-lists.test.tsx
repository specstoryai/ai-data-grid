// Office list paste tests (SPST-66). Word and Outlook desktop put list items on the clipboard
// as paragraphs styled `mso-list: …`; `convertOfficeLists` turns them into real lists before
// D3. These tests paste the synthetic fixtures in fixtures/office-clipboard.mjs into the real
// editor (real Milkdown and DOMPurify, in jsdom) through ArticleCell's public provideEditor
// API, check the list structure and the saved GFM, and check that every defense still applies
// to converted content. scripts/check-article-cell-sanitizer.mjs runs the Office rows in
// Chromium, Firefox and WebKit.
//
// Groups: conversion (O01–O13, O27–O31, O33), left unchanged (O14–O16), security (O17–O20),
// robustness (O21–O26, O32) and the image flavor next to a copied list or picture (O34–O39).
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createArticleEditor } from "../src/cells/article-editor/create-article-editor.js";
import { convertOfficeLists } from "../src/cells/article-editor/office-lists.js";
import {
    drop,
    installLayoutShims,
    mount,
    type Mounted,
    paste,
    pngFile,
    setPointTarget,
    spyOnHTMLSinks,
    UNSAFE_SAVED,
} from "./article-cell-harness.js";
import {
    browserPictureHTML,
    largeOfficeList,
    longMarkerOfficeList,
    malformedOffice,
    noncanonicalHTML,
    noncanonicalMentionsMsoList,
    officeBullets,
    officeBulletsSaved,
    officeContinuation,
    officeContinuationNested,
    officeFormats,
    officeFragment,
    officeHeadings,
    officeHostile,
    officeJump,
    officeListItem,
    officeMarkerShapes,
    officeMarkerShapesFragment,
    officeMismatched,
    officeMixed,
    officeMixedMalformed,
    officeMixedSaved,
    officeNestedStart,
    officeNestedStartSaved,
    officeNoIgnore,
    officeNoIgnoreMixed,
    officeNoIgnoreMixedSaved,
    officeNumbers,
    officeNumbersSaved,
    officeOutline,
    officeOutlineFragment,
    officeOutlineSaved,
    officeOutlook,
    officePictureBullets,
    officeReordered,
    officeRestart,
    officeStaircase,
    officeStartsDeep,
    officeTable,
    officeTypedText,
    officeTypedTextSaved,
    officeWebKitBullets,
    officeWebKitNumbers,
    outlookWebLists,
    oversizedOfficeList,
    textMentionsMsoList,
    wordPictureHTML,
    wordWebLists,
} from "./fixtures/office-clipboard.mjs";
import {
    findDangerousDOM,
    htmlOnlyCodePayload,
    normalPasteHTML,
    pastePayloads,
} from "./fixtures/article-sanitizer-payloads.mjs";

beforeAll(installLayoutShims);
afterEach(() => {
    cleanup();
    setPointTarget(() => null);
    delete (window as any).__xss;
});

const CODE_DOC = "```\ncode\n```\n\nafter";

/** Pastes (or drops) `html` into an empty editor with the L03 sink spy on. */
async function pasteOffice(
    html: string | undefined,
    { text = "plain", how = "paste", files }: { text?: string; how?: string; files?: readonly File[] } = {}
) {
    const editor = await mount("");
    const sinks = spyOnHTMLSinks();
    try {
        if (how === "drop") {
            setPointTarget(() => editor.content().querySelector("p"));
            const event = await drop(editor.content(), { html, text, files });
            expect(event.defaultPrevented).toBe(true);
        } else {
            const event = await paste(editor.content(), { html, text, files });
            expect(event.defaultPrevented).toBe(true);
        }
        expect(sinks.writes()).toEqual([]);
    } finally {
        sinks.restore();
    }
    return editor;
}

/**
 * The document's list items in order, one line each: indentation for the depth, the list's
 * tag, `@start` on the first item of a list that doesn't start at 1, and the item's first
 * paragraph.
 */
function outline(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll("li")).map(li => {
        const list = li.parentElement!;
        let depth = 0;
        for (let el: Element | null = list; el !== null && el !== root; el = el.parentElement) {
            if (el.localName === "ul" || el.localName === "ol") depth++;
        }
        const start = list.getAttribute("start");
        const at = li === list.firstElementChild && start !== null && start !== "1" ? `@${start}` : "";
        return `${"  ".repeat(depth - 1)}${list.localName}${at} ${li.querySelector("p")?.textContent ?? ""}`;
    });
}

// An item that still starts with its marker or Word's spacing after the marker.
const MARKER_START = /^(?:\s|[·o§•▪Øü*-](?:\s|$)|\(?(?:\d{1,9}|[a-z]{1,8}|[A-Z]{1,8})[.)](?:\s|$))/u;

/** Loads `markdown` into a fresh editor: the lists it reloads as, and its Markdown saved again. */
async function reload(markdown: string): Promise<{ outline: string[]; markdown: string }> {
    const root = document.createElement("div");
    document.body.append(root);
    const editor = await createArticleEditor({ root, markdown, readonly: false });
    try {
        return { outline: outline(root), markdown: editor.serialize() };
    } finally {
        await editor.destroy();
        root.remove();
    }
}

/**
 * The checks every conversion test makes: structure, no markers, the exact saved GFM, and that
 * the saved GFM reloads as the same lists and saves again unchanged.
 */
async function expectConverted(editor: Mounted, lines: readonly string[], saved: string) {
    expect(outline(editor.content())).toEqual(lines);
    const firsts = Array.from(editor.content().querySelectorAll("li")).map(li => li.querySelector("p")?.textContent);
    expect(firsts.filter(text => text === undefined || MARKER_START.test(text))).toEqual([]);
    expect(findDangerousDOM(editor.container)).toEqual([]);
    expect(await editor.save()).toBe(saved);
    expect(await reload(saved)).toEqual({ outline: lines, markdown: saved });
}

const BULLETS = ["ul Apples", "  ul Green", "    ul Granny Smith", "  ul Red", "ul Pears"];
const NUMBERS = ["ol First step", "  ol Sub step a", "  ol Sub step b", "    ol Deep i", "ol Second step"];

describe("O: Office lists become lists", () => {
    it("O01 bullets on three levels (Symbol, Courier New and Wingdings markers)", async () => {
        await expectConverted(await pasteOffice(officeBullets), BULLETS, officeBulletsSaved);
    });

    it("O02 numbers with lower-alpha and lower-roman sub-levels", async () => {
        await expectConverted(await pasteOffice(officeNumbers), NUMBERS, officeNumbersSaved);
    });

    it("O03 mixed numbered and bullet lists, with the paragraphs around them kept", async () => {
        const editor = await pasteOffice(officeMixed);
        const children = Array.from(editor.content().children).map(el => el.localName);
        expect(children).toEqual(["p", "ol", "p", "ul", "p"]);
        await expectConverted(
            editor,
            [
                "ol Numbered one",
                "  ul Bullet under one",
                "ol Numbered two",
                "ul Bullet one",
                "  ol Numbered under bullet",
                "  ol Second under bullet",
                "ul Bullet two",
            ],
            officeMixedSaved
        );
    });

    it("O04 a continuation paragraph stays in its item", async () => {
        const editor = await pasteOffice(officeContinuation);
        const second = editor.content().querySelectorAll("li")[1];
        expect(Array.from(second.querySelectorAll("p")).map(p => p.textContent)).toEqual([
            "Numbered two",
            "Second paragraph of two",
        ]);
        await expectConverted(
            editor,
            ["ol Numbered one", "ol Numbered two", "ol Numbered three"],
            "1. Numbered one\n2. Numbered two\n\n   Second paragraph of two\n3. Numbered three\n"
        );
    });

    it("O05 the start number is kept, a new lfo restarts, and another list id starts another list", async () => {
        const editor = await pasteOffice(officeRestart);
        expect(editor.content().querySelectorAll(":scope > ol")).toHaveLength(3);
        await expectConverted(
            editor,
            [
                "ol@3 Copied from item three",
                "ol Item four",
                "ol Restarted one",
                "ol Restarted two",
                "ol Other list one",
            ],
            "3. Copied from item three\n4. Item four\n\n1) Restarted one\n2) Restarted two\n\n1. Other list one\n"
        );
    });

    it("O06 upper-alpha, upper-roman and leading-zero lists become numbers that keep their position", async () => {
        await expectConverted(
            await pasteOffice(officeFormats),
            ["ol@3 Letter C", "ol Letter D", "ol@4 Roman four", "ol Roman five", "ol Zero one", "ol Zero two"],
            "3. Letter C\n4. Letter D\n\nRoman\n\n4. Roman four\n5. Roman five\n\nZero\n\n1. Zero one\n2. Zero two\n"
        );
    });

    it("O07 picture bullets and unmarked levels become bullets, and no image is inserted", async () => {
        const editor = await pasteOffice(officePictureBullets);
        expect(editor.content().querySelector("img")).toBeNull();
        await expectConverted(
            editor,
            ["ul Picture one", "ul Picture two", "ul Unmarked one", "ul Unmarked two"],
            "* Picture one\n* Picture two\n\nNo marker\n\n* Unmarked one\n* Unmarked two\n"
        );
    });

    it("O08 without @list rules, the types come from the markers", async () => {
        await expectConverted(
            await pasteOffice(officeFragment),
            [
                "ul Dot one",
                "  ul Circle two",
                "    ul Square three",
                "ul Dot four",
                "ol@3 Three",
                "ol Four",
                "ol Letter b",
                "ol Letter c",
            ],
            "* Dot one\n  * Circle two\n    * Square three\n* Dot four\n\nThen numbers\n\n3. Three\n4. Four\n\n" +
                "Then letters\n\n1. Letter b\n2. Letter c\n"
        );
    });

    it("O09 the WebKit-preserved shape converts the same as O01 and O02", async () => {
        await expectConverted(await pasteOffice(officeWebKitBullets), BULLETS, officeBulletsSaved);
        cleanup();
        await expectConverted(await pasteOffice(officeWebKitNumbers), NUMBERS, officeNumbersSaved);
    });

    it("O10 the Outlook desktop shape (MsoNormal paragraphs, <!--[if !supportLists]--> comments)", async () => {
        await expectConverted(
            await pasteOffice(officeOutlook),
            ["ul Agenda item", "  ul Detail", "ul Second agenda item", "ol Open", "ol Close"],
            "Hello team,\n\n* Agenda item\n  * Detail\n* Second agenda item\n\nSteps:\n\n1. Open\n2. Close\n\nThanks\n"
        );
    });

    it("O11 list paragraphs in a table cell are left as they are, and the table keeps its cells", async () => {
        // A GFM table cell can't hold a list: ProseMirror would move a converted list, and the
        // rest of the table's content, out of the table. So the converter leaves them alone.
        expect(convertOfficeLists(officeTable)).toBe(officeTable);
        const editor = await pasteOffice(officeTable);
        const cells = Array.from(editor.content().querySelectorAll("table td, table th")).map(c => c.textContent);
        expect(cells.some(text => text?.includes("Cell bullet one"))).toBe(true);
        expect(cells.some(text => text?.includes("Plain cell"))).toBe(true);
        expect(editor.content().querySelector("ul, ol")).toBeNull();
    });

    it("O12 list paragraphs without an Ignore span stay as they are, with their typed markers", async () => {
        // Word and Outlook desktop write every marker in an Ignore span, so a paragraph without
        // one isn't a list paragraph (N1). It reaches D3 as the same string, so the paste and
        // its saved GFM are what they were before SPST-66, a bold `3.` included.
        expect(convertOfficeLists(officeNoIgnore)).toBe(officeNoIgnore);
        const editor = await pasteOffice(officeNoIgnore);
        expect(editor.content().querySelector("ul, ol")).toBeNull();
        expect(editor.content().querySelector("strong")?.textContent).toBe("3.");
        expect(await editor.save()).toBe(
            "1.\u00a0\u00a0Typed number\n\n(2)\u00a0Bracketed number\n\n**3.** Bold number\n\nPlain words stay\n"
        );
    });

    it("O13 dropping Office HTML onto an empty paragraph converts it the same way", async () => {
        await expectConverted(await pasteOffice(officeBullets, { how: "drop" }), BULLETS, officeBulletsSaved);
    });

    it("O27 a sub-list that doesn't start at 1 keeps its nesting and start number after Save", async () => {
        // CommonMark only lets a list that starts at 1 interrupt a paragraph, so the saved GFM
        // needs a blank line before such a sub-list, or it reloads as the parent item's text.
        const lines = [
            "ol Parent one",
            "  ol@3 Sub three",
            "  ol Sub four",
            "ol Parent two",
            "ul Bullet parent",
            "  ol@3 Numbered three",
            "  ol Numbered four",
            "ul Bullet after",
            "ol Lettered parent",
            "  ol@3 Letter c",
            "ol After letters",
        ];
        await expectConverted(await pasteOffice(officeNestedStart), lines, officeNestedStartSaved);
    });

    it("O28 an item with a continuation paragraph and a sub-list saves stable GFM", async () => {
        await expectConverted(
            await pasteOffice(officeContinuationNested),
            ["ol Numbered one", "  ol Sub a", "ol Numbered two"],
            "1. Numbered one\n\n   More about one\n\n   1. Sub a\n2. Numbered two\n"
        );
    });

    it("O29 typed text without an Ignore span is kept, and the paragraph ends the run", async () => {
        // Typed text that looks like a marker, under every kind of level rule, including the
        // marker each level displays: none of it is a list paragraph (N1), so it all stays.
        expect(convertOfficeLists(officeTypedText)).toBe(officeTypedText);
        const editor = await pasteOffice(officeTypedText);
        expect(editor.content().querySelector("ul, ol")).toBeNull();
        expect(await editor.save()).toBe(officeTypedTextSaved);
        cleanup();
        // Between list items with Ignore spans, such paragraphs end the list and stay as they
        // are; the list after them resumes at its marker's number.
        const lines = ["ol One", "ol Two", "ol@4 Four"];
        const mixed = await pasteOffice(officeNoIgnoreMixed);
        expect(Array.from(mixed.content().children).map(el => el.localName)).toEqual(["ol", "p", "p", "ol"]);
        expect(mixed.content().querySelector(":scope > p strong")?.textContent).toBe("3.");
        await expectConverted(mixed, lines, officeNoIgnoreMixedSaved);
    });

    it("O30 outline numbers (`1.3.`) start their sub-list at their final part, with and without @list rules", async () => {
        const decimal = [
            "ol Chapter one",
            "  ol@3 Section three",
            "  ol Section four",
            "ol Chapter two",
            "  ol Section two one",
            "  ol Section two two",
            "ol Chapter three",
            "  ol@5 Section five",
            "  ol Section six",
        ];
        await expectConverted(
            await pasteOffice(officeOutline),
            [...decimal, "ol Lettered parent", "  ol@3 Letter c", "  ol Letter d"],
            officeOutlineSaved
        );
        cleanup();
        await expectConverted(
            await pasteOffice(officeOutlineFragment),
            decimal,
            officeOutlineSaved.slice(0, officeOutlineSaved.indexOf("\nLettered"))
        );
    });

    it("O31 level texts around the number, bare numbers, ordinals and text on a level with no number", async () => {
        // `Article 3.` and `Step 2:` keep their numbers (not their words: a GFM marker is only a
        // number). Text on a level with no number stays in the item.
        await expectConverted(
            await pasteOffice(officeMarkerShapes),
            [
                "ol@3 Third article",
                "ol Fourth article",
                "ol@2 Second step",
                "ol Third step",
                "ol@3 Bare three",
                "ol Bare four",
                "ol@2 Second place",
                "ol Third place",
                "ol@4 Roman four",
                "ol Roman five",
                "ul Note: Remember this",
                "ul Note: And this",
            ],
            "3. Third article\n4. Fourth article\n\n2) Second step\n3) Third step\n\n3. Bare three\n4. Bare four\n\n" +
                "2) Second place\n3) Third place\n\n4. Roman four\n5. Roman five\n\n* Note: Remember this\n* Note: And this\n"
        );
        cleanup();
        // Without rules, a number in the marker, or an outline part before its final letter
        // (`1.a`), makes it a numbered item; a letter alone (`o`) is a bullet glyph.
        await expectConverted(
            await pasteOffice(officeMarkerShapesFragment),
            [
                "ol@3 Third article",
                "ol Fourth article",
                "ol@2 Second step",
                "ol Third step",
                "ol@3 Bare three",
                "ol Bare four",
                "ol@3 Outline three",
                "ol Outline four",
                "ol Outline a",
                "ol Outline b",
                "ul Circle bullet",
            ],
            "3. Third article\n4. Fourth article\n\n2) Second step\n3) Third step\n\n3. Bare three\n4. Bare four\n\n" +
                "3) Outline three\n4) Outline four\n\n1. Outline a\n2. Outline b\n\n* Circle bullet\n"
        );
    });

    it("O33 a list style with its tokens in another order (`level1 l0 lfo1`) converts the same", async () => {
        // No declaration starts with the list id, which the raw pre-scan must still count.
        expect(officeReordered).not.toMatch(/mso-list\s*:\s*l\d/i);
        await expectConverted(await pasteOffice(officeReordered), BULLETS, officeBulletsSaved);
    });
});

describe("O: left unchanged", () => {
    it("O14 numbered headings stay headings with their number as text", async () => {
        expect(convertOfficeLists(officeHeadings)).toBe(officeHeadings);
        const editor = await pasteOffice(officeHeadings);
        expect(editor.content().querySelector("h1")?.textContent).toMatch(/^1\.\s+Numbered heading$/);
        expect(editor.content().querySelector("ul, ol")).toBeNull();
    });

    it("O15 input that isn't an Office list reaches D3 as the same string", () => {
        const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
        try {
            // P05 is left out: it's an Office list paragraph itself (O17 covers it in a list).
            const inputs = [
                ...pastePayloads.filter(p => p.id !== "P05").map(p => p.html),
                htmlOnlyCodePayload.html,
                normalPasteHTML,
                outlookWebLists,
                wordWebLists,
                "",
            ];
            for (const html of inputs) expect(convertOfficeLists(html)).toBe(html);
            // Without the signal, nothing is parsed.
            expect(parse).not.toHaveBeenCalled();
            // A page whose text mentions the style is parsed, finds no list paragraph, and is
            // returned as is: the input string, not the parsed document serialized again.
            for (const html of [textMentionsMsoList, noncanonicalHTML, noncanonicalMentionsMsoList]) {
                expect(convertOfficeLists(html)).toBe(html);
            }
            expect(parse).toHaveBeenCalledTimes(2);
            const serialized = (html: string) => new DOMParser().parseFromString(html, "text/html").body.innerHTML;
            expect(serialized(noncanonicalHTML)).not.toBe(noncanonicalHTML);
            expect(serialized(noncanonicalMentionsMsoList)).not.toBe(noncanonicalMentionsMsoList);
        } finally {
            parse.mockRestore();
        }
    });

    it("O16 real lists from Outlook and Word on the web paste as they did", async () => {
        const outlook = await pasteOffice(outlookWebLists);
        expect(outline(outlook.content())).toEqual([
            "ul Web bullet one",
            "  ul Web nested bullet",
            "ul Web bullet two",
            "ol Web number one",
            "  ol Web nested number",
            "ol Web number two",
        ]);
        cleanup();
        // Word for the web's one-item lists stay one-item lists (out of SPST-66's scope).
        const word = await pasteOffice(wordWebLists);
        expect(outline(word.content())).toEqual(["ul Online one", "ul Online nested", "ol Online number"]);
    });
});

describe("O: security", () => {
    it.each(pastePayloads.map(p => [p.id, p.name, p.html, p.drop === true]))(
        "O17 %s inside an Office list item: %s",
        async (id, _name, html, isDrop) => {
            const editor = await pasteOffice(officeListItem(html), { how: isDrop ? "drop" : "paste" });
            expect(editor.content().querySelector("ul > li")).not.toBeNull();
            expect(editor.content().textContent).toContain(`paste-${id}`);
            expect(editor.content().textContent).toContain("Office item after");
            expect(findDangerousDOM(editor.container)).toEqual([]);
            expect(editor.content().querySelector('span[data-type="html"]')).toBeNull();
            const saved = await editor.save();
            expect(saved).not.toMatch(UNSAFE_SAVED);
            if (id === "P11") expect(saved).not.toMatch(/<img/i);
            expect((window as any).__xss).toBeUndefined();
        }
    );

    it("O18 an Office paste into a code block inserts only its text/plain flavor", async () => {
        const editor = await mount(CODE_DOC);
        const before = editor.content().querySelectorAll("p, li, ul, ol").length;
        await paste(editor.content(), { html: officeBullets, text: "plain-O18" });
        expect(editor.content().querySelector("pre code")?.textContent).toBe("plain-O18code");
        expect(editor.content().querySelectorAll("p, li, ul, ol")).toHaveLength(before);
        expect(await editor.save()).toBe("```\nplain-O18code\n```\n\nafter\n");
    });

    it("O19 an HTML-only Office paste into a code block changes nothing (A1)", async () => {
        const editor = await mount(CODE_DOC);
        const before = editor.content().innerHTML;
        const event = await paste(editor.content(), { html: officeMixed });
        expect(event.defaultPrevented).toBe(true);
        expect(editor.content().innerHTML).toBe(before);
        expect(await editor.save()).toBe(CODE_DOC);
    });

    it("O20 an HTML-only Office drop onto a code block changes nothing (A1)", async () => {
        const editor = await mount(CODE_DOC);
        const before = editor.content().innerHTML;
        setPointTarget(() => editor.content().querySelector("pre code"));
        const event = await drop(editor.content().querySelector("pre code")!, { html: officeMixed });
        expect(event.defaultPrevented).toBe(true);
        expect(editor.content().innerHTML).toBe(before);
        expect(await editor.save()).toBe(CODE_DOC);
    });
});

describe("O: robustness", () => {
    it("O21 malformed list paragraphs are returned unchanged and paste as paragraphs", async () => {
        for (const { name, html } of malformedOffice) {
            expect(convertOfficeLists(html), name).toBe(html);
            const editor = await pasteOffice(html);
            expect(editor.content().querySelector("ul, ol"), name).toBeNull();
            expect(editor.content().textContent, name).toContain("Malformed two");
            cleanup();
        }
    });

    it("O22 a malformed paragraph between valid ones ends the run and stays a paragraph", async () => {
        const editor = await pasteOffice(officeMixedMalformed);
        expect(outline(editor.content())).toEqual(["ul Valid one", "ul Valid two"]);
        expect(Array.from(editor.content().children).map(el => el.localName)).toEqual(["ul", "p", "ul"]);
        expect(editor.content().querySelector(":scope > p")?.textContent).toMatch(/^·\s+Broken middle$/);
        expect(await editor.save()).toMatch(/^\* Valid one\n\n·\s+Broken middle\n\n\* Valid two\n$/);
    });

    it("O23 nesting grows by at most one level per item and never exceeds 9", async () => {
        const depths = (lines: string[]) => lines.map(line => line.search(/\S/) / 2 + 1);
        const cases = [
            {
                html: officeStaircase,
                lines: Array.from({ length: 9 }, (_, i) => `${"  ".repeat(i)}ul Stair ${i + 1}`),
            },
            { html: officeJump, lines: ["ul Ground", "  ul Sky one", "  ul Sky two", "ul Ground again"] },
            { html: officeStartsDeep, lines: ["ol@3 Deep start", "  ol Deeper", "ol Deep again"] },
        ];
        for (const { html, lines } of cases) {
            const editor = await pasteOffice(html);
            const found = outline(editor.content());
            expect(found).toEqual(lines);
            const levels = depths(found);
            expect(Math.max(...levels)).toBeLessThanOrEqual(9);
            levels.forEach((depth, i) => expect(depth - (i === 0 ? 0 : levels[i - 1])).toBeLessThanOrEqual(1));
            const saved = (await editor.save())!;
            expect(await reload(saved)).toEqual({ outline: lines, markdown: saved });
            cleanup();
        }
        // A deep staircase repeated: the converter's own output never nests deeper than 9.
        const doc = new DOMParser().parseFromString(
            convertOfficeLists(largeOfficeList(90, { deep: true })),
            "text/html"
        );
        expect(doc.querySelector(Array(10).fill("ul").join(" "))).toBeNull();
        expect(doc.querySelector(Array(9).fill("ul").join(" "))).not.toBeNull();
    });

    it("O24 mismatched list ids and missing @list rules give separate lists, typed by their markers", async () => {
        const editor = await pasteOffice(officeMismatched);
        expect(outline(editor.content())).toEqual([
            "ul List zero",
            "ul List three",
            "ul List zero again",
            "  ol No rule, lettered",
            "  ul No rule, circle",
        ]);
        expect(editor.content().querySelectorAll(":scope > ul")).toHaveLength(3);
        expect(await editor.save()).toBe(
            "* List zero\n\n- List three\n\n* List zero again\n  1. No rule, lettered\n  * No rule, circle\n"
        );
    });

    it("O25 the caps: 10,000 items convert in bounded time; more items or longer HTML are returned unchanged", () => {
        // Real timers: the config fakes `performance` whenever fake timers are on.
        vi.useRealTimers();
        const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
        try {
            const largest = largeOfficeList(10_000, { deep: true });
            const started = performance.now();
            const converted = convertOfficeLists(largest);
            const elapsed = performance.now() - started;
            expect(converted.match(/<li>/g)).toHaveLength(10_000);
            // A guard against quadratic work, not a speed test (about 1–2 s in jsdom).
            expect(elapsed).toBeLessThan(10_000);
            expect(parse).toHaveBeenCalledTimes(1);
            parse.mockClear();
            const tooMany = largeOfficeList(10_001);
            expect(convertOfficeLists(tooMany)).toBe(tooMany);
            const tooLong = oversizedOfficeList();
            expect(tooLong.length).toBeGreaterThan(4_000_000);
            expect(convertOfficeLists(tooLong)).toBe(tooLong);
            expect(parse).not.toHaveBeenCalled();
        } finally {
            parse.mockRestore();
        }
    }, 60_000);

    it("O32 4,000-character markers are read in linear time, and typed ones aren't list paragraphs", () => {
        // Real timers: the config fakes `performance` whenever fake timers are on.
        vi.useRealTimers();
        const html = longMarkerOfficeList(800);
        expect(html.length).toBeLessThan(4_000_000);
        const started = performance.now();
        const converted = convertOfficeLists(html);
        const elapsed = performance.now() - started;
        expect(converted.match(/<li>/g)).toHaveLength(400);
        // The 400 paragraphs with typed markers have no Ignore span, so they stay as they are.
        expect(
            converted.match(/<p class="MsoListParagraphCxSpMiddle" style="mso-list:l\d+ level1 lfo2">/g)
        ).toHaveLength(400);
        expect(converted.match(/&nbsp;Long \d+/g)).toHaveLength(400);
        // A guard against superlinear marker parsing, not a speed test (well under 1 s each way).
        expect(elapsed).toBeLessThan(10_000);
    }, 60_000);

    it("O26 when parsing throws, the input is returned unchanged and the paste lands as paragraphs", async () => {
        // Only the converter's call throws (as under a Trusted Types policy); D3's DOMPurify,
        // which runs after it, parses as usual.
        const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
        const fail = () => {
            throw new TypeError("This document requires 'TrustedHTML' assignment.");
        };
        try {
            parse.mockImplementationOnce(fail);
            expect(convertOfficeLists(officeBullets)).toBe(officeBullets);
            parse.mockImplementationOnce(fail);
            const editor = await pasteOffice(officeBullets);
            expect(parse.mock.results[1].type).toBe("throw");
            expect(editor.content().querySelector("ul, ol")).toBeNull();
            expect(editor.content().textContent).toContain("Granny Smith");
        } finally {
            parse.mockRestore();
        }
    });
});

// Word, notably on macOS, puts an image file on the clipboard next to the HTML and text of a
// copied list. A clipboard with text/plain text is parsed as text; one without stays an image.
describe("O: image flavor", () => {
    const DATA_IMAGE = 'img[src^="data:image/png;base64,"]';
    const settle = () => new Promise(resolve => setTimeout(resolve, 50));

    async function expectImage(editor: Mounted) {
        await waitFor(() => expect(editor.content().querySelector(DATA_IMAGE)).not.toBeNull());
        expect(await editor.save()).toMatch(/^!\[pic\.png\]\(data:image\/png;base64,[^)]*\)\n$/);
    }

    it.each(["paste", "drop"])("O34 an Office list with an image file %s becomes the list", async how => {
        // Text next to an object placeholder (U+FFFC) is still text.
        for (const text of ["Apples", "Apples \uFFFC"]) {
            const editor = await pasteOffice(officeBullets, { text, how, files: [pngFile("pic.png")] });
            await settle();
            expect(editor.content().querySelector("img")).toBeNull();
            await expectConverted(editor, BULLETS, officeBulletsSaved);
            cleanup();
        }
    });

    it.each(["paste", "drop"])(
        "O35 whitespace-only HTML or text/plain with an image file %s becomes the image",
        async how => {
            for (const [html, text] of [
                [" \n", ""],
                ["", " \r\n"],
                [" ", "\t"],
            ]) {
                await expectImage(await pasteOffice(html, { text, how, files: [pngFile("pic.png")] }));
                cleanup();
            }
        }
    );

    it.each(["paste", "drop"])(
        "O36 a picture copied in a browser (remote <img>, no text/plain) %s becomes the image file",
        async how => {
            const editor = await pasteOffice(browserPictureHTML, { text: "", how, files: [pngFile("pic.png")] });
            await expectImage(editor);
            expect(editor.content().querySelector('img[src^="https:"]')).toBeNull();
        }
    );

    it.each(["paste", "drop"])(
        "O37 a picture copied from Word (file: <img>, empty, whitespace or U+FFFC text/plain) %s becomes the image file",
        async how => {
            // macOS writes U+FFFC (OBJECT REPLACEMENT CHARACTER) into plain text for an embedded picture.
            for (const text of ["", "\r\n", "\uFFFC", "\uFFFC\r\n"]) {
                await expectImage(await pasteOffice(wordPictureHTML, { text, how, files: [pngFile("pic.png")] }));
                cleanup();
            }
        }
    );

    it.each(["paste", "drop"])(
        "O38 an Office list with an image file %s into a code block inserts only its text/plain (A1)",
        async how => {
            const editor = await mount(CODE_DOC);
            const before = editor.content().querySelectorAll("p, li, ul, ol").length;
            const data = { html: officeBullets, text: "plain-O38", files: [pngFile("pic.png")] };
            if (how === "drop") {
                setPointTarget(() => editor.content().querySelector("pre code"));
                await drop(editor.content().querySelector("pre code")!, data);
            } else {
                await paste(editor.content(), data);
            }
            await settle();
            expect(editor.content().querySelector("pre code")?.textContent).toBe("plain-O38code");
            expect(editor.content().querySelectorAll("p, li, ul, ol")).toHaveLength(before);
            expect(editor.content().querySelector("img")).toBeNull();
            expect(await editor.save()).toBe("```\nplain-O38code\n```\n\nafter\n");
        }
    );

    it.each(["paste", "drop"])(
        "O39 hostile Office HTML with an image file %s is still neutralized (D1–D3)",
        async how => {
            const editor = await pasteOffice(officeHostile, {
                text: "office-hostile",
                how,
                files: [pngFile("pic.png")],
            });
            await settle();
            expect(editor.content().querySelector("ul > li")).not.toBeNull();
            expect(editor.content().textContent).toContain("office-hostile-end");
            expect(editor.content().querySelector(DATA_IMAGE)).toBeNull();
            expect(findDangerousDOM(editor.container)).toEqual([]);
            expect(editor.content().querySelector('span[data-type="html"]')).toBeNull();
            expect(await editor.save()).not.toMatch(UNSAFE_SAVED);
            expect((window as any).__xss).toBeUndefined();
        }
    );
});
