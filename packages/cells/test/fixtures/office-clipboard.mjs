// Synthetic Office clipboard HTML for ArticleCell's Office list paste (SPST-66). Shared by
// test/article-cell-office-lists.test.tsx, test/article-cell-guards.test.ts (L03, L06) and
// scripts/check-article-cell-sanitizer.mjs (Chromium, Firefox and WebKit).
//
// Every fixture is written by hand, modeled on the documented Office HTML shape: list
// paragraphs styled `mso-list: lN levelM lfoK`, the bullet or number in an
// `mso-list: Ignore` span inside `[if !supportLists]` conditional comments, and the
// `@list lN:levelM {…}` rules in the head's `<style>`. The WebKit shape is modeled on WebKit's
// MSO list quirk (Source/WebCore/editing/markup.cpp). The text is made up. None of it was
// captured from a real clipboard, and a captured clipboard must never be committed here: real
// Office HTML can contain local file paths (`file:///C:/Users/<name>/…`) and people's names.
// Cells' npm package ships only `dist/` and `src/`, so these fixtures never ship.

const NAMESPACES =
    'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" ' +
    'xmlns="http://www.w3.org/TR/REC-html40"';

/** A Word desktop clipboard document: the head with its `@list` rules, then `body`. */
export function wordDocument(listRules, body) {
    return (
        `<html ${NAMESPACES}>\n<head><meta http-equiv=Content-Type content="text/html; charset=utf-8">\n` +
        `<meta name=ProgId content=Word.Document><meta name=Generator content="Microsoft Word 15">\n` +
        `<style><!--\n/* Style Definitions */\n` +
        `p.MsoListParagraph, li.MsoListParagraph {mso-style-priority:34; margin-left:.5in; font-size:12.0pt;}\n` +
        `/* List Definitions */\n${listRules}\n--></style></head>\n` +
        `<body lang=EN-US style='tab-interval:.5in'>\n<!--StartFragment-->\n${body}<!--EndFragment-->\n</body>\n</html>`
    );
}

/** The same clipboard without its head: only the fragment, so there are no `@list` rules. */
export function fragmentDocument(body) {
    return `<html><body>\n<!--StartFragment-->\n${body}<!--EndFragment-->\n</body></html>`;
}

const FONTS = { "·": "Symbol", o: '"Courier New"', "§": "Wingdings" };

function wordMarker(marker, comments) {
    const font = FONTS[marker];
    const outer =
        font === undefined ? "mso-bidi-font-family:Calibri" : `font-family:${font};mso-fareast-font-family:${font}`;
    const [open, close] =
        comments === "outlook"
            ? ["<!--[if !supportLists]-->", "<!--[endif]-->"]
            : ["<![if !supportLists]>", "<![endif]>"];
    return (
        `${open}<span style='${outer}'><span style='mso-list:Ignore'>${marker}` +
        `<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span>${close}`
    );
}

/**
 * One Word list paragraph. `position` is First, Middle or Last (Word's CxSp classes), and
 * `comments: "outlook"` uses Outlook's `<!--[if !supportLists]-->` comments.
 */
export function wordItem({ list = "l0", level = 1, lfo = 1, marker, text, position = "Middle", comments }) {
    const cls = position === "Normal" ? "MsoNormal" : `MsoListParagraphCxSp${position}`;
    return (
        `<p class=${cls} style='margin-left:${0.5 * level}in;mso-add-space:auto;text-indent:-.25in;` +
        `mso-list:${list} level${level} lfo${lfo}'>${wordMarker(marker, comments)}<span lang=EN-US>${text}<o:p></o:p></span></p>\n`
    );
}

/** Word's continuation paragraph: a second paragraph of the previous item. */
export function wordContinuation(text, position = "Middle") {
    return `<p class=MsoListParagraphCxSp${position} style='margin-left:.5in;mso-add-space:auto'><span lang=EN-US>${text}<o:p></o:p></span></p>\n`;
}

