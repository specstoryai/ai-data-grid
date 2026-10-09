// Office list paste for the article editor (SPST-66). Word and Outlook desktop don't put real
// lists on the clipboard: each list item is a `<p>` whose style says `mso-list: lN levelM lfoK`
// (list N, level M, list-format override K), with the bullet or number in a
// `<span style="mso-list: Ignore">`. The bullet and number formats are `@list lN:levelM {…}`
// rules in the clipboard document's `<style>`. `convertOfficeLists` turns those paragraphs into
// `<ul>`/`<ol>`/`<li>` before D3 sanitizes the HTML, because D3 drops `<style>`, and with it the
// `@list` rules.
//
// It only rearranges untrusted HTML; it never decides what's allowed. It parses into an inert
// `DOMParser` document (no browsing context: no script runs and nothing loads), builds with
// that document's own `createElement`, and reads the result back as a string, which D3 then
// sanitizes like any other clipboard HTML. It never touches the page's own document: no element
// of it is created or written to. Input it doesn't recognize, input over the caps below, and
// any exception give back the input string unchanged, so the paste lands as it did before
// SPST-66.
//
// Written from the Office HTML format description. Toast UI's converter isn't ported (it
// parsed into the live document).

/** Clipboard HTML longer than this is returned unchanged, before parsing. */
const MAX_HTML_LENGTH = 4_000_000;
/** More list paragraphs than this (counted on the raw HTML) and the input is returned unchanged. */
const MAX_LIST_PARAGRAPHS = 10_000;
/** Word's deepest list level, and the deepest list this creates. */
const MAX_DEPTH = 9;
/** A paragraph with a longer `style` attribute isn't a list paragraph. */
const MAX_STYLE_LENGTH = 4_000;
/** An `@list` rule with a longer body is ignored. */
const MAX_RULE_LENGTH = 4_000;
/** Only this much `<style>` text is read for `@list` rules. */
const MAX_STYLE_TEXT = 1_000_000;
/** CommonMark allows at most 9 digits in an ordered list's start number. */
const MAX_START = 999_999_999;

const SIGNAL = /mso-list\s*:/i;
// Counts candidate list paragraphs (`mso-list: l<digit>`) without parsing. Linear.
const LIST_STYLE = /mso-list\s*:\s*l\d/gi;
// `@list l<id>:level<n> {body}`. An override rule (`@list l0:level1 lfo2 {…}`) doesn't match.
// The body can't contain a brace, so each character is scanned by at most one rule.
const LIST_RULE = new RegExp(String.raw`@list\s+l(\d{1,5}):level(\d)\s*\{([^{}]{0,${MAX_RULE_LENGTH}})\}`, "gi");
const NUMBER_FORMAT = /mso-level-number-format\s*:\s*([a-z-]{1,40})/i;
const START_AT = /mso-level-start-at\s*:\s*(\d{1,9})(?!\d)/i;
const IGNORE = /mso-list\s*:\s*ignore/i;
const CONTINUATION = /^MsoListParagraphCxSp(?:Middle|Last)$/i;
// `\s` includes the no-break spaces Word puts after a marker.
const SPACE = /^\s*$/;
// A marker typed into the text (no Ignore span): a non-alphanumeric glyph, or a number, letters
// or a roman numeral followed by `.` or `)`, optionally after `(`. It must be followed by space.
const TEXT_MARKER = /^\s*([^\p{L}\p{N}\s]|\(?(?:\d{1,9}|\p{L}{1,8})[.)])\s+/u;
// A marker that numbers an item: `3.`, `b)`, `(iv)`.
const ORDERED_MARKER = /^\(?(\d{1,9}|[a-z]{1,8}|[A-Z]{1,8})[.)]$/;
const HTML_NS = "http://www.w3.org/1999/xhtml";

interface LevelRule {
    readonly format: string | undefined;
    readonly startAt: number | undefined;
}

interface ListItem {
    readonly paragraph: Element;
    readonly id: number;
    readonly lfo: number;
    readonly level: number;
    readonly marker: string;
    readonly continuations: Element[];
}

// The `@list lN:levelM` rules of every `<style>`, keyed "N:M". A Map, so names from the
// clipboard can't reach Object.prototype.
function readListRules(doc: Document): Map<string, LevelRule> {
    const rules = new Map<string, LevelRule>();
    let css = "";
    for (const style of Array.from(doc.querySelectorAll("style"))) {
        css += style.textContent ?? "";
        if (css.length >= MAX_STYLE_TEXT) break;
    }
    for (const [, id, level, body] of css.slice(0, MAX_STYLE_TEXT).matchAll(LIST_RULE)) {
        const start = START_AT.exec(body)?.[1];
        rules.set(`${Number(id)}:${Number(level)}`, {
            format: NUMBER_FORMAT.exec(body)?.[1]?.toLowerCase(),
            startAt: start === undefined ? undefined : Number(start),
        });
    }
    return rules;
}

