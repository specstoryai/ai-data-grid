<h1 align="center">
  <b>AI Data Grid</b>
</h1>
<p align="center">A canvas-based React data grid, supporting <b>millions</b> of rows, <b>rapid</b> updating, and <b>native scrolling</b>.</p>

<p align="center">Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.</p>

`@specstory/ai-data-grid` is the core package of AI Data Grid. Version 7.0.0 is API-compatible with the 6.x releases it was forked from, so existing users only change import paths (see [Migrating from 6.x](#migrating-from-6x)).

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

The packages support React 16.12 or later, including 17, 18 and 19 (peer range `^16.12.0 || 17.x || 18.x || 19.x`). Install the data grid:

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

The API reference, including the HTML/CSS prerequisites, is in `API.md`, which ships in this package.

## Migrating from 6.x

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

The easiest way to use the grid with Next is to create a component which wraps up your grid and then import it as a dynamic.

home.tsx

```tsx
import type { NextPage } from "next";
import dynamic from "next/dynamic";
import styles from "../styles/Home.module.css";

const Grid = dynamic(
    () => {
        return import("../components/Grid");
    },
    { ssr: false }
);

export const Home: NextPage = () => {
    return (
        <div className={styles.container}>
            <main className={styles.main}>
                <h1 className={styles.title}>Hi</h1>
                <Grid />
            </main>
        </div>
    );
};
```

grid.tsx

```tsx
import React from "react";
import DataEditor from "@specstory/ai-data-grid";

export default function Grid() {
    return <DataEditor {...args} />;
}
```

## License

MIT. See `LICENSE`. Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.