export function wordParagraph(text) {
    return `<p class=MsoNormal>${text}<o:p></o:p></p>\n`;
}

// Runs of items: the first is First, the last is Last, the rest are Middle.
function items(list) {
    return list
        .map((item, i) =>
            wordItem({ position: i === 0 ? "First" : i === list.length - 1 ? "Last" : "Middle", ...item })
        )
        .join("");
}

const ruleTail = rest =>
    `mso-level-tab-stop:none; mso-level-number-position:left; text-indent:-.25in;${rest === undefined ? "" : ` ${rest}`}`;

/** `@list l0`: bullets, with Word's default glyphs for the first three levels. */
export const bulletRules = [
    `@list l0 {mso-list-id:1111; mso-list-type:hybrid; mso-list-template-ids:2222 3333 4444;}`,
    `@list l0:level1 {mso-level-number-format:bullet; mso-level-text:\\F0B7; ${ruleTail("font-family:Symbol;")}}`,
    `@list l0:level2 {mso-level-number-format:bullet; mso-level-text:o; ${ruleTail('font-family:"Courier New";')}}`,
    `@list l0:level3 {mso-level-number-format:bullet; mso-level-text:\\F0A7; ${ruleTail("font-family:Wingdings;")}}`,
].join("\n");

/** `@list l1`: numbers, lower-alpha, lower-roman. Level 1 has no format: Word's default is decimal. */
export const numberRules = [
    `@list l1 {mso-list-id:5555; mso-list-type:hybrid;}`,
    `@list l1:level1 {${ruleTail()}}`,
    `@list l1:level2 {mso-level-number-format:alpha-lower; ${ruleTail()}}`,
    `@list l1:level3 {mso-level-number-format:roman-lower; ${ruleTail()}}`,
].join("\n");

/** `@list l2`: decimal at level 1 with bullets at level 2, for mixed lists. */
export const mixedRules = [
    `@list l2 {mso-list-id:6666; mso-list-type:hybrid;}`,
    `@list l2:level1 {mso-level-number-format:decimal; ${ruleTail()}}`,
    `@list l2:level2 {mso-level-number-format:bullet; mso-level-text:o; ${ruleTail('font-family:"Courier New";')}}`,
    `@list l3 {mso-list-id:7777; mso-list-type:hybrid;}`,
    `@list l3:level1 {mso-level-number-format:bullet; mso-level-text:\\F0B7; ${ruleTail("font-family:Symbol;")}}`,
    `@list l3:level2 {mso-level-number-format:decimal; ${ruleTail()}}`,
].join("\n");

const bulletItems = [
    { level: 1, marker: "·", text: "Apples" },
    { level: 2, marker: "o", text: "Green" },
    { level: 3, marker: "§", text: "Granny Smith" },
    { level: 2, marker: "o", text: "Red" },
    { level: 1, marker: "·", text: "Pears" },
];
const numberItems = [
    { list: "l1", lfo: 2, level: 1, marker: "1.", text: "First step" },
    { list: "l1", lfo: 2, level: 2, marker: "a.", text: "Sub step a" },
    { list: "l1", lfo: 2, level: 2, marker: "b.", text: "Sub step b" },
    { list: "l1", lfo: 2, level: 3, marker: "i.", text: "Deep i" },
    { list: "l1", lfo: 2, level: 1, marker: "2.", text: "Second step" },
];

/** O01: bullets on three levels (Symbol `·`, Courier New `o`, Wingdings `§`). */
export const officeBullets = wordDocument(bulletRules, items(bulletItems));
export const officeBulletsSaved = "* Apples\n  * Green\n    * Granny Smith\n  * Red\n* Pears\n";

/** O02: numbers with lower-alpha and lower-roman sub-levels. */
export const officeNumbers = wordDocument(numberRules, items(numberItems));
export const officeNumbersSaved =
    "1. First step\n   1. Sub step a\n   2. Sub step b\n      1. Deep i\n2. Second step\n";

