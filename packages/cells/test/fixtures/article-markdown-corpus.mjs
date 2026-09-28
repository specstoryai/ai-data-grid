// Benign, synthetic Markdown for the ArticleCell fidelity tests (SPST-61,
// test/article-cell-fidelity.test.tsx): one document per feature group, F01–F24. Cells' npm
// package ships only `dist/`, so this corpus never ships.

/** @type {readonly { id: string; name: string; markdown: string }[]} */
export const markdownCorpus = [
    { id: "F01", name: "ATX headings", markdown: "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6" },
    { id: "F02", name: "setext headings", markdown: "Title\n=====\n\nSubtitle\n--------\n\ntext" },
    {
        id: "F03",
        name: "emphasis, strong, strike and inline code with both markers",
        markdown:
            "Some **bold**, __bold__, *italic*, _italic_, ***both***, ~~strike~~, ~single~ and `code`.\n\n" +
            "In words: a*b*c, 2*3*4 and snake_case_name.",
    },
    {
        id: "F04",
        name: "links: inline, titled, reference, autolink and bare",
        markdown:
            'A [link](https://example.com/page), a [titled](https://example.com "Title") one, ' +
            "a [ref][1] and <https://example.com/auto>, then https://example.org/bare_url today.\n\n" +
            "Parens: [x](https://example.com/a_(b)) and [rel](docs/page.html) and [anchor](#section).\n\n" +
            "[1]: https://example.com/ref",
    },
    {
        id: "F05",
        name: "images with and without a title, and data:image/png",
        markdown:
            '![alt text](https://example.com/image.png) ![titled](https://example.com/t.png "T")\n\n' +
            "![dot](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)",
    },
    {
        id: "F06",
        name: "bullets with *, - and +",
        markdown: "* star one\n* star two\n\n- dash one\n- dash two\n\n+ plus one\n+ plus two",
    },
    {
        id: "F07",
        name: "ordered lists starting at 1, at 3, and 10 or more",
        markdown: "1. first\n2. second\n\n---\n\n3. three\n4. four\n\n---\n\n10. ten\n11. eleven",
    },
    {
        id: "F08",
        name: "nested mixed lists",
        markdown: "* a\n  * a1\n    * a11\n* b\n  1. b1\n  2. b2\n\n1. x\n   * x1\n2. y",
    },
    {
        id: "F09",
        name: "nested task lists",
        markdown: "* [ ] open task\n* [x] done task\n  * [ ] nested open\n  * [x] nested done\n\n- [ ] dash task",
    },
    { id: "F10", name: "plain table", markdown: "| Name | Value |\n| --- | --- |\n| a | 1 |\n| b | 2 |" },
    { id: "F11", name: "aligned table", markdown: "| L | C | R | N |\n|:--|:-:|--:|---|\n| a | b | c | d |" },
    {
        id: "F12",
        name: "table with inline formatting, an escaped pipe and a code span",
        markdown:
            "| A | B |\n| --- | --- |\n| **bold** | `code` |\n| [l](https://e.com) | x \\| y |\n| *em* | `a\\|b` |",
    },
    {
        id: "F13",
        name: "nested blockquotes with lists",
        markdown: "> outer\n> second line\n>\n> > inner\n> > * item one\n> > * item two\n>\n> 1. numbered",
    },
    {
        id: "F14",
        name: "code: fenced with a language, tilde, indented, containing backticks",
        markdown:
            "```js\nconst code = 1;\n```\n\n~~~\ntilde fence\n~~~\n\n    indented code\n\n" +
            "```\nhas ``` inside? no: `ticks`\n```\n\nand `` a`b `` inline",
    },
    { id: "F15", name: "all three rule styles", markdown: "above\n\n***\n\nmiddle\n\n---\n\nlower\n\n___\n\nbelow" },
    {
        id: "F16",
        name: "hard and soft breaks",
        markdown: "line one  \nline two\n\nline one\\\nline two\n\nsoft one\nsoft two",
    },
    {
        id: "F17",
        name: "line-start escapes",
        markdown:
            "\\# not heading\n\n1\\. not a list\n\n\\- not bullet\n\n\\+ not bullet\n\n\\> not quote\n\n" +
            "\\* not bullet\n\n\\`not code\\` and \\[not link\\](x) and snake\\_case",
    },
    {
        id: "F18",
        name: "entities, and <, > and & in text",
        markdown: "AT&amp;T &copy; &nbsp; &hellip; &#169; &#x27; &lt;tag&gt;\n\na < b > c & d",
    },
    {
        id: "F19",
        name: "inline HTML, with an unmatched tag",
        markdown:
            'Some <b>bold html</b>, <kbd>Ctrl</kbd>, <span style="color:red">red</span> and a<br>b.\n\n' +
            "use <b> tags unmatched",
    },
    {
        id: "F20",
        name: "block HTML: div, details, an HTML table, img width",
        markdown:
            "<div>block html</div>\n\nafter\n\n<details><summary>sum</summary>\n\nbody\n\n</details>\n\n" +
            "<table><tr><td>cell</td></tr></table>\n\n" +
            '<img src="https://example.com/i.png" alt="i" width="20">',
    },
    {
        id: "F21",
        name: "HTML comments",
        markdown: "before <!-- inline comment --> after\n\n<!--\nblock comment\n-->\n\ntail",
    },
    {
        id: "F22",
        name: "$$ custom blocks",
        markdown: "$$widget0 [x](https://e.com)$$\n\n$$custom\ncontent\n$$",
    },
    {
        id: "F23",
        name: "footnotes",
        markdown: "Text with a note[^1] and another[^two].\n\n[^1]: The first note.\n\n[^two]: The second note.",
    },
    {
        id: "F24",
        name: "a long mixed article",
        markdown: [
            "# Release notes",
            "",
            "Some **bold**, *italic*, ~~strike~~ and `inline code` with a [link](https://example.com/page).",
            "",
            "## Tasks",
            "",
            "* [ ] open task",
            "* [x] done task",
            "",
            "## Numbers",
            "",
            "| Name | Value |",
            "| --- | --- |",
            "| a | 1 |",
            "| b | 2 |",
            "",
            "> a quote with a list:",
            ">",
            "> 1. one",
            "> 2. two",
            "",
            "```ts",
            "const code: number = 1;",
            "```",
            "",
            "***",
            "",
            "* bullet one",
            "  * nested",
            "* bullet two",
            "",
            "![alt](https://example.com/image.png)",
            "",
            "last line",
        ].join("\n"),
    },
];
