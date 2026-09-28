<h1 align="center">
  <b>AI Data Grid Cells</b>
</h1>
<p align="center">Additional cells for AI Data Grid (<code>@specstory/ai-data-grid</code>).</p>

<p align="center">Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.</p>

Needs React 19 (`react` and `react-dom` peer range `^19.0.0`). React 16, 17 and 18 are not supported.

Current cells

-   Star (rating)
-   Sparkline
-   Tags
-   User profile
-   Dropdown
-   Article (Markdown editor)
-   Range
-   Spinner
-   Date picker
-   Links
-   Button
-   Tree view
-   Multi-select

# Installation

```shell
npm i @specstory/ai-data-grid @specstory/ai-data-grid-cells
```

Import the CSS of both packages once in your app. The cells' editors are styled by `@specstory/ai-data-grid-cells/dist/index.css`.

```ts
import "@specstory/ai-data-grid/dist/index.css";
import "@specstory/ai-data-grid-cells/dist/index.css";
```

That file also styles ArticleCell's editor and viewer; there's no separate stylesheet to import.

# Usage

Step 1: Import the cell renderers you want to use and pass them to the grid. `allCells` contains all of them; each renderer is also exported on its own (`StarCell`, `DropdownCell`, ...).

```tsx
import { DataEditor } from "@specstory/ai-data-grid";
import { allCells } from "@specstory/ai-data-grid-cells";

const Grid = () => {
    return <DataEditor customRenderers={allCells} {...rest} />;
};
```

Step 2: Use the cells in your `getCellContent` callback. Each cell's type is exported with a `Type` suffix (`StarCellType`, `DropdownCellType`, ...; the date picker's is `DatePickerType`).

```ts
import { GridCellKind } from "@specstory/ai-data-grid";
import type { StarCellType } from "@specstory/ai-data-grid-cells";

const getCellContent = React.useCallback(() => {
    const starCell: StarCellType = {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        copyData: "4 out of 5",
        data: {
            kind: "star-cell",
            rating: 4,
        },
    };

    return starCell;
}, []);
```

## Note on ArticleCell

The ArticleCell's editor and read-only viewer are built on [Milkdown](https://milkdown.dev) (its headless packages, which run on ProseMirror and remark). Milkdown is a regular dependency of this package, so there's nothing extra to install, and its styles are part of `@specstory/ai-data-grid-cells/dist/index.css`.

The toolbar has headings (paragraph and H1–H6), bold, italic, strikethrough, horizontal rule, quote, bullet, ordered and task lists, indent and outdent, table, link, inline code and code block. Inside a table, toolbar buttons add a row or a column and delete the current row, column or table. The editor has Milkdown's keyboard shortcuts, such as Ctrl+B (Cmd+B on macOS) for bold, and undo and redo. You can paste or drop an image file, which is stored in the Markdown as a `data:image/…` URL.

Save stores the article's Markdown in `data.markdown`:

- If you save without changing anything, the original Markdown is kept byte for byte.
- If you edit the article, the whole article is saved in the editor's GFM form, which can rewrite parts you didn't touch without changing their meaning: tables are padded and their alignment rows written as `:-`, `:-:` or `-:`; bullets are written with `*`, except that adjacent bullet lists alternate between `*` and `-` so they stay separate; `---` and `___` rules become `***`; setext headings become `#` headings; indented and `~~~` code blocks become backtick fences; reference links become inline links, and bare URLs become `<url>` autolinks; two-space hard breaks become `\`; named entities such as `&copy;` become the characters they stand for; and a trailing newline is added.
- Raw HTML, HTML comments and `$$…$$` blocks are saved byte for byte either way.
- If the editor can't load an article, it shows the stored Markdown as plain text, and Save keeps it unchanged.

How articles look compared with 6.x:

- **Raw HTML isn't rendered.** Inline and block HTML and HTML comments inside the Markdown are shown as their source text, in a muted monospace style, in the viewer and in the editor. For example, `<kbd>Ctrl</kbd>` reads literally, and a `<details>` block isn't collapsible. The HTML is kept in the Markdown unchanged.
- Reference links, bare URLs, single-tilde strikethrough (`~text~`) and footnotes now render.
- `$$…$$` custom blocks are shown as ordinary text, not as a custom widget.
- Pasting a list from Microsoft Office keeps its text and paragraphs, but it doesn't become a Markdown list. Support for Office lists is planned.
- The toolbar, the link dialog and table editing look and work differently. Table rows and columns are edited with the toolbar buttons above, not a context menu.

### Article content security

Article Markdown, and anything pasted or dropped into the editor, is treated as untrusted:

- **Raw HTML in the Markdown is never interpreted.** It's shown as text (see above), so it never reaches an HTML parser in the viewer or the editor.
- **Pasted and dropped HTML is sanitized** with a private instance of [DOMPurify](https://github.com/cure53/DOMPurify) before the editor parses it, and the editor keeps only what it can store as article Markdown (text, formatting, lists, tables, links, images and code). Pasted or dropped content can't add raw HTML to the stored Markdown. DOMPurify is a regular dependency of this package (`dompurify` `^3.4.16`), so `npm audit` sees it, and you get its patch releases through your own lockfile (for example `npm update dompurify`) without a new release of this package.
- **The instance is private.** Calls to `DOMPurify.setConfig` or `DOMPurify.addHook` in your app don't change how articles are handled.
- **Link and image URLs are filtered.** A link or image URL that DOMPurify's URL policy rejects, such as a `javascript:` URL, is rendered empty in the viewer and the editor, and the link dialog doesn't accept it. `https:`, `http:`, `mailto:`, `tel:` and relative URLs are allowed, and `data:` URLs only for images.
- **No paste or drop is left to the browser.** The editor handles every paste and drop itself or ignores it, so the browser never inserts content on its own. A paste or drop into a code block inserts plain text only.
- **It fails closed.** If DOMPurify reports that it can't run in the current environment, pasted or dropped HTML is inserted as plain text (or nothing, if there's no plain-text version), and every link and image URL is rendered empty. This isn't expected in current browsers.

Limitations:

- Images from remote URLs still load, so an article can include a tracking pixel. If you need to block remote images, use a Content Security Policy.
- The stored Markdown isn't rewritten. A `javascript:` link that is already in an article's Markdown stays there; only its rendering is blocked. If you render stored articles somewhere else, sanitize them there too.
- Forcing an older `dompurify` for this package, for example with an `overrides` entry in your app's `package.json`, isn't supported. If your app itself depends on `dompurify` 2.x or an older 3.x, npm installs a separate copy that matches `^3.4.16` for this package, and the editor uses that one.
- If your app also uses Milkdown at another version, npm installs a second copy for this package. It works, but your bundle is bigger.

## Migrating from 6.x

The API is unchanged from the 6.x cells package, but 7.0.0 needs React 19. If your app is on React 16, 17 or 18, upgrade it to React 19 first. Then change the package names:

| 6.x package | 7.0.0 package |
| --- | --- |
| `@glideapps/glide-data-grid` | `@specstory/ai-data-grid` |
| `@glideapps/glide-data-grid-cells` | `@specstory/ai-data-grid-cells` |

If you use ArticleCell, remove your Toast UI Editor CSS import. ArticleCell's styles are now part of `@specstory/ai-data-grid-cells/dist/index.css`, so nothing replaces it. This package no longer depends on `@toast-ui/editor` or `@toast-ui/react-editor`. See [Note on ArticleCell](#note-on-articlecell) for how articles look and save now.

## License

MIT. See `LICENSE`. Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.
