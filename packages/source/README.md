<h1 align="center">
  <b>AI Data Grid Source</b>
</h1>
<p align="center">React hooks that add data source features, such as sorting, movable columns and undo/redo, to AI Data Grid (<code>@specstory/ai-data-grid</code>).</p>

<p align="center">Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.</p>

Needs React 19 (`react` and `react-dom` peer range `^19.0.0`). React 16, 17 and 18 are not supported. `lodash` is a peer dependency.

Links: [documentation](https://ai-data-grid-docs.vercel.app/docs) · [Storybook](https://ai-data-grid-storybook.vercel.app) · [npm](https://www.npmjs.com/package/@specstory/ai-data-grid-source) · [issues](https://github.com/specstoryai/ai-data-grid/issues)

Source: https://github.com/specstoryai/ai-data-grid

Release notes: the 7.0.0 notes for all three packages are in the core package's `CHANGELOG.md` (https://cdn.jsdelivr.net/npm/@specstory/ai-data-grid@7.0.0/CHANGELOG.md).

# Installation

```shell
npm i @specstory/ai-data-grid @specstory/ai-data-grid-source lodash
```

# Hooks

| Hook | What it does |
| --- | --- |
| `useColumnSort` | Wraps `getCellContent` so rows come back sorted by one or more columns (`sort: { column, direction?: "asc" \| "desc", mode?: "default" \| "raw" \| "smart" }`). Returns `getCellContent` and `getOriginalIndex`. |
| `useMoveableColumns` | Keeps column order in state and returns `columns`, `getCellContent` and `onColumnMoved` for drag-to-reorder. |
| `useCollapsingGroups` | Collapses and expands column groups when their group header is clicked. |
| `useAsyncDataSource` | Loads rows page by page and caches them for `getCellContent`. |
| `useUndoRedo` | Records cell edits and provides undo and redo. |

Each hook takes a subset of `DataEditor` props and returns props to pass on, so they compose:

```tsx
import { DataEditor } from "@specstory/ai-data-grid";
import { useColumnSort, useMoveableColumns } from "@specstory/ai-data-grid-source";

const moveArgs = useMoveableColumns({ columns, getCellContent });
const sortArgs = useColumnSort({
    columns: moveArgs.columns,
    getCellContent: moveArgs.getCellContent,
    rows,
    sort: { column: moveArgs.columns[0], direction: "asc" },
});

return <DataEditor {...moveArgs} getCellContent={sortArgs.getCellContent} rows={rows} />;
```

## Migrating from 6.x

The API is unchanged from the 6.x source package, but 7.0.0 needs React 19. If your app is on React 16, 17 or 18, upgrade it to React 19 first. Then change the package names only:

| 6.x package | 7.0.0 package |
| --- | --- |
| `@glideapps/glide-data-grid` | `@specstory/ai-data-grid` |
| `@glideapps/glide-data-grid-source` | `@specstory/ai-data-grid-source` |

## License

MIT. See `LICENSE`. Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.
