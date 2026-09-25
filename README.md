<h1 align="center">
  <b>AI Data Grid</b>
</h1>
<p align="center">A canvas-based React data grid, supporting <b>millions</b> of rows, <b>rapid</b> updating, and <b>native scrolling</b>.</p>

<p align="center">Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="media/data-grid-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="media/data-grid.png">
  <img alt="AI Data Grid with sample data" src="media/data-grid.png">
</picture>

AI Data Grid is SpecStory's maintained hard fork of a canvas-based React data grid. Version 7.0.0 is API-compatible with the 6.x releases it was forked from, but it needs React 19: if you already use the grid on React 19, you only change your import paths (see [Migrating from 6.x](#migrating-from-6x)).

## Packages

| Package | What it is |
| --- | --- |
| [`@specstory/ai-data-grid`](packages/core/README.md) | The grid itself (`DataEditor`, cell types, theming). |
| [`@specstory/ai-data-grid-cells`](packages/cells/README.md) | Extra cell renderers (star, sparkline, dropdown, tags, date picker and more). |
| [`@specstory/ai-data-grid-source`](packages/source/README.md) | Data source hooks: column sort, movable columns, collapsing groups, async loading, undo/redo. |

> **Not on npm yet.** 7.0.0 hasn't been published. Until it is, build the packages from this repository and install the tarballs (see [Installing before the npm release](#installing-before-the-npm-release)).

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

## Full API documentation

The API reference, including the HTML/CSS prerequisites, is in [packages/core/API.md](packages/core/API.md).

## Migrating from 6.x

7.0.0 needs React 19 (`^19.0.0`). React 16, 17 and 18 are not supported, so if your app is on one of them, upgrade it to React 19 first, then switch packages.

7.0.0 keeps every exported name and prop, `DataEditor`, the `--gdg-*` CSS variables and the `gdg-` class names. Change only the package names in your `package.json` and imports:

| 6.x package | 7.0.0 package |
| --- | --- |
| `@glideapps/glide-data-grid` | `@specstory/ai-data-grid` |
| `@glideapps/glide-data-grid-cells` | `@specstory/ai-data-grid-cells` |
| `@glideapps/glide-data-grid-source` | `@specstory/ai-data-grid-source` |

For example, the CSS import becomes `import "@specstory/ai-data-grid/dist/index.css";`. See the [7.0.0 release notes](packages/core/CHANGELOG.md) for details.

## Installing before the npm release

Build the packages from a clone of this repository (Node 24 and npm), then install the packed tarballs into your app:

```shell
git clone https://github.com/specstoryai/ai-data-grid.git
cd ai-data-grid
npm ci
npm run build
for p in core cells source; do (cd packages/$p && npm pack --pack-destination ../..); done
```

This writes `specstory-ai-data-grid-7.0.0.tgz`, `specstory-ai-data-grid-cells-7.0.0.tgz` and `specstory-ai-data-grid-source-7.0.0.tgz` to the repository root. In your app, install the core tarball, plus the others if you use them, in one command:

```shell
npm i /path/to/ai-data-grid/specstory-ai-data-grid-7.0.0.tgz /path/to/ai-data-grid/specstory-ai-data-grid-cells-7.0.0.tgz
```

`cells` and `source` depend on `@specstory/ai-data-grid` `7.0.0`, so install the core tarball in the same command.

# 📒 FAQ

**Nothing shows up!**

Please read the [Prerequisites section in the docs](packages/core/API.md).

**It crashes when I try to edit a cell!**

Please read the [Prerequisites section in the docs](packages/core/API.md).

**npm warns `ERESOLVE overriding peer dependency` for `@toast-ui/react-editor` when I install the cells package**

The article cell's editor declares a `react ^17.0.1` peer. npm installs anyway with React 19, and the editor works. See the [cells README](packages/cells/README.md#react-19-and-the-toast-uireact-editor-peer-warning) to silence the warning or to install with `--strict-peer-deps`.

**Does it work with screen readers and other a11y tools?**

Yes. Unfortunately none of the primary developers are accessibility users so there are likely flaws in the implementation we are not aware of. Bug reports welcome!

**Does it support my data source?**

Yes.

Data Grid is agnostic about the way you load/store/generate/mutate your data. What it requires is that you tell it which columns you have, how many rows, and to give it a function it can call to get the data for a cell in a specific row and column.

**Does it do sorting, searching, and filtering?**

Search is included. You provide the trigger, we do the search. See the `showSearch` and `onSearchClose` props in [API.md](packages/core/API.md).

Filtering and sorting are something you would have to implement with your data source. There are hooks for adding column header menus if you want that, and `@specstory/ai-data-grid-source` provides a `useColumnSort` hook.

The reason we don't add filtering/sorting in by default is that these are usually very application-specific, and can often also be implemented more efficiently in the data source, via a database query, for example.

**Can it do frozen columns?**

Yes!

**Can I render my own cells?**

Yes, but the renderer has to use HTML Canvas. See `drawCell` and `customRenderers` in [API.md](packages/core/API.md).

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Architecture and decisions are recorded in [AS-BUILT.md](AS-BUILT.md).

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.