// The list id, level and override of a list paragraph, or undefined if `p` isn't one. The value
// must be exactly `l<1–5 digits>`, `level<1–9>` and optionally `lfo<1–5 digits>`, in any order.
function readListStyle(p: Element): { id: number; level: number; lfo: number } | undefined {
    const style = p.getAttribute("style");
    if (style === null || style.length > MAX_STYLE_LENGTH) return undefined;
    let value: string | undefined;
    for (const declaration of style.split(";")) {
        const colon = declaration.indexOf(":");
        if (colon !== -1 && declaration.slice(0, colon).trim().toLowerCase() === "mso-list") {
            value = declaration.slice(colon + 1);
        }
    }
    if (value === undefined) return undefined;
    let id: number | undefined;
    let level: number | undefined;
    let lfo: number | undefined;
    for (const token of value.trim().split(/\s+/)) {
        const match = /^(l|level|lfo)(\d+)$/i.exec(token);
        if (match === null) return undefined;
        const [, kind, digits] = match;
        const name = kind.toLowerCase();
        if (name === "l" && id === undefined && digits.length <= 5) id = Number(digits);
        else if (name === "level" && level === undefined && /^[1-9]$/.test(digits)) level = Number(digits);
        else if (name === "lfo" && lfo === undefined && digits.length <= 5) lfo = Number(digits);
        else return undefined;
    }
    if (id === undefined || level === undefined) return undefined;
    return { id, level, lfo: lfo ?? 0 };
}

// Removes the paragraph's marker and returns its text: the `mso-list: Ignore` elements, or
// else a marker at the start of its first text.
function takeMarker(p: Element): string {
    let marker = "";
    let found = false;
    for (const el of Array.from(p.querySelectorAll("[style]"))) {
        // An Ignore element inside one that was already removed.
        if (!p.contains(el) || !IGNORE.test(el.getAttribute("style") ?? "")) continue;
        marker += el.textContent ?? "";
        el.remove();
        found = true;
    }
    if (found) return marker.trim();
    const walker = p.ownerDocument.createTreeWalker(p, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.nodeValue ?? "";
        if (SPACE.test(text)) continue;
        const match = TEXT_MARKER.exec(text);
        if (match === null) return "";
        node.nodeValue = text.slice(match[0].length);
        return match[1];
    }
    return "";
}

// Paragraphs in a table cell stay as they are: a GFM table cell can't hold a list, and
// ProseMirror would move a converted list (and the rest of the table's content) out of the table.
function isListParagraphElement(p: Element): boolean {
    return p.namespaceURI === HTML_NS && p.closest("svg, math, td, th") === null;
}

// The next sibling element of `node`, skipping whitespace text and comments only.
function nextElement(node: Node): Element | null {
    for (let next = node.nextSibling; next !== null; next = next.nextSibling) {
        if (next.nodeType === 1) return next as Element;
        if (next.nodeType === 8) continue;
        if (next.nodeType === 3 && /^[ \t\n\f\r]*$/.test(next.nodeValue ?? "")) continue;
        return null;
    }
    return null;
}

// a…z, then aa…zz and so on, as Word letters its lists.
function letterValue(token: string): number | undefined {
    const lower = token.toLowerCase();
    if (!/^([a-z])\1*$/.test(lower)) return undefined;
    return lower.charCodeAt(0) - 96 + 26 * (lower.length - 1);
}

function romanValue(token: string): number | undefined {
    const digits: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    const lower = token.toLowerCase();
    if (!/^[ivxlcdm]+$/.test(lower)) return undefined;
    let total = 0;
    for (let i = 0; i < lower.length; i++) {
        const value = digits[lower[i]];
        const next = i + 1 < lower.length ? digits[lower[i + 1]] : 0;
        total += value < next ? -value : value;
    }
    return total > 0 ? total : undefined;
}

