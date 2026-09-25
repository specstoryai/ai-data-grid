<h1 align="center">
  <b>AI Data Grid</b>
</h1>
<p align="center">A canvas-based React data grid, supporting <b>millions</b> of rows, <b>rapid</b> updating, and <b>native scrolling</b>.</p>

<p align="center">Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.</p>

`@specstory/ai-data-grid` is the core package of AI Data Grid. Version 7.0.0 is API-compatible with the 6.x releases it was forked from, but it needs React 19. Existing users on React 19 only change import paths (see [Migrating from 6.x](#migrating-from-6x)).

Companion packages:

-   `@specstory/ai-data-grid-cells`: extra cell renderers.
-   `@specstory/ai-data-grid-source`: data source hooks such as column sort and undo/redo.

Source: https://github.com/specstoryai/ai-data-grid

## Features

-   **It scales to millions of rows**. Cells are rendered lazily on demand for memory efficiency.
-   **Scrolling is extremely fast**. Native scrolling keeps everything buttery smooth.
-   **Supports multiple types of cells**. Numbers, text, markdown, bubble, image, drilldown, uri
-   **Fully Free & Open Source**. [MIT licensed](LICENSE), so you can use the grid in commercial projects.
-   **Editing is built in**.
-   **Resizable and movable columns**.
-   **Variable sized rows**.
-   **Merged cells**.
-   **Single and multi-select rows, cells, and columns**.
-   **Cell rendering can be fully customized**.

# ⚡ Quick Start

The packages need React 19 (`react` and `react-dom` peer range `^19.0.0`). React 16, 17 and 18 are not supported. Install the data grid:

```shell
npm i @specstory/ai-data-grid
```

You may also need to install the peer dependencies if you don't have them already:

```shell
npm i lodash marked react-responsive-carousel
```

Create a new `DataEditor` wherever you need to display lots and lots of data

```tsx
import { DataEditor } from "@specstory/ai-data-grid";

<DataEditor getCellContent={getData} columns={columns} rows={numRows} />;
```

Don't forget to import mandatory CSS

```ts
import "@specstory/ai-data-grid/dist/index.css";
```

Making your columns is easy

```ts
// Grid columns may also provide icon, overlayIcon, menu, style, and theme overrides
const columns: GridColumn[] = [
    { title: "First Name", width: 100 },
    { title: "Last Name", width: 100 },
];
```

Last provide data to the grid

```ts
// If fetching data is slow you can use the DataEditor ref to send updates for cells
// once data is loaded.
function getData([col, row]: Item): GridCell {
    const person = data[row];

    if (col === 0) {
        return {
            kind: GridCellKind.Text,
            data: person.firstName,
            allowOverlay: false,
            displayData: person.firstName,
        };
    } else if (col === 1) {
        return {
            kind: GridCellKind.Text,
            data: person.lastName,
            allowOverlay: false,
            displayData: person.lastName,
        };
    } else {
        throw new Error();
    }
}
```

## AI Fill

AI Fill adds AI-filled columns to a grid in configuration alone, powered by [Jev](https://docs.typesafe.ai) (TypeSafe's Choice, Score and Noul). You describe each AI column's question and how answers become cell values; AI Fill fills the cells you ask it to, shows suggestions in the grid, and writes only what is accepted (or what your "Fill and apply" rules allow), through your own edit handlers, so `validateCell` and `useUndoRedo` keep working. It is still in development: the built-in menus and dialogs arrive in a later release, and fills start from `ref.current.aiFill`.

Turn it on with one prop. Without `aiFill`, the grid is unchanged and no AI code loads:

```tsx
const aiFill = React.useMemo<AIFillConfig>(
    () => ({
        connection: { mode: "endpoint", url: "/api/jev" }, // your server holds the API key
        model: "jev-latest",
        rows: { getRowId: row => view[row].id },
        columns: { persona: personaDefinition }, // keyed by GridColumn.id
    }),
    [view]
);

<DataEditor {...props} ref={ref} aiFill={aiFill} />;

ref.current?.aiFill?.fill("selection-empty");
```

The [AI Fill chapter of API.md](API.md#ai-fill) covers the quick start, the configuration, result policies, rows and staleness, committing and undo, connecting to Jev (`@specstory/ai-data-grid/server`) and testing with the mock (`@specstory/ai-data-grid/testing`).

## Full API documentation

The API reference, including the HTML/CSS prerequisites, is in `API.md`, which ships in this package.

## Migrating from 6.x

7.0.0 needs React 19 (`^19.0.0`). React 16, 17 and 18 are not supported, so if your app is on one of them, upgrade it to React 19 first, then switch packages.

7.0.0 keeps every exported name and prop, `DataEditor`, the `--gdg-*` CSS variables and the `gdg-` class names. Change only the package names in your `package.json` and imports:

| 6.x package | 7.0.0 package |
| --- | --- |
| `@glideapps/glide-data-grid` | `@specstory/ai-data-grid` |
| `@glideapps/glide-data-grid-cells` | `@specstory/ai-data-grid-cells` |
| `@glideapps/glide-data-grid-source` | `@specstory/ai-data-grid-source` |

For example, the CSS import becomes `import "@specstory/ai-data-grid/dist/index.css";`. See the 7.0.0 release notes in `CHANGELOG.md`, which ships in this package.

# 📒 FAQ

**Nothing shows up!**

Please read the [Prerequisites section in the docs](API.md).

**It crashes when I try to edit a cell!**

Please read the [Prerequisites section in the docs](API.md).

**Does it work with screen readers and other a11y tools?**

Yes. Unfortunately none of the primary developers are accessibility users so there are likely flaws in the implementation we are not aware of. Bug reports welcome!

**Does it support my data source?**

Yes.

Data Grid is agnostic about the way you load/store/generate/mutate your data. What it requires is that you tell it which columns you have, how many rows, and to give it a function it can call to get the data for a cell in a specific row and column.

**Does it do sorting, searching, and filtering?**

Search is included. You provide the trigger, we do the search. See the `showSearch` and `onSearchClose` props in [API.md](API.md).

Filtering and sorting are something you would have to implement with your data source. There are hooks for adding column header menus if you want that, and the companion package `@specstory/ai-data-grid-source` provides a `useColumnSort` hook.

The reason we don't add filtering/sorting in by default is that these are usually very application-specific, and can often also be implemented more efficiently in the data source, via a database query, for example.

**Can it do frozen columns?**

Yes!

**Can I render my own cells?**

Yes, but the renderer has to use HTML Canvas. See `drawCell` and `customRenderers` in [API.md](API.md).

**Why does Data Grid use HTML Canvas?**

Originally we had implemented our Grid using virtualized rendering. We virtualized both in the horizontal and vertical direction using [react-virtualized](https://github.com/bvaughn/react-virtualized). The problem is simply scrolling performance. Once you need to load/unload hundreds of DOM elements per frame nothing can save you.

There are some hacks you can do like setting timers and entering into a "low fidelity" rendering mode where you only render a single element per cell. This works okay until you want to show hundreds of cells and you are right back to choppy scrolling. It also doesn't really look or feel great.

**I want to use this with Next.js / Vercel, but I'm getting weird errors**

The grid needs the browser (`window` and a canvas), so don't render it on the server. Put it in its own component and load that with `next/dynamic` and `ssr: false`. With the App Router, `ssr: false` is only allowed in a Client Component, so the file that calls `dynamic` starts with `"use client";`.

`app/page.tsx`

```tsx
"use client";

import dynamic from "next/dynamic";

const Grid = dynamic(() => import("../components/Grid").then(m => m.Grid), { ssr: false });

export default function Home() {
    return <Grid />;
}
```

`components/Grid.tsx`

```tsx
"use client";

import * as React from "react";
import { DataEditor, GridCellKind, type GridCell, type GridColumn, type Item } from "@specstory/ai-data-grid";
import "@specstory/ai-data-grid/dist/index.css";

const data = [
    { firstName: "Ada", lastName: "Lovelace" },
    { firstName: "Grace", lastName: "Hopper" },
];

const columns: GridColumn[] = [
    { title: "First Name", width: 150 },
    { title: "Last Name", width: 150 },
];

function getCellContent([col, row]: Item): GridCell {
    const person = data[row];
    const text = col === 0 ? person.firstName : person.lastName;
    return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: false };
}

export function Grid() {
    return (
        <div style={{ height: 400 }}>
            <DataEditor columns={columns} rows={data.length} getCellContent={getCellContent} width="100%" height="100%" />
        </div>
    );
}
```

## License

MIT. See `LICENSE`. Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.
