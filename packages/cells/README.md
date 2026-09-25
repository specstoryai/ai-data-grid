<h1 align="center">
  <b>AI Data Grid Cells</b>
</h1>
<p align="center">Additional cells for AI Data Grid (<code>@specstory/ai-data-grid</code>).</p>

<p align="center">Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.</p>

Supports React 16.12 or later, including 17, 18 and 19 (peer range `^16.12.0 || 17.x || 18.x || 19.x`).

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

The ArticleCell uses `@toast-ui/editor` to provide its editor. To make sure it works correctly your project will need to import the css file it depends on.

```
import "@toast-ui/editor/dist/toastui-editor.css";
```

## Migrating from 6.x

The API is unchanged from the 6.x cells package. Change the package names only:

| 6.x package | 7.0.0 package |
| --- | --- |
| `@glideapps/glide-data-grid` | `@specstory/ai-data-grid` |
| `@glideapps/glide-data-grid-cells` | `@specstory/ai-data-grid-cells` |

## License

MIT. See `LICENSE`. Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.
