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

If you use ArticleCell, also import its editor CSS (see [Note on ArticleCell](#note-on-articlecell)).

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

The ArticleCell's editor and read-only viewer are a patched copy of [Toast UI Editor](https://github.com/nhn/tui.editor) 3.2.2 that ships inside this package, so you don't install anything from `@toast-ui/*`. Import its CSS once in your app, next to the other CSS imports:

```ts
import "@specstory/ai-data-grid-cells/dist/toastui-editor.css";
```

Save stores the article's Markdown as the editor writes it. Toast UI re-serializes the whole article, so an edited article can come back with parts you didn't touch in Toast UI's own, equivalent Markdown form. If you save without changing anything, the original Markdown is kept byte for byte.

### Article content security

Article Markdown, and anything pasted into the editor, is treated as untrusted:

- Everything the viewer and the editor render from Markdown, including raw HTML inside it, is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify). DOMPurify is a regular dependency of this package (`dompurify` `^3.4.16`), so `npm audit` sees it, and you get its patch releases through your own lockfile (for example `npm update dompurify`) without a new release of this package.
- The editor sanitizes with its own private DOMPurify instance. Calls to `DOMPurify.setConfig` or `DOMPurify.addHook` in your app don't change how articles are sanitized.
- Pasted HTML, including content pasted from Microsoft Office, is sanitized before the editor processes it. Pasted or dropped HTML can't make the editor create elements other than the formatting elements Toast UI itself uses.
- In the editor, link and image URLs that DOMPurify rejects, such as `javascript:` URLs, are rendered empty.

Limitations:

- Sanitizing uses DOMPurify's default allowlist, minus the tags Toast UI forbids. Inline `style` attributes, SVG and MathML without scripts, and images from remote URLs are still allowed. If you need to block remote images, for example tracking pixels, use a Content Security Policy.
- The stored Markdown isn't rewritten. A `javascript:` link that is already in an article's Markdown stays there; only its rendering is blocked. If you render stored articles somewhere else, sanitize them there too.
- If DOMPurify reports that it can't run in the current environment, the editor throws an error instead of rendering unsanitized HTML. ArticleCell has no error boundary of its own, so the error reaches your app's nearest error boundary. This isn't expected in current browsers.
- Forcing an older `dompurify` for this package, for example with an `overrides` entry in your app's `package.json`, isn't supported. If your app itself depends on `dompurify` 2.x or an older 3.x, npm installs a separate copy that matches `^3.4.16` for this package, and the editor uses that one.
- Toast UI Editor's upstream project is archived and gets no fixes. Security fixes for the article editor come from this package.

## Migrating from 6.x

The API is unchanged from the 6.x cells package, but 7.0.0 needs React 19. If your app is on React 16, 17 or 18, upgrade it to React 19 first. Then change the package names:

| 6.x package | 7.0.0 package |
| --- | --- |
| `@glideapps/glide-data-grid` | `@specstory/ai-data-grid` |
| `@glideapps/glide-data-grid-cells` | `@specstory/ai-data-grid-cells` |

If you use ArticleCell, also change its CSS import: `import "@toast-ui/editor/dist/toastui-editor.css"` becomes `import "@specstory/ai-data-grid-cells/dist/toastui-editor.css"`. This package no longer depends on `@toast-ui/editor` or `@toast-ui/react-editor`.

## License

MIT. See `LICENSE`. Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.