// Bullet or ordered, and the start number an ordered list would have if `item` started it.
// GFM has no lettered or roman lists, so they become numbers that keep the item's position.
function listKind(item: ListItem, rules: Map<string, LevelRule>): { ordered: boolean; start: number } {
    const rule = rules.get(`${item.id}:${item.level}`);
    const token = ORDERED_MARKER.exec(item.marker)?.[1];
    const ordered =
        rule === undefined
            ? token !== undefined
            : rule.format !== "bullet" && rule.format !== "image" && rule.format !== "none";
    if (!ordered) return { ordered, start: 1 };
    let fromMarker: number | undefined;
    if (token !== undefined) {
        if (/^\d+$/.test(token)) fromMarker = Number(token);
        else if (rule?.format?.startsWith("alpha") === true) fromMarker = letterValue(token);
        else if (rule?.format?.startsWith("roman") === true) fromMarker = romanValue(token);
    }
    const start = fromMarker ?? rule?.startAt ?? 1;
    return { ordered, start: Math.min(Math.max(start, 0), MAX_START) };
}

// Replaces one run of sibling list paragraphs with lists. Nesting follows the Word levels: a
// deeper level nests one list deeper however far it jumps, and a shallower one closes the
// lists nested deeper than it. So a run that starts at level 3 starts at depth 1.
function buildRun(doc: Document, items: readonly ListItem[], rules: Map<string, LevelRule>) {
    const top: Element[] = [];
    // The open lists, outermost first, with the lowest Word level each one holds.
    const open: { list: Element; level: number; key: string; ordered: boolean }[] = [];
    for (const item of items) {
        while (open.length > 1 && open[open.length - 2].level >= item.level) open.pop();
        const { ordered, start } = listKind(item, rules);
        const key = `${item.id}/${item.lfo}`;
        let current: (typeof open)[number] | undefined = open[open.length - 1];
        const deeper = current !== undefined && item.level > current.level && open.length < MAX_DEPTH;
        // At the same depth, a different list, a restart (Word writes a new lfo) or a change of
        // type starts a new list.
        if (current !== undefined && !deeper && (current.key !== key || current.ordered !== ordered)) {
            open.pop();
            current = undefined;
        }
        if (current === undefined || deeper) {
            const list = doc.createElement(ordered ? "ol" : "ul");
            if (ordered && start !== 1) list.setAttribute("start", String(start));
            const parent = open[open.length - 1];
            if (parent === undefined) top.push(list);
            else parent.list.lastElementChild?.append(list);
            current = { list, level: item.level, key, ordered };
            open.push(current);
        }
        current.level = Math.min(current.level, item.level);
        const li = doc.createElement("li");
        for (const source of [item.paragraph, ...item.continuations]) {
            const p = doc.createElement("p");
            p.append(...Array.from(source.childNodes));
            li.append(p);
        }
        current.list.append(li);
    }
    items[0].paragraph.before(...top);
    for (const item of items) {
        item.paragraph.remove();
        for (const continuation of item.continuations) continuation.remove();
    }
}

/**
 * Turns Word and Outlook desktop list paragraphs in clipboard HTML into `<ul>`/`<ol>`/`<li>`.
 * Returns `html` itself when it has no Office list, is over a cap, or can't be converted. Its
 * result is untrusted and must still go through D3.
 */
export function convertOfficeLists(html: string): string {
    try {
        if (html.length > MAX_HTML_LENGTH || !SIGNAL.test(html)) return html;
        let candidates = 0;
        LIST_STYLE.lastIndex = 0;
        while (LIST_STYLE.exec(html) !== null) {
            if (++candidates > MAX_LIST_PARAGRAPHS) return html;
        }
        if (candidates === 0) return html;
        const doc = new DOMParser().parseFromString(html, "text/html");
        const rules = readListRules(doc);
        const runs: ListItem[][] = [];
        let run: ListItem[] = [];
        let last: Element | undefined;
        for (const p of Array.from(doc.body.querySelectorAll("p"))) {
            if (!isListParagraphElement(p)) continue;
            const follows = last !== undefined && nextElement(last) === p;
            const style = readListStyle(p);
            if (style === undefined) {
                // A paragraph that continues the previous item.
                if (follows && !SIGNAL.test(p.getAttribute("style") ?? "") && CONTINUATION.test(p.className.trim())) {
                    run[run.length - 1].continuations.push(p);
                    last = p;
                }
                continue;
            }
            const item: ListItem = { paragraph: p, ...style, marker: takeMarker(p), continuations: [] };
            if (follows) {
                run.push(item);
            } else {
                if (run.length > 0) runs.push(run);
                run = [item];
            }
            last = p;
        }
        if (run.length > 0) runs.push(run);
        if (runs.length === 0) return html;
        for (const items of runs) buildRun(doc, items, rules);
        return doc.body.innerHTML;
    } catch {
        return html;
    }
}
