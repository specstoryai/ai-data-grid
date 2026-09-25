<h1 align="center">
  <b>AI Data Grid Source</b>
</h1>
<p align="center">React hooks that add data source features, such as sorting, movable columns and undo/redo, to AI Data Grid (<code>@specstory/ai-data-grid</code>).</p>

<p align="center">Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.</p>

Supports React 16.12 or later, including 17, 18 and 19 (peer range `^16.12.0 || 17.x || 18.x || 19.x`). `lodash` is a peer dependency.

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

The API is unchanged from the 6.x source package. Change the package names only:

| 6.x package | 7.0.0 package |
| --- | --- |
| `@glideapps/glide-data-grid` | `@specstory/ai-data-grid` |
| `@glideapps/glide-data-grid-source` | `@specstory/ai-data-grid-source` |

## License

MIT. See `LICENSE`. Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.