/** O03: a numbered list with a bullet sub-list, then a bullet list with a numbered sub-list. */
export const officeMixed = wordDocument(
    mixedRules,
    wordParagraph("Intro paragraph") +
        items([
            { list: "l2", lfo: 3, level: 1, marker: "1.", text: "Numbered one" },
            { list: "l2", lfo: 3, level: 2, marker: "o", text: "Bullet under one" },
            { list: "l2", lfo: 3, level: 1, marker: "2.", text: "Numbered two" },
        ]) +
        wordParagraph("Between") +
        items([
            { list: "l3", lfo: 4, level: 1, marker: "·", text: "Bullet one" },
            { list: "l3", lfo: 4, level: 2, marker: "1.", text: "Numbered under bullet" },
            { list: "l3", lfo: 4, level: 2, marker: "2.", text: "Second under bullet" },
            { list: "l3", lfo: 4, level: 1, marker: "·", text: "Bullet two" },
        ]) +
        wordParagraph("Outro paragraph")
);
export const officeMixedSaved =
    "Intro paragraph\n\n1. Numbered one\n   * Bullet under one\n2. Numbered two\n\nBetween\n\n" +
    "* Bullet one\n  1. Numbered under bullet\n  2. Second under bullet\n* Bullet two\n\nOutro paragraph\n";

/** O04: an item with a second paragraph (Word's continuation paragraph). */
export const officeContinuation = wordDocument(
    numberRules,
    wordItem({ list: "l1", lfo: 2, marker: "1.", text: "Numbered one", position: "First" }) +
        wordItem({ list: "l1", lfo: 2, marker: "2.", text: "Numbered two" }) +
        wordContinuation("Second paragraph of two") +
        wordItem({ list: "l1", lfo: 2, marker: "3.", text: "Numbered three", position: "Last" })
);

/**
 * O05: a list copied from its third item, a restart (a new lfo) and a different list id at the
 * same level.
 */
export const officeRestart = wordDocument(
    numberRules + "\n" + `@list l4 {mso-list-id:8888;}\n@list l4:level1 {${ruleTail()}}`,
    items([
        { list: "l1", lfo: 2, marker: "3.", text: "Copied from item three" },
        { list: "l1", lfo: 2, marker: "4.", text: "Item four" },
        { list: "l1", lfo: 9, marker: "1.", text: "Restarted one" },
        { list: "l1", lfo: 9, marker: "2.", text: "Restarted two" },
        { list: "l4", lfo: 10, marker: "1.", text: "Other list one" },
    ])
);

/** O06: upper-alpha (`C.`), upper-roman (`IV.`) and leading-zero (`01.`) lists. */
export const officeFormats = wordDocument(
    [
        `@list l5 {mso-list-id:9001;}\n@list l5:level1 {mso-level-number-format:alpha-upper; ${ruleTail()}}`,
        `@list l6 {mso-list-id:9002;}\n@list l6:level1 {mso-level-number-format:roman-upper; ${ruleTail()}}`,
        `@list l7 {mso-list-id:9003;}\n@list l7:level1 {mso-level-number-format:arabic-leading-zero; ${ruleTail()}}`,
    ].join("\n"),
    items([
        { list: "l5", lfo: 5, marker: "C.", text: "Letter C" },
        { list: "l5", lfo: 5, marker: "D.", text: "Letter D" },
    ]) +
        wordParagraph("Roman") +
        items([
            { list: "l6", lfo: 6, marker: "IV.", text: "Roman four" },
            { list: "l6", lfo: 6, marker: "V.", text: "Roman five" },
        ]) +
        wordParagraph("Zero") +
        items([
            { list: "l7", lfo: 7, marker: "01.", text: "Zero one" },
            { list: "l7", lfo: 7, marker: "02.", text: "Zero two" },
        ])
);

