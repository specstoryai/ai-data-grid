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

You may also need to install the peer dependencies if you don't have them already. `marked` must be 16.x (the peer range is `^16.0.10`), so name the major version:

```shell
npm i lodash marked@^16 react-responsive-carousel
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

## Demos and examples

The Storybook at https://ai-data-grid-storybook.vercel.app has live demos of the grid, the extra cells and the data source hooks. It is built from `main`, so it shows the latest unreleased code. You can also run it locally from a clone (see [CONTRIBUTING.md](CONTRIBUTING.md#running-storybook)).

## Documentation

The full documentation (quickstart guide, API reference, guides and FAQ) is at **https://ai-data-grid-docs.vercel.app**. The documentation is converted from the original Glide Data Grid GitBook documentation.

The API reference, including the HTML/CSS prerequisites, is also in this repository at [packages/core/API.md](packages/core/API.md).

## AI Fill

AI Fill fills grid columns with answers from TypeSafe's [Jev](https://docs.typesafe.ai) (the Choice, Score and Noul primitives). You configure each AI column's question and how an answer becomes a cell value; your users ask for fills from the grid's AI menus, review suggestions on the canvas, and accept them. It is part of `@specstory/ai-data-grid` itself, not a separate package. Turn it on with the optional `aiFill` prop on `DataEditor`; without it the grid behaves as before and no AI code loads.

- **What you get:** AI menus on AI columns and cells (ending in "More options…", which opens your own menu), a confirmation that states the scope before large, column-wide or "Fill and apply" fills, a status bar over the bottom edge of the grid, an inspector that explains each result, and keyboard shortcuts. Accepted results are written through your own edit handlers, so `validateCell` and `useUndoRedo` keep working. Apps can also drive it from code through `ref.current.aiFill`.
- **Keep your TypeSafe key on a server.** Never put it in browser code. A browser grid uses endpoint mode: it calls your own route, which adds the key. `@specstory/ai-data-grid/server` (`createJevHandler`) builds that route. Direct mode (the key in the config) is for Node only: in a browser it refuses to run unless you set `dangerouslyAllowBrowser`, and even then the call fails, because TypeSafe's API rejects browser CORS requests. `@specstory/ai-data-grid/testing` (`createMockJev`) is a mock Jev for tests and demos.
- **Where to read more:** the AI Fill guide on the docs site, https://ai-data-grid-docs.vercel.app/docs/ai-fill (setup, connecting to Jev, the primitives, result policies, review, undo, examples and limitations), and the "AI Fill" chapter of [API.md](packages/core/API.md#ai-fill), the full reference. The guide's source is in [`docs/content/docs/ai-fill/`](docs/content/docs/ai-fill/index.mdx).
- **Demos:** 13 Storybook stories under **AI-Data-Grid / AI Fill**, running against the mock with seeded answers, so they never call Jev unless you point a story's endpoint URL control at your own endpoint.
- **Not on npm yet.** The guide and the AI Fill stories are on the hosted docs site and Storybook, but like the rest of 7.0.0, AI Fill isn't on npm yet.

## Migrating from 6.x

7.0.0 needs React 19 (`^19.0.0`). React 16, 17 and 18 are not supported, so if your app is on one of them, upgrade it to React 19 first, then switch packages.

7.0.0 keeps every exported name and prop, `DataEditor`, the `--gdg-*` CSS variables and the `gdg-` class names. Change only the package names in your `package.json` and imports:

| 6.x package | 7.0.0 package |
| --- | --- |
| `@glideapps/glide-data-grid` | `@specstory/ai-data-grid` |
| `@glideapps/glide-data-grid-cells` | `@specstory/ai-data-grid-cells` |
| `@glideapps/glide-data-grid-source` | `@specstory/ai-data-grid-source` |

For example, the CSS import becomes `import "@specstory/ai-data-grid/dist/index.css";`. If you use the cells package's ArticleCell, remove your Toast UI Editor CSS import: the article editor's styles are now part of `@specstory/ai-data-grid-cells/dist/index.css`. Raw HTML inside articles is now shown as its source text instead of being rendered. See the [7.0.0 release notes](packages/core/CHANGELOG.md) for details.

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

**The article cell's editor has no styling**

Import `@specstory/ai-data-grid-cells/dist/index.css` once in your app; it includes the article editor's styles. There's no separate stylesheet and nothing to install from `@toast-ui/*`. See the [cells README](packages/cells/README.md#note-on-articlecell), which also describes how articles are saved, how their content is protected, and the limitations.

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