/** O07: a picture bullet (format `image`, its `<img>` in the Ignore span) and format `none`. */
export const officePictureBullets = wordDocument(
    `@list l8 {mso-list-id:9004;}\n@list l8:level1 {mso-level-number-format:image; mso-level-text:\\F0B7; ${ruleTail()}}\n` +
        `@list l9 {mso-list-id:9005;}\n@list l9:level1 {mso-level-number-format:none; mso-level-text:""; ${ruleTail()}}`,
    `<p class=MsoListParagraphCxSpFirst style='mso-list:l8 level1 lfo8'><![if !supportLists]><span style='mso-list:Ignore'>` +
        `<img width=12 height=12 src="image001.png" alt="*"><span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>Picture one</p>\n` +
        `<p class=MsoListParagraphCxSpLast style='mso-list:l8 level1 lfo8'><![if !supportLists]><span style='mso-list:Ignore'>` +
        `<img width=12 height=12 src="image001.png" alt="*"><span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>Picture two</p>\n` +
        wordParagraph("No marker") +
        items([
            { list: "l9", lfo: 11, marker: "", text: "Unmarked one" },
            { list: "l9", lfo: 11, marker: "", text: "Unmarked two" },
        ])
);

/** O08: no `@list` rules (only the fragment): the types come from the markers. */
export const officeFragment = fragmentDocument(
    items([
        { level: 1, marker: "·", text: "Dot one" },
        { level: 2, marker: "o", text: "Circle two" },
        { level: 3, marker: "§", text: "Square three" },
        { level: 1, marker: "·", text: "Dot four" },
    ]) +
        wordParagraph("Then numbers") +
        items([
            { list: "l1", lfo: 2, marker: "3.", text: "Three" },
            { list: "l1", lfo: 2, marker: "4.", text: "Four" },
        ]) +
        wordParagraph("Then letters") +
        items([
            { list: "l2", lfo: 3, marker: "b)", text: "Letter b" },
            { list: "l2", lfo: 3, marker: "c)", text: "Letter c" },
        ])
);

// WebKit's MSO list quirk keeps `mso-list` styles and the conditional-comment ranges, writes
// the other styles back as computed CSS, and re-emits the list rules in its own `<style>`.
function webkitItem({ list = "l0", level: n = 1, lfo = 1, marker, text }) {
    const font = FONTS[marker];
    return (
        `<p class="MsoListParagraphCxSpMiddle" style="margin: 0in 0in 0in ${0.5 * n}in; text-indent: -0.25in; mso-list: ${list} level${n} lfo${lfo};">` +
        `<!--[if !supportLists]--><span style="${font === undefined ? "" : `font-family: ${font.replace(/"/g, "&quot;")};`}">` +
        `<span style="mso-list: Ignore;">${marker}<span style="font: 7pt &quot;Times New Roman&quot;;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span>` +
        `<!--[endif]--><span lang="EN-US">${text}</span></p>`
    );
}
function webkitDocument(listRules, body) {
    return (
        `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40">` +
        `<head><style class="WebKit-mso-list-quirks-style">\n<!--\n${listRules}\n-->\n</style></head><body>${body}</body></html>`
    );
}

/** O09: the WebKit-preserved shape of O01 and O02. */
export const officeWebKitBullets = webkitDocument(bulletRules, bulletItems.map(webkitItem).join(""));
export const officeWebKitNumbers = webkitDocument(numberRules, numberItems.map(webkitItem).join(""));

/** O10: classic Outlook desktop: `MsoNormal` paragraphs and `<!--[if !supportLists]-->` comments. */
export const officeOutlook = wordDocument(
    bulletRules + "\n" + numberRules,
    wordParagraph("Hello team,") +
        [
            { level: 1, marker: "·", text: "Agenda item" },
            { level: 2, marker: "o", text: "Detail" },
            { level: 1, marker: "·", text: "Second agenda item" },
        ]
            .map(item => wordItem({ ...item, position: "Normal", comments: "outlook" }))
            .join("") +
        wordParagraph("Steps:") +
        [
            { list: "l1", lfo: 2, marker: "1.", text: "Open" },
            { list: "l1", lfo: 2, marker: "2.", text: "Close" },
        ]
            .map(item => wordItem({ ...item, position: "Normal", comments: "outlook" }))
            .join("") +
        wordParagraph("Thanks")
);

/** O11: a list inside a table cell. */
export const officeTable = wordDocument(
    bulletRules,
    `<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0><tr><td width=200 valign=top>\n` +
        items([
            { level: 1, marker: "·", text: "Cell bullet one" },
            { level: 1, marker: "·", text: "Cell bullet two" },
        ]) +
        `</td><td width=200 valign=top><p class=MsoNormal>Plain cell<o:p></o:p></p></td></tr></table>\n`
);

/** O12: list paragraphs without an Ignore span: a typed marker is removed, other text is kept. */
export const officeNoIgnore = wordDocument(
    numberRules,
    `<p class=MsoListParagraphCxSpFirst style='mso-list:l1 level1 lfo2'>1.&nbsp;&nbsp;Typed number</p>\n` +
        `<p class=MsoListParagraphCxSpMiddle style='mso-list:l1 level1 lfo2'>(2)&nbsp;Bracketed number</p>\n` +
        `<p class=MsoListParagraphCxSpLast style='mso-list:l1 level1 lfo2'>Plain words stay</p>\n`
);

/** O14: Word's numbered headings stay headings with their number as text. */
export const officeHeadings = wordDocument(
    `@list l10 {mso-list-id:9010;}\n@list l10:level1 {${ruleTail()}}`,
    `<h1 style='margin-left:.25in;text-indent:-.25in;mso-list:l10 level1 lfo12'><![if !supportLists]><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>Numbered heading<o:p></o:p></h1>\n` +
        wordParagraph("Body text")
);

/** O15: an HTML page whose text mentions `mso-list:`, which isn't an Office list. */
export const textMentionsMsoList =
    "<p>The Office style <code>mso-list: l0 level1 lfo1</code> marks a list paragraph.</p>";

/** O15, O16: real lists, as Outlook on the web and new Outlook put them on the clipboard. */
export const outlookWebLists =
    '<div class="elementToProof"><ul><li>Web bullet one<ul><li>Web nested bullet</li></ul></li><li>Web bullet two</li></ul>' +
    "<ol><li>Web number one<ol><li>Web nested number</li></ol></li><li>Web number two</li></ol></div>";

/** O16: Word for the web's believed shape: one list per item, the level in `data-aria-level`. */
export const wordWebLists =
    '<div class="ListContainerWrapper"><ul class="BulletListStyle1"><li data-aria-level="1" class="OutlineElement"><p class="Paragraph"><span>Online one</span></p></li></ul></div>' +
    '<div class="ListContainerWrapper"><ul class="BulletListStyle2"><li data-aria-level="2" class="OutlineElement"><p class="Paragraph"><span>Online nested</span></p></li></ul></div>' +
    '<div class="ListContainerWrapper"><ol class="NumberListStyle1"><li data-aria-level="1" class="OutlineElement"><p class="Paragraph"><span>Online number</span></p></li></ol></div>';

/**
 * O17: a Word clipboard whose first list item holds `html` (its `<p>` tags removed, so inline
 * content stays in the item), followed by a second item.
 */
export function officeListItem(html) {
    return wordDocument(
        bulletRules,
        `<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'>${wordMarker("·")}${html.replace(/<\/?p>/g, " ")}</p>\n` +
            wordItem({ marker: "·", text: "Office item after", position: "Last" })
    );
}

/** O21: list paragraphs that aren't valid, each in its own clipboard. */
export const malformedOffice = [
    { name: "level 0", style: "mso-list:l0 level0 lfo1" },
    { name: "level 10", style: "mso-list:l0 level10 lfo1" },
    { name: "a 13-digit level", style: "mso-list:l0 level1234567890123 lfo1" },
    { name: "no level", style: "mso-list:l0 lfo1" },
    { name: "no list id", style: "mso-list:level1 lfo1" },
    { name: "a non-numeric level", style: "mso-list:l0 levelx lfo1" },
    { name: "a 6-digit list id", style: "mso-list:l123456 level1 lfo1" },
    { name: "a repeated level", style: "mso-list:l0 level1 level2 lfo1" },
    { name: "a 5,000-token value", style: `mso-list:${"l0 ".repeat(5000)}` },
    { name: "mso-list: Ignore", style: "mso-list:Ignore" },
    { name: "mso-list: none", style: "mso-list:none" },
    { name: "mso-list: skip", style: "mso-list:skip" },
    { name: "a style over 4,000 characters", style: `margin-left:${"0".repeat(4000)}in;mso-list:l0 level1 lfo1` },
].map(({ name, style }) => ({
    name,
    html: fragmentDocument(
        `<p class=MsoListParagraphCxSpFirst style='${style}'>${wordMarker("·")}Malformed one</p>\n` +
            `<p class=MsoListParagraphCxSpLast style='${style}'>${wordMarker("·")}Malformed two</p>\n`
    ),
}));

/** O22: valid list paragraphs with a malformed one between them. */
export const officeMixedMalformed = wordDocument(
    bulletRules,
    wordItem({ marker: "·", text: "Valid one", position: "First" }) +
        `<p class=MsoListParagraphCxSpMiddle style='mso-list:l0 level0 lfo1'>${wordMarker("·")}Broken middle</p>\n` +
        wordItem({ marker: "·", text: "Valid two", position: "Last" })
);

/** O23: a staircase to level 9, a jump from level 1 to 9, and a run that starts at level 3. */
export const officeStaircase = fragmentDocument(
    items(Array.from({ length: 9 }, (_, i) => ({ level: i + 1, marker: "·", text: `Stair ${i + 1}` })))
);
export const officeJump = fragmentDocument(
    items([
        { level: 1, marker: "·", text: "Ground" },
        { level: 9, marker: "·", text: "Sky one" },
        { level: 9, marker: "·", text: "Sky two" },
        { level: 1, marker: "·", text: "Ground again" },
    ])
);
export const officeStartsDeep = wordDocument(
    bulletRules + "\n" + numberRules,
    items([
        { list: "l1", lfo: 2, level: 3, marker: "iii.", text: "Deep start" },
        { list: "l1", lfo: 2, level: 4, marker: "1.", text: "Deeper" },
        { list: "l1", lfo: 2, level: 3, marker: "iv.", text: "Deep again" },
    ])
);

/**
 * O27: ordered sub-lists that don't start at 1, under a numbered parent, a bullet parent and
 * (lettered) a numbered parent.
 */
export const officeNestedStart = wordDocument(
    [
        numberRules,
        mixedRules,
        `@list l11 {mso-list-id:9011;}`,
        `@list l11:level1 {mso-level-number-format:decimal; ${ruleTail()}}`,
        `@list l11:level2 {mso-level-number-format:decimal; ${ruleTail()}}`,
    ].join("\n"),
    items([
        { list: "l11", lfo: 13, level: 1, marker: "1.", text: "Parent one" },
        { list: "l11", lfo: 13, level: 2, marker: "3.", text: "Sub three" },
        { list: "l11", lfo: 13, level: 2, marker: "4.", text: "Sub four" },
        { list: "l11", lfo: 13, level: 1, marker: "2.", text: "Parent two" },
    ]) +
        wordParagraph("Under a bullet") +
        items([
            { list: "l3", lfo: 4, level: 1, marker: "·", text: "Bullet parent" },
            { list: "l3", lfo: 4, level: 2, marker: "3.", text: "Numbered three" },
            { list: "l3", lfo: 4, level: 2, marker: "4.", text: "Numbered four" },
            { list: "l3", lfo: 4, level: 1, marker: "·", text: "Bullet after" },
        ]) +
        wordParagraph("Lettered") +
        items([
            { list: "l1", lfo: 2, level: 1, marker: "1.", text: "Lettered parent" },
            { list: "l1", lfo: 2, level: 2, marker: "c.", text: "Letter c" },
            { list: "l1", lfo: 2, level: 1, marker: "2.", text: "After letters" },
        ])
);
export const officeNestedStartSaved =
    "1. Parent one\n\n   3. Sub three\n   4. Sub four\n2. Parent two\n\nUnder a bullet\n\n" +
    "* Bullet parent\n\n  3. Numbered three\n  4. Numbered four\n* Bullet after\n\nLettered\n\n" +
    "1. Lettered parent\n\n   3. Letter c\n2. After letters\n";

/** O28: an item with a continuation paragraph and then a sub-list. */
export const officeContinuationNested = wordDocument(
    numberRules,
    wordItem({ list: "l1", lfo: 2, marker: "1.", text: "Numbered one", position: "First" }) +
        wordContinuation("More about one") +
        wordItem({ list: "l1", lfo: 2, level: 2, marker: "a.", text: "Sub a" }) +
        wordItem({ list: "l1", lfo: 2, marker: "2.", text: "Numbered two", position: "Last" })
);

/**
 * O15: non-Office HTML that isn't in the form a DOM serializes it to (upper-case tags,
 * unquoted attributes, `<br/>`, unclosed `<p>`s), with an Office-looking paragraph that has no
 * `mso-list` style.
 */
export const noncanonicalHTML =
    "<P CLASS=MsoNormal STYLE='margin:0in'>Office-looking paragraph<BR/>second line\n" +
    "<p class=MsoNormal>Unclosed paragraph<br/><B>bold</B>";
/** O15: the same, with text that mentions the style, so it's parsed and finds no list paragraph. */
export const noncanonicalMentionsMsoList =
    noncanonicalHTML + "\n<P>The style <CODE>mso-list: l0 level1 lfo1</CODE> marks a list paragraph";

/** O24: mismatched list ids, and `@list` rules for level 1 only. */
export const officeMismatched = wordDocument(
    `@list l0 {mso-list-id:1111;}\n@list l0:level1 {mso-level-number-format:bullet; ${ruleTail()}}`,
    items([
        { list: "l0", level: 1, marker: "·", text: "List zero" },
        { list: "l3", lfo: 4, level: 1, marker: "·", text: "List three" },
        { list: "l0", level: 1, marker: "·", text: "List zero again" },
        { list: "l0", level: 2, marker: "a)", text: "No rule, lettered" },
        { list: "l0", level: 2, marker: "o", text: "No rule, circle" },
    ])
);

/**
 * O25: a Word clipboard with `count` list items, cycling through levels 1 to 9 when `deep`.
 * The items are shorter than `wordItem`'s, so 10,000 of them stay under the length cap.
 */
export function largeOfficeList(count, { deep = false } = {}) {
    const body = [];
    for (let i = 0; i < count; i++) {
        const n = deep ? (i % 9) + 1 : 1;
        body.push(
            `<p class=MsoListParagraphCxSpMiddle style='mso-list:l0 level${n} lfo1'>` +
                `<span style='mso-list:Ignore'>·&nbsp;&nbsp; </span>Item ${i}</p>\n`
        );
    }
    return wordDocument(bulletRules, body.join(""));
}

/** O25: clipboard HTML just over the 4,000,000-character cap. */
export function oversizedOfficeList() {
    return wordDocument(bulletRules, wordItem({ marker: "·", text: "x".repeat(4_000_001) }));
}

const xss = id => `window.__xss='${id}'`;

/** Hostile content inside Office list items, for the browser check. */
export const officeHostile = wordDocument(
    bulletRules,
    `<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'>${wordMarker("·")}office-hostile ` +
        `<img src=x onerror="${xss("O-hostile-img")}"><a href="javascript:${xss("O-hostile-link")}">link</a> ` +
        `<span data-type="html" data-value="&lt;img src=x onerror=&quot;${xss("O-hostile-raw")}&quot;&gt;">raw</span></p>\n` +
        `<p class=MsoListParagraphCxSpMiddle style='mso-list:l0 level2 lfo1'>${wordMarker("o")}nested ` +
        `<svg onload="${xss("O-hostile-svg")}"></svg><script>${xss("O-hostile-script")}</script>` +
        `<iframe src="javascript:${xss("O-hostile-iframe")}"></iframe></p>\n` +
        wordItem({ marker: "·", text: "office-hostile-end", position: "Last" })
);

/**
 * The Office rows of scripts/check-article-cell-sanitizer.mjs: the fixture, its plain-text
 * flavor, a word that shows it was applied, and the list structure a paste must produce.
 */
export const officeBrowserCases = [
    {
        id: "O-bullets",
        name: "Office bullets, three levels",
        html: officeBullets,
        text: "Apples\nGreen\nGranny Smith\nRed\nPears",
        expected: { ul: 3, ol: 0, li: 5, depth: 3 },
    },
    {
        id: "O-numbers",
        name: "Office numbers with sub-levels",
        html: officeNumbers,
        text: "First step\nSub step a\nSub step b\nDeep i\nSecond step",
        expected: { ul: 0, ol: 3, li: 5, depth: 3 },
    },
    {
        id: "O-mixed",
        name: "Office mixed lists and paragraphs",
        html: officeMixed,
        text: "Intro paragraph",
        expected: { ul: 2, ol: 2, li: 7, depth: 2 },
        saved: officeMixedSaved,
    },
    {
        id: "O-nested-start",
        name: "Office sub-lists that don't start at 1",
        html: officeNestedStart,
        text: "Parent one",
        expected: { ul: 1, ol: 5, li: 11, depth: 2 },
        saved: officeNestedStartSaved,
    },
    {
        id: "O-hostile",
        name: "Office list with hostile content",
        html: officeHostile,
        text: "office-hostile",
        expected: { ul: 2, ol: 0, li: 3, depth: 2 },
    },
];

/** Every Office fixture that converts or must stay unchanged, for L03 and L06. */
export const officeCorpus = [
    { id: "O01", html: officeBullets },
    { id: "O02", html: officeNumbers },
    { id: "O03", html: officeMixed },
    { id: "O04", html: officeContinuation },
    { id: "O05", html: officeRestart },
    { id: "O06", html: officeFormats },
    { id: "O07", html: officePictureBullets },
    { id: "O08", html: officeFragment },
    { id: "O09a", html: officeWebKitBullets },
    { id: "O09b", html: officeWebKitNumbers },
    { id: "O10", html: officeOutlook },
    { id: "O11", html: officeTable },
    { id: "O12", html: officeNoIgnore },
    { id: "O14", html: officeHeadings },
    { id: "O16a", html: outlookWebLists },
    { id: "O16b", html: wordWebLists },
    ...malformedOffice.map((m, i) => ({ id: `O21-${i + 1}`, html: m.html })),
    { id: "O22", html: officeMixedMalformed },
    { id: "O23a", html: officeStaircase },
    { id: "O23b", html: officeJump },
    { id: "O23c", html: officeStartsDeep },
    { id: "O24", html: officeMismatched },
    { id: "O27", html: officeNestedStart },
    { id: "O28", html: officeContinuationNested },
    { id: "O-hostile", html: officeHostile },
];
