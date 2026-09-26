# Basic Usage

## HTML/CSS Prerequisites

The Grid depends on there being a root level "portal" div in your HTML. Insert this snippet as the last child of your `<body>` tag:

```HTML
<div id="portal" style="position: fixed; left: 0; top: 0; z-index: 9999;" />
```

or you can create a portal element yourself using the `createPortal` function from `react-dom` and pass it to the DataEditor via the `portalElementRef` prop.

```jsx
const portalRef = useRef(null);
<>
  {
    createPortal(
      <div ref={portalRef} style="position: fixed; left: 0; top: 0; z-index: 9999;" />,
      document.body
    )
  }
  <DataEditor width={500} height={300} portalElementRef={portalRef} {...props} />
</>
```

Once you've got that done, the easiest way to use the Data Grid is to give it a fixed size:

```jsx
<DataEditor width={500} height={300} {...props} />
```

## Changes to your data

The Grid will never change any of your underlying data. You have to do so yourself when one of the callbacks is invoked. For example, when the user edits the value in a cell, the Grid will invoke the `onCellEdited` callback. If you don't implement that callback, or if it doesn't change the undelying data to the new value, the Grid will keep displaying the old value.

Note that there is currently no way to tell the grid that data has changed. It has to be forced to redraw by passing a different object to the `getCellContent` property. This triggers the entire grid to redraw. You should avoid changing the `getCellContent` object ID as much as possible otherwise.

If you want to use the default Image overlay preview you must remember to include the react-responsive-carousel css file or it will not function correctly. This should be available in your node-modules.

```ts
import "react-responsive-carousel/lib/styles/carousel.min.css";
```

## A note on col/row values

Grid always passes col/row coordinate pairs in the format [col, row] and never [row, col]. This is to more accurately match an [x, y] world, even though most english speakers will tend to say "row col".

# API Overview

Details of each property can be found by clicking on it.

## Types

| Name                            | Description                                                           |
| ------------------------------- | --------------------------------------------------------------------- |
| [GridColumn](#gridcolumn)       | A column description. Passed to the `columns` property.               |
| [GridCell](#gridcell)           | The basic interface for defining a cell                               |
| [GridSelection](#gridselection) | The most basic representation of the selected cells in the data grid. |
| [Theme](#theme)                 | The theme used by the data grid to get all color and font information |

## Ref Methods

| Name                                                | Description                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [appendRow](#appendrow)                             | Append a row to the data grid.                                                                               |
| [appendColumn](#appendcolumn)                       | Append a column to the data grid.                                                                            |
| [emit](#emit)                                       | Used to emit commands normally emitted by keyboard shortcuts.                                                |
| [focus](#focus)                                     | Focuses the data grid.                                                                                       |
| [getBounds](#getbounds)                             | Gets the current screen-space bounds of a desired cell.                                                      |
| [remeasureColumns](#remeasurecolumns)               | Causes the columns in the selection to have their natural sizes recomputed and re-emitted as a resize event. |
| [scrollTo](#scrollto)                               | Tells the data-grid to scroll to a particular location.                                                      |
| [updateCells](#updatecells)                         | Invalidates the rendering of a list of passed cells.                                                         |
| [getMouseArgsForPosition](#getmouseargsforposition) | Gets the mouse args from pointer event position.                                                             |
| [aiFill](#dataeditorrefaifill)                      | AI Fill's API, on a grid with the `aiFill` prop once AI Fill has loaded; `undefined` otherwise.              |

## Required Props

All data grids must set these props. These props are the bare minimum required to set up a functional data grid. Not all features will function with only these props but basic functionality will be present.

| Name                              | Description                                             |
| --------------------------------- | ------------------------------------------------------- |
| [columns](#columns)               | All columns in the data grid.                           |
| [getCellContent](#getcellcontent) | A callback to get the content of a given cell location. |
| [rows](#rows)                     | The number of rows in the data-grid.                    |

## Important Props

Most data grids will want to set the majority of these props one way or another.

| Name                                              | Description                                                                                                                                                                                                                                                         |
|---------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [aiFill](#quick-start-aifill-prop)                | Turns on AI Fill: AI-filled columns powered by Jev, with suggestions, review, accept and undo. Unset, the grid is unchanged and no AI code loads. See [AI Fill](#ai-fill).                                                                                           |
| [fixedShadowX](#fixedshadow)                      | Enable/disable a shadow behind fixed columns on the X axis.                                                                                                                                                                                                         |
| [fixedShadowY](#fixedshadow)                      | Enable/disable a shadow behind the header(s) on the Y axis.                                                                                                                                                                                                         |
| [freezeColumns](#freezecolumns)                   | The number of columns which should remain in place when scrolling horizontally. The row marker column, if enabled is always frozen and is not included in this count.                                                                                               |
| [getCellsForSelection](#getcellsforselection)     | Used to fetch large amounts of cells at once. Used for copy/paste, if unset copy will not work.                                                                                                                                                                     |
| [markdownDivCreateNode](#markdowndivcreatenode)   | If specified, it will be used to render Markdown, instead of the default Markdown renderer used by the Grid. You'll want to use this if you need to process your Markdown for security purposes, or if you want to use a renderer with different Markdown features. |
| [onVisibleRegionChanged](#onvisibleregionchanged) | Emits whenever the visible rows/columns changes.                                                                                                                                                                                                                    |
| [provideEditor](#provideeditor)                   | Callback for providing a custom editor for a cell.                                                                                                                                                                                                                  |
| [portalElementRef](#portalelementref)             | A ref to the portal element to use for the overlay editor.                                                                                                                                                                                                          |
| [rowHeight](#rowheight)                           | Callback or number used to specify the height of a given row.                                                                                                                                                                                                       |
| [rowMarkers](#rowmarkers)                         | Enable/disable row marker column on the left. Can show row numbers, selection boxes, or both.                                                                                                                                                                       |
| [smoothScrollX](#smoothscroll)                    | Enable/disable smooth scrolling on the X axis.                                                                                                                                                                                                                      |
| [smoothScrollY](#smoothscroll)                    | Enable/disable smooth scrolling on the Y axis.                                                                                                                                                                                                                      |

## Search

| Name                                              | Description                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [onSearchClose](#onsearchclose)                   | Emitted when the search interface close button is clicked.                            |
| [onSearchResultsChanged](#onsearchresultschanged) | Emitted when the search results change.                                               |
| [onSearchValueChange](#onsearchvaluechange)       | Emitted when the user types a new value into the search box.                          |
| [searchResults](#searchresults)                   | Overrides the search results and highlights all items for the user to enumerate over. |
| [searchValue](#searchvalue)                       | Sets the search value for the search box.                                             |
| [showSearch](#showsearch)                         | Show/hide the search interface.                                                       |

## Styling

| Name                                        | Description                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| [getGroupDetails](#getgroupdetails)         | Callback to provide additional details for group headers such as icons. |
| [getRowThemeOverride](#getrowthemeoverride) | Callback to provide theme override for any row.                         |
| [groupHeaderHeight](#groupheaderheight)     | The height in pixels of the column group headers.                       |
| [headerHeight](#headerheight)               | The height in pixels of the column headers.                             |
| [headerIcons](#headericons)                 | Additional header icons for use by `GridColumn`.                        |
| [overscrollX](#overscroll)                  | Allows overscrolling the data grid horizontally by a set amount.        |
| [overscrollY](#overscroll)                  | Allows overscrolling the data grid vertically by a set amount.          |
| [rightElement](#rightelement)               | A node which will be placed at the right edge of the data grid.         |
| [rightElementProps](#rightelement)          | Changes how the right element renders.                                  |
| [rowMarkerStartIndex](#rowmarkerstartindex) | The index of the first element in the grid                              |
| [rowMarkerTheme](#rowmarkertheme)           | Overrides the theme for row markers                                     |
| [rowMarkerWidth](#rowmarkerwidth)           | The width of the row markers.                                           |
| [scaleToRem](#scaletorem)                   | Scales most elements in the theme to match rem scaling automatically    |
| [verticalBorder](#verticalborder)           | Enable/disable vertical borders for any `GridColumn`                    |

## Selection Handling

| Name                                               | Description                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [columnSelect](#rangeselect)                       | Controls if multiple columns can be selected at once.                                                   |
| [columnSelectionBlending](#rangeselectionblending) | Controls how column selections may be mixed with other selection types.                                 |
| [drawFocusRing](#drawfocusring)                    | Determins if the focus ring should be drawn by the grid.                                                |
| [fillHandle](#fillhandle)                          | Controls the presence of the fill indicator                                                             |
| [gridSelection](#gridselection)                    | The current selection active in the data grid. Includes both the selection cell and the selected range. |
| [highlightRegions](#highlightregions)              | Adds additional highlights to the data grid for showing contextually important cells.                   |
| [onGridSelectionChange](#gridselection)            | Emitted whenever the `gridSelection` should change.                                                     |
| [onSelectionCleared](#onselectioncleared)          | Emitted when the selection is explicitly cleared.                                                       |
| [rangeSelect](#rangeselect)                        | Controls if multiple ranges can be selected at once.                                                    |
| [rangeSelectionBlending](#rangeselectionblending)  | Controls how range selections may be mixed with other selection types.                                  |
| [rowSelect](#rangeselect)                          | Controls if multiple rows can be selected at aonce.                                                     |
| [rowSelectionBlending](#rangeselectionblending)    | Controls how row selections may be mixed with other selection types.                                    |
| [spanRangeBehavior](#spanrangebehavior)            | Determines if the `gridSelection` should allow partial spans or not.                                    |

## Editing

| Name                                          | Description                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [coercePasteValue](#coercepastevalue)         | Allows coercion of pasted values.                                                                                                  |
| [imageEditorOverride](#imageeditoroverride)   | Used to provide an override to the default image editor for the data grid. `provideEditor` may be a better choice for most people. |
| [onCellEdited](#oncelledited)                 | Emitted whenever a cell edit is completed.                                                                                         |
| [onCellsEdited](#oncelledited)                | Emitted whenever a cell edit is completed and provides all edits inbound as a single batch.                                        |
| [onDelete](#ondelete)                         | Emitted whenever the user has requested the deletion of the selection.                                                             |
| [onFillPattern](#onfillpattern)               | Emitted when the fill handle is used to replace the contents of a region of the grid.                                              |
| [onFinishedEditing](#onfinishedediting)       | Emitted when editing has finished, regardless of data changing or not.                                                             |
| [onGroupHeaderRenamed](#ongroupheaderrenamed) | Emitted whe the user wishes to rename a group.                                                                                     |
| [onPaste](#onpaste)                           | Emitted any time data is pasted to the grid. Allows controlling paste behavior.                                                    |
| [onRowAppended](#trailingrowoptions)          | Emitted whenever a row append operation is requested. Append location can be set in callback.                                      |
| [onColumnAppended](#oncolumnappended)         | Emitted whenever a column append operation is requested. Append location can be set in callback.                                   |
| [trailingRowOptions](#trailingrowoptions)     | Controls the built in trailing row to allow appending new rows.                                                                    |

## Input Interaction

| Name                                                  | Description                                                                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [keybindings](#keybindings)                           | Controls which keybindings are enabled while the grid is selected.                                                                                                                  |
| [maxColumnAutoWidth](#maxcolumnwidth)                 | Sets the maximum width a column can be auto-sized to.                                                                                                                               |
| [maxColumnWidth](#maxcolumnwidth)                     | Sets the maximum width the user can resize a column to.                                                                                                                             |
| [minColumnWidth](#maxcolumnwidth)                     | Sets the minimum width the user can resize a column to.                                                                                                                             |
| [onCellActivated](#oncellactivated)                   | Emitted when a cell is activated, such as by pressing Enter, Space, double clicking, or typing.                                                                                     |
| [onCellClicked](#oncellclicked)                       | Emitted when a cell is clicked.                                                                                                                                                     |
| [onCellContextMenu](#oncellcontextmenu)               | Emitted when a cell should show a context menu. Usually right click.                                                                                                                |
| [onColumnMoved](#oncolumnmoved)                       | Emitted when a column has been dragged to a new location.                                                                                                                           |
| [onColumnResize](#oncolumnresize)                     | Emitted when a column has been resized to a new size.                                                                                                                               |
| [onColumnResizeEnd](#oncolumnresize)                  | Emitted when a column has been resized to a new size and the user has stopped interacting wtih the resize handle.                                                                   |
| [onGroupHeaderClicked](#ongroupheaderclicked)         | Emitted when a group header is clicked.                                                                                                                                             |
| [onGroupHeaderContextMenu](#ongroupheadercontextmenu) | Emitted when a group header should show a context menu. Usually right click.                                                                                                        |
| [onHeaderClicked](#onheaderclicked)                   | Emitted when a column header is clicked.                                                                                                                                            |
| [onHeaderContextMenu](#onheadercontextmenu)           | Emitted when a column header should show a context menu. Usually right click.                                                                                                       |
| [onHeaderMenuClick](#onheadermenuclick)               | Emitted when the menu dropdown arrow on a column header is clicked.                                                                                                                 |
| [onItemHovered](#onitemhovered)                       | Emitted when the hovered item changes.                                                                                                                                              |
| [onKeyDown](#onkey)                                   | Emitted when a key is pressed.                                                                                                                                                      |
| [onKeyUp](#onkey)                                     | Emitted when a key is released.                                                                                                                                                     |
| [onMouseMove](#onmousemove)                           | Emitted whenever the mouse moves. Be careful, can cause performance issues.                                                                                                         |
| [onRowMoved](#onrowmoved)                             | Emitted when a row has been dragged to a new location.                                                                                                                              |
| [preventDiagonalScrolling](#preventdiagonalscrolling) | Prevents diagonal scrolling                                                                                                                                                         |
| [rowSelectionMode](#rowselectionmode)                 | Determines if row selection requires a modifier key to enable multi-selection or not.                                                                                               |
| [columnSelectionMode](#columnselectionmode)           | Determines if column selection requires a modifier key to enable multi-selection or not.                                                                                             |
| [scrollToEnd](#scrolltoend)                           | When set to true, the grid will scroll to the end. The ref has a better method to do this and this prop should not be used but it will remain supported for the foreseeable future. |
| [showMinimap](#showminimap)                           | Shows the interactive minimap of the grid.                                                                                                                                          |
| [validateCell](#validatecell)                         | When returns false indicates to the user the value will not be accepted. When returns a new GridCell the value is coerced to match.                                                 |

## Drag and Drop

| Name                      | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| [onDragLeave](#ondrop)    | Emitted when an external drag event exits the drop region.    |
| [onDragOverCell](#ondrop) | Emitted when an external drag event is started over a cell.   |
| [onDrop](#ondrop)         | Emitted when an external drag event is completed on the grid. |

## Custom Cells

| Name                               | Description                                            |
| ---------------------------------- | ------------------------------------------------------ |
| [customRenderers](#customRenderer) | Custom renderers for `GridCellKind.Custom`.            |
| [renderers](#renderers)            | Overrides built-in cell renderers.                     |
| [drawCell](#drawcell)              | Callback used to override the rendering of any cell.   |
| [drawHeader](#drawheader)          | Callback used to override the rendering of any header. |

## Rarely Used

| Name                                    | Description                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [experimental](#experimental)           | Contains experimental flags. Nothing in here is considered stable API and is mostly used for features that are not yet settled.                     |
| [imageWindowLoader](#imagewindowloader) | Replaces the default image window loader with an externally provided one. Useful for cases where images need to be loaded in a non-standard method. |
| [initialSize](#initialsize)             | Passing this enables the grid to optimize its first paint and avoid a flicker. Only useful if the grid size is known ahead of time.                 |
| [isDraggable](#isdraggable)             | Makes the grid as a whole draggable. Disables many interactions.                                                                                    |
| [isOutsideClick](#isoutsideclick)       | Allows bypassing the default outside click handler for overlay editors.                                                                             |
| [onDragStart](#isdraggable)             | Emitted when a drag starts and `isDraggable` is true.                                                                                               |
| [scrollOffsetX](#scrolloffset)          | Sets the initial scroll offset in the x direction.                                                                                                  |
| [scrollOffsetY](#scrolloffset)          | Sets the initial scroll offset in the y direction.                                                                                                  |

# Keybindings

| Key Combo                    | Default | Flag                | Description                                                                              |
| ---------------------------- | ------- | ------------------- | ---------------------------------------------------------------------------------------- |
| Arrow                        | ✔️      | N/A                 | Moves the currently selected cell and clears other selections                            |
| Shift + Arrow                | ✔️      | N/A                 | Extends the current selection range in the direction pressed.                            |
| Alt + Arrow                  | ✔️      | N/A                 | Moves the currently selected cell and retains the current selection                      |
| Ctrl/Cmd + Arrow \| Home/End | ✔️      | N/A                 | Move the selection as far as possible in the direction pressed.                          |
| Ctrl/Cmd + Shift + Arrow     | ✔️      | N/A                 | Extends the selection as far as possible in the direction pressed.                       |
| Shift + Home/End             | ✔️      | N/A                 | Extends the selection as far as possible in the direction pressed.                       |
| Ctrl/Cmd + A                 | ✔️      | `selectAll`         | Selects all cells.                                                                       |
| Shift + Space                | ✔️      | `selectRow`         | Selecs the current row.                                                                  |
| Ctrl + Space                 | ✔️      | `selectCol`         | Selects the current col.                                                                 |
| PageUp/PageDown              | ✔️      | `pageUp`/`pageDown` | Moves the current selection up/down by one page.                                         |
| Escape                       | ✔️      | `clear`             | Clear the current selection.                                                             |
| Ctrl/Cmd + D                 | ❌      | `downFill`          | Data from the first row of the range will be down filled into the rows below it          |
| Ctrl/Cmd + R                 | ❌      | `rightFill`         | Data from the first column of the range will be right filled into the columns next to it |
| Ctrl/Cmd + C                 | ✔️      | `copy`              | Copies the current selection.                                                            |
| Ctrl/Cmd + V                 | ✔️      | `paste`             | Pastes the current buffer into the grid.                                                 |
| Ctrl/Cmd + F                 | ❌      | `search`            | Opens the search interface.                                                              |
| Ctrl/Cmd + Home/End          | ✔️      | `first`/`last`      | Move the selection to the first/last cell in the data grid.                              |
| Ctrl/Cmd + Shift + Home/End  | ✔️      | `first`/`last`      | Extend the selection to the first/last cell in the data grid.                            |

# Full API Docs

## GridColumn

Grid columns are the basic horizontal building block of the data grid. At their most basic level a `GridColumn` is just an object which contains a `title` and a `width` or `id`. Their type looks like:

```ts
interface BaseGridColumn {
    readonly title: string;
    readonly group?: string;
    readonly icon?: GridColumnIcon | string;
    readonly overlayIcon?: GridColumnIcon | string;
    readonly hasMenu?: boolean;
    readonly style?: "normal" | "highlight";
    readonly grow?: number;
    readonly themeOverride?: Partial<Theme>;
    readonly trailingRowOptions?: {
        readonly hint?: string;
        readonly addIcon?: string;
        readonly targetColumn?: number | GridColumn;
        readonly themeOverride?: Partial<Theme>;
        readonly disabled?: boolean;
    };
}

interface SizedGridColumn extends BaseGridColumn {
    readonly width: number;
    readonly id?: string;
}

interface AutoGridColumn extends BaseGridColumn {
    readonly id: string;
}

export type GridColumn = SizedGridColumn | AutoGridColumn;
```

| Property           | Description                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| title              | The title of the column                                                                                                                  |
| group              | The name of the group the column belongs to                                                                                              |
| icon               | The icon the column belongs to. The icon must be either one of the predefined icons or an icon passed to the `headerIcons` prop          |
| overlayIcon        | An icon which is painted on top offset bottom right of the `icon`. Must be a predefined icon or an icon passed to the `headerIcons` prop |
| hasMenu            | Enables/disables the menu dropdown indicator. If not enabled, `onHeaderMenuClick` will not be emitted.                                   |
| style              | Makes the column use the highlighted theming from the `Theme`. `themeOverride` can be used to perform the same effect.                   |
| grow               | When set to a number > 0 the column will grow to consume extra available space according to the weight of its grow property.             |
| themeOverride      | A `Partial<Theme>` which can be used to override the theming of the header as well as all cells within the column.                       |
| trailingRowOptions | Overrides the `DataEditor` level prop for [`trailingRowOptions`](#trailingrowoptions) for this column                                    |

---

## GridCell

`GridCell` is the basic content building block of a data grid. There are many types of cells available out of the box and more available in additional packages.

| Cell Kind | Description                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Uri       | Displays uris. Can be edited.                                                                                  |
| Text      | Displays arbitrary text.                                                                                       |
| Image     | Displays one or more images.                                                                                   |
| RowID     | Designed to show primary keys in data sources.                                                                 |
| Number    | Displays numbers with formatting options and better editing support.                                           |
| Bubble    | Displays lists of data in little bubbles.                                                                      |
| Boolean   | Displays a checkbox which can be directly edited if desired.                                                   |
| Loading   | Useful for when data is loading. Rendering is basically free.                                                  |
| Markdown  | Displays markdown when opened.                                                                                 |
| Drilldown | Similar to a bubble cell, but allows embedding text and images with each cell.                                 |
| Protected | Displays stars instead of data. Useful for indicating that hidden data is present but unavailable to the user. |
| Custom    | Has no rendering by default and must be provided via a custom renderer                                         |

All grid cells support the following properties

```ts
interface BaseGridCell {
    readonly allowOverlay: boolean;
    readonly lastUpdated?: number;
    readonly style?: "normal" | "faded";
    readonly themeOverride?: Partial<Theme>;
    readonly span?: readonly [number, number];
    readonly contentAlign?: "left" | "right" | "center";
    readonly cursor?: CSSProperties["cursor"];
}
```

| Property      | Description                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| allowOverlay  | Determins if an overlay editor or previewer should be shown when activating this cell.                                                                  |
| lastUpdated   | If set, the grid will render this cell with a highlighted background which fades out. Uses performance.now() instead of Date.now().                     |
| style         | If set to `faded` the cell will draw with a transparent appearance.                                                                                     |
| themeOverride | A partial theme override to use when drawing this cell.                                                                                                 |
| span          | If set the `span` controls which horizontal span a cell belongs to. Spans are inclusive and must be correctly reported for all cells in the span range. |
| contentAlign  | Changes the default text alignment for the cell.                                                                                                        |
| cursor        | An override for the cell cursor when hovered.                                                                                                           |

---

## GridSelection

`GridSelection` is the most basic representation of the selected cells, rows, and columns in the data grid. The `current` property accounts for the selected cell and the range of cells selected as well. It is the selection which is modified by keyboard and mouse interaction when clicking on the cells themselves.

The `rows` and `columns` properties both account for the columns or rows which have been explicitly selected by the user. Selecting a range which encompases the entire set of cells within a column/row does not implicitly set it into this part of the collection. This allows for distinguishing between cases when the user wishes to delete all contents of a row/column and delete the row/column itself.

```ts
interface GridSelection {
    readonly current?: {
        readonly cell: Item;
        readonly range: Readonly<Rectangle>;
        readonly rangeStack: readonly Readonly<Rectangle>[];
    };
    readonly columns: CompactSelection;
    readonly rows: CompactSelection;
}
```

The `cell` is the [col, row] formatted cell which will have the focus ring drawn around it. The `range` should always include the `cell` and represents additional cells which can be edited via copy, delete and other events. The `range` may or may not include partial spans depending on the [`spanRangeBehavior`](#spanrangebehavior) set.

---

## Theme

The data grid uses the `Theme` provided to the DataEditer in the `theme` prop. This is used to style editors as well as the grid itself. The theme interface is flat. The data grid comes with a built in theme which it will use to fill in any missing values.

| Property              | Type                | CSS Variable                  | Description                                                                                                   |
| --------------------- | ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| accentColor           | string              | --gdg-accent-color            | The primary accent color of the grid. This will show up in focus rings and selected rows/headers.             |
| accentFg              | string              | --gdg-accent-fg               | A foreground color which works well on top of the accent color.                                               |
| accentLight           | string              | --gdg-accent-light            | A lighter version of the accent color used to hint selection.                                                 |
| textDark              | string              | --gdg-text-dark               | The standard text color.                                                                                      |
| textMedium            | string              | --gdg-text-medium             | A lighter text color used for non-editable data in some cases.                                                |
| textLight             | string              | --gdg-text-light              | An even lighter text color                                                                                    |
| textBubble            | string              | --gdg-text-bubble             | The text color used in bubbles                                                                                |
| bgIconHeader          | string              | --gdg-bg-icon-header          | The background color for header icons                                                                         |
| fgIconHeader          | string              | --gdg-fg-icon-header          | The foreground color for header icons                                                                         |
| textHeader            | string              | --gdg-text-header             | The header text color                                                                                         |
| textGroupHeader       | string \| undefined | --gdg-text-group-header       | The group header text color, if none provided the `textHeader` is used instead.                               |
| textHeaderSelected    | string              | --gdg-text-header-selected    | The text color used for selected headers                                                                      |
| bgCell                | string              | --gdg-bg-cell                 | The primary background color of the data grid.                                                                |
| bgCellMedium          | string              | --gdg-bg-cell-medium          | Used for disabled or otherwise off colored cells.                                                             |
| bgHeader              | string              | --gdg-bg-header               | The header background color                                                                                   |
| bgHeaderHasFocus      | string              | --gdg-bg-header-has           | The header background color when its column contains the selected cell                                        |
| bgHeaderHovered       | string              | --gdg-bg-header-hovered       | The header background color when it is hovered                                                                |
| bgGroupHeader         | string \| undefined | --gdg-bg-group-header         | The group header background color, if none provided the `bgHeader` is used instead.                           |
| bgGroupHeaderHovered  | string \| undefined | --gdg-bg-group-header-hovered | The group header background color when it is hovered, if none provided the `bgHeaderHovered` is used instead. |
| bgBubble              | string              | --gdg-bg-bubble               | The background color used in bubbles                                                                          |
| bgBubbleSelected      | string              | --gdg-bg-bubble-selected      | The background color used in bubbles when the cell is selected                                                |
| bgSearchResult        | string              | --gdg-bg-search-result        | The background color used for cells which match the search string                                             |
| borderColor           | string              | --gdg-border-color            | The color of all vertical borders and horizontal borders if a horizontal override is not provided             |
| horizontalBorderColor | string \| undefined | --gdg-horizontal-border-color | The horizontal border color override                                                                          |
| drilldownBorder       | string              | --gdg-drilldown-border        | The ring color of a drilldown cell                                                                            |
| linkColor             | string              | --gdg-link-color              | What color to render links                                                                                    |
| cellHorizontalPadding | number              | --gdg-cell-horizontal-padding | The internal horizontal padding size of a cell.                                                               |
| cellVerticalPadding   | number              | --gdg-cell-vertical-padding   | The internal vertical padding size of a cell.                                                                 |
| headerFontStyle       | string              | --gdg-header-font-style       | The font style of the header. e.g. `bold 15px`                                                                |
| baseFontStyle         | string              | --gdg-base-font-style         | The font style used for cells by default, e.g. `13px`                                                         |
| fontFamily            | string              | --gdg-font-family             | The font family used by the data grid.                                                                        |
| editorFontSize        | string              | --gdg-editor-font-size        | The font size used by overlay editors.                                                                        |
| lineHeight            | number              | None                          | A unitless scaler which defines the height of a line of text relative to the ink size.                        |
| bubbleHeight          | number              | --gdg-bubble-height           | The height (in pixels) of a bubble.                                                                           |
| bubblePadding         | number              | --gdg-bubble-padding          | The left & right padding (in pixels) of a bubble.                                                             |
| bubbleMargin          | number              | --gdg-bubble-margin           | The margin (in pixels) between bubbles.                                                                       |
| checkboxMaxSize       | number              | --gdg-checkbox-max-size       | The maximum size of checkboxes (in pixels), e.g. for boolean cell and row markers.                            |
| roundingRadius        | number \| undefined | --gdg-rounding-radius         | The radius of rounded corners used by various grid elements (in pixels).                                      |

---

## updateCells

Example usage:

```ts
dataGridRef.current.updateCells([{ cell: [10, 10] }, { cell: [11, 10] }, { cell: [12, 10] }]);
```

Causes the data grid to rerender these specific cells. Rerendering a single cell is significantly faster than invalidating the `getCellContent` callback as in the latter case all cells must be redrawn.

---

## getBounds

```ts
getBounds: (col?: number, row?: number) => Rectangle | undefined;
```

`getBounds` returns the current bounding box of a cell. This does not need to be a currently rendered cell. If called with `col` and `row` as undefined, the bounding box of the entire data grid scroll area is returned.

---

## scrollTo

```ts
scrollTo: (
        col: number,
        row: number,
        dir?: "horizontal" | "vertical" | "both",
        paddingX?: number,
        paddingY?: number,
        options?: {
            hAlign?: "start" | "center" | "end";
            vAlign?: "start" | "center" | "end";
            behavior?: ScrollBehavior; // "auto" | "smooth" | "instant"
        }
    ) => void;
```

Requests the data grid to scroll to a particular location. If only one direction is requested it will get as close as it can without scrolling the off axis. Padding can be applied to inset the cell by a certain amount.

---

| [focus](#focus) | Focuses the data grid. |
| [emit](#emit) | Used to emit commands normally emitted by keyboard shortcuts. |

## appendRow

```ts
appendRow: (
         col: number,
         openOverlay: boolean = true,
         behavior?: ScrollBehavior; // "auto" | "smooth" | "instant"
) => Promise<void>;
```

Appends a row to the data grid.

---

## appendColumn

```ts
appendColumn: (row: number, openOverlay?: boolean) => Promise<void>;
```

Appends a column to the data grid.

---

## focus

```ts
focus: () => void;
```

Causes the data grid to become focused.

---

## DataEditorRef.aiFill

```ts
aiFill?: AIFillApi;
```

AI Fill's API on a grid with the `aiFill` prop, once AI Fill has loaded; `undefined` before that and on a grid without the prop. See [The API](#the-api-aifillapi).

---

## emit

```ts
type EmitEvents = "copy" | "paste" | "delete" | "fill-right" | "fill-down";

emit: (eventName: EmitEvents) => Promise<void>;
```

Emits the event into the data grid as if the user had pressed the keyboard shortcut.

---

## getMouseArgsForPosition

```ts
getMouseArgsForPosition: (posX: number, posY: number, ev?: MouseEvent | TouchEvent) => GridMouseEventArgs | undefined;
```

Returns grid coordinates and context for a pointer event position. Useful for handling interactions outside of built-in callbacks.

---

## columns

```ts
columns: readonly GridColumn[];
```

`columns` is an array of objects of type `GridColumn` describing the column headers. The length of the array is the number of columns to display.

---

## rows

```ts
rows: number;
```

`rows` is the number of rows to display.

---

## getCellContent

```ts
getCellContent: (cell: Item) => GridCell;
```

`getCellContent` returns an object of type `GridCell` describing the contents for the cell at the given coordinates.

---

## freezeColumns

```ts
freezeColumns?: number;
```

Set to a positive number to freeze columns on the left side of the grid during horizontal scrolling.

---

## getCellsForSelection

```ts
type CellArray = readonly (readonly GridCell[])[];
type GetCellsThunk = () => Promise<CellArray>;

getCellsForSelection?: true | (selection: Rectangle) => CellArray | GetCellsThunk;
```

`getCellsForSelection` is called when the user copies a selection to the clipboard or the data editor needs to inspect data which may be outside the curently visible range. It must return a two-dimensional array (an array of rows, where each row is an array of cells) of the cells in the selection's rectangle. Note that the rectangle can include cells that are not currently visible.

If `true` is passed instead of a callback, the data grid will internally use the `getCellContent` callback to provide a basic implementation of `getCellsForSelection`. This can make it easier to light up more data grid functionality, but may have negative side effects if your data source is not able to handle being queried for data outside the normal window.

If `getCellsForSelection` returns a thunk, the data may be loaded asynchronously, however the data grid may be unable to properly react to column spans when performing range selections. Copying large amounts of data out of the grid will depend on the performance of the thunk as well.

---

## markdownDivCreateNode

```ts
markdownDivCreateNode?: (content: string) => DocumentFragment;
```

If `markdownDivCreateNode` is specified, then it will be used to render Markdown, instead of the default Markdown renderer used by the Grid. You'll want to use this if you need to process your Markdown for security purposes, or if you want to use a renderer with different Markdown features.

---

## onVisibleRegionChanged

```ts
onVisibleRegionChanged?: (
    range: Rectangle,
    tx: number,
    ty: number,
    extras: { selected?: Item; freezeRegion?: Rectangle };
) => void;
```

`onVisibleRegionChanged` is called whenever the visible region changed. The new visible region is passed as a `Rectangle`. The x and y transforms of the cell region are passed as `tx` and `ty`. The current selection and frozen region are passed in the `extras` object.

---

## provideEditor

```ts
export type ProvideEditorComponent<T extends InnerGridCell> = React.FunctionComponent<{
    readonly onChange: (newValue: T) => void;
    readonly onFinishedEditing: (newValue?: T, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
    readonly isHighlighted: boolean;
    readonly value: T;
    readonly initialValue?: string;
    readonly validatedSelection?: SelectionRange;
    readonly imageEditorOverride?: ImageEditorType;
    readonly markdownDivCreateNode?: (content: string) => DocumentFragment;
    readonly target: Rectangle;
    readonly forceEditMode: boolean;
    readonly isValid?: boolean;
}>;

export type ProvideEditorCallbackResult<T extends InnerGridCell> =
    | (ProvideEditorComponent<T> & {
          disablePadding?: boolean;
          disableStyling?: boolean;
      })
    | ObjectEditorCallbackResult<T>
    | undefined;

export type ProvideEditorCallback<T extends InnerGridCell> = (
    cell: T & { location?: Item; activation?: CellActivatedEventArgs }
) => ProvideEditorCallbackResult<T>;

provideEditor?: ProvideEditorCallback<GridCell>;
```

When provided the `provideEditor` callbacks job is to be a constructor for functional components which have the correct properties to be used by the data grid as an editor. The editor must implement `onChange` and `onFinishedEditing` callbacks as well support the `isHighlighted` flag which tells the editor to begin with any editable text pre-selected so typing will immediately begin to overwrite it.
The `cell` passed to this callback includes a `location` of the activated cell and an `activation` event describing how the editor was opened.

---

## portalElementRef

Defaults to div#portal

---

## rowHeight

```ts
rowHeight: number | ((index: number) => number);
```

`rowHeight` is the height of a row in the table. It defaults to `34`. By passing a function instead of a number you can give different heights to each row. The `index` is the zero-based absolute row index.

---

## rowMarkers

```ts
rowMarkers?: "checkbox" | "number" | "both" | "none";
```

`rowMarkers` determines whether to display the marker column on the very left. It defaults to `none`. Note that this column doesn't count as a table column, i.e. it has no index, and doesn't change column indexes.

---

## smoothScroll

```ts
smoothScrollX?: boolean;
smoothScrollY?: boolean;
```

Controls smooth scrolling in the data grid. Defaults to `false`. If smooth scrolling is not enabled the grid will always be cell aligned in the non-smooth scrolling axis.

---

## fixedShadow

```ts
fixedShadowX?: boolean;
fixedShadowY?: boolean;
```

Controls shadows behind fixed columns and header rows. Defaults to `true`.

---

## showSearch

```ts
showSearch?: boolean;
```

`showSearch` causes the search box built into the data grid to become visible. The data grid does not provide an in-built way to show the search box, so it is suggested to hook into the ctrl/cmd+f accelerator or add a button to your apps chrome.

---

## onSearchClose

```ts
onSearchClose?: () => void;
```

If `onSearchClose` is not provided and `showSearch` is set to true, the search box will be shown but there will be no close button. Providing an `onSearchClose` callback enables the close button and the event will emit when it is clicked.

---

## searchValue

```ts
readonly searchValue?: string;
```

This property is used to set the current search value in the data grid. It accepts a string that represents the term or phrase to be used for searching within the grid. By setting `searchValue`, you can programmatically control the search value.

---

## onSearchResultsChanged

```ts
readonly onSearchResultsChanged?: (results: readonly Item[], navIndex: number) => void;
```

This event handler is called when there is a change in the search results of the data grid's search field. It provides two parameters: `results` and `navIndex`. The `results` parameter is an array of `Item` objects, each representing a cell or row that matches the current search query. The `navIndex` parameter is the index of the currently selected or highlighted search result within the `results` array.

---

## onSearchValueChange

```ts
readonly onSearchValueChange?: (newVal: string) => void;
```

This event is emitted whenever the search value in the data grid changes. The handler `onSearchValueChange` is provided with a single argument `newVal`, which is the updated string value entered in the search field. Implementing this event allows you to execute custom actions in response to changes in the search input. This can include triggering search operations based on the new value, updating the user interface elements to reflect the change, or any other related functionality that needs to respond to updates in the search term within your data grid.

---

## searchResults

```ts
readonly searchResults?: readonly Item[];
```

This property allows you to specify the search results to be displayed in the data grid. If `searchResults` is not provided, the grid will use its internal search provider to determine and display search results. By setting the `searchResults` property, you can override the default search behavior and supply a custom array of `Item` objects as the search results. These `Item` objects typically refer to the cells or rows in the grid that match a custom search criterion. This is particularly useful if you need to implement a specialized search functionality that differs from the built-in search capabilities of the grid.

---

## drawCell

```ts
drawCell?: (
    args: {
        ctx: CanvasRenderingContext2D;
        cell: GridCell;
        theme: Theme;
        rect: Rectangle;
        col: number;
        row: number;
        hoverAmount: number;
        hoverX: number | undefined;
        hoverY: number | undefined;
        highlighted: boolean;
        imageLoader: ImageWindowLoader;
    },
    drawContent: () => void
) => void;
```

The `drawCell` property enables custom rendering of cells in the Grid. This function is called for each cell during the rendering process and is provided with a comprehensive set of parameters. These parameters include the drawing context (`ctx`), cell data (`cell`), theming details (`theme`), the cell's rectangle (`rect`), column and row indices (`col`, `row`), hover state information (`hoverAmount`, `hoverX`, `hoverY`), a highlight flag (`highlighted`), and an image loader (`imageLoader`).

Additionally, `drawCell` provides a `drawContent` method, which, when called, immediately draws the default content of the cell onto the canvas. This design offers flexibility in how you render each cell. For instance, you can first draw a custom background, then call `drawContent` to render the cell's standard contents, and finally add an overlay or additional embellishments. This approach allows for layered rendering, where you can seamlessly integrate custom graphics or styles with the grid's inherent rendering logic.

---

## drawHeader

```ts
drawHeader?: (args: {
    ctx: CanvasRenderingContext2D;
    column: GridColumn;
    theme: Theme;
    rect: Rectangle;
    hoverAmount: number;
    hoverX: number | undefined;
    hoverY: number | undefined;
    isSelected: boolean;
    isHovered: boolean;
    hasSelectedCell: boolean;
    spriteManager: SpriteManager;
    menuBounds: Rectangle;
}) => boolean;
```

`drawHeader` may be specified to override the rendering of a header. The grid will call this for every header it needs to render. Header rendering is not as well optimized because they do not redraw as often, but very heavy drawing methods can negatively impact horizontal scrolling performance. The return result works the same way as `drawCell`, `false` means the default rendering will happen and `true` means the default rendering will not happen.

It is possible to return `false` after rendering just a background and the regular foreground rendering will happen.

---

## renderers

```ts
readonly renderers?: readonly InternalCellRenderer<InnerGridCell>[];
```

An array of cell renderers used when drawing built-in cell types. Provide this prop to override default cell renderers. If omitted, `AllCellRenderers` is used.

---

## getGroupDetails

```ts
getGroupDetails?: (groupName: string) => ({
    name: string;
    icon?: string;
    overrideTheme?: Partial<Theme>;
    actions?: {
        title: string;
        onClick: (e: GridMouseGroupHeaderEventArgs) => void;
        icon: GridColumnIcon | string;
    }[];
});
```

`getGroupDetails` is invoked whenever a group header is rendered. The group details are used to provide a name override for the group as well as an icon, a list of actions which can be activated by the user, and an overrideTheme which will impact the rendering of all child cells of the group and all column headers in the group.

---

## getRowThemeOverride

```ts
getRowThemeOverride?: (row: number) => Partial<Theme> | undefined;
```

Whenever a row is rendered the row theme override is fetched if provided. This function should aim to be extremely fast as it may be invoked many times per render. All cells in the row have this theme merged into their theme prior to rendering.

---

## groupHeaderHeight

```ts
groupHeaderHeight?: number;
```

The height of the group headers in the data grid. If not provided this will default to the [`headerHeight`](#headerheight) value.

---

## headerHeight

```ts
headerHeight: number;
```

`headerHeight` is the height of the table header. It defaults to `36`.

---

## headerIcons

```ts
headerIcons?: Record<string, (spriteProps: { fgColor: string, bgColor: string }) => string>;
```

Providing custom header icons to the data grid must be done with a somewhat non-standard mechanism to allow theming and scaling. The `headerIcons` property takes a dictionary which maps icon names to functions which can take a foreground and background color and returns back a string representation of an svg. The svg should contain a header similar to this `<svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">` and interpolate the fg/bg colors into the string.

We recognize this process is not fantastic from a graphics workflow standpoint, improvements are very welcome here.

---

## overscroll

```ts
overscrollX?: number;
overscrollY?: number;
```

The overscroll properties are used to allow the grid to scroll past the logical end of the content by a fixed number of pixels. This is useful particularly on the X axis if you allow for resizing columns as it can make resizing the final column significantly easier.

---

## rightElement

```ts
rightElementProps?: {
    readonly sticky?: boolean;
    readonly fill?: boolean;
};
rightElement?: React.ReactNode;
```

The right element is a DOM node which can be inserted at the end of the horizontal scroll region. This can be used to create a right handle panel, make a big add button, or display messages. If `rightElementProps.sticky` is set to true the right element will be visible at all times, otherwise the user will need to scroll to the end to reveal it.

If `rightElementProps.fill` is set, the right elements container will fill to consume all remaining space (if any) at the end of the grid. This does not play nice with growing columns.

---

## rowMarkerStartIndex

```ts
readonly rowMarkerStartIndex?: number;
```

This property is used to set the starting index for row markers in a React component. The `rowMarkerStartIndex` accepts a numerical value that specifies the initial index from which the row markers in the data grid will begin counting. By default, this value is set to `1`. This property is particularly useful when you need the row numbering to start from a specific value other than the default, such as when displaying paginated data or aligning with an external data set's indexing.

---

## rowMarkerWidth

```ts
rowMarkerWidth?: number;
```

`rowMarkerWidth` is the width of the marker column on the very left. By default, it adapts based on the number of rows in your data set.

---

## scaleToRem

```ts
readonly scaleToRem?: boolean;
```

This property is a boolean flag that enables automatic scaling of most elements in the data grid's theme to match the REM (Root EM) scaling. When set to `true`, it adjusts the sizing of various elements like fonts, paddings, and other dimensions to align with the REM units defined in your application's styles. This ensures that the data grid's appearance is consistent with the overall scaling and typography of your application, especially in responsive designs or when dealing with accessibility requirements. The default value of this property is `false`, meaning that without explicit activation, the grid's elements will not automatically scale based on REM units.

---

## rowMarkerStartIndex

```ts
rowMarkerStartIndex?: number;
```

`rowMarkerStartIndex` is the starting index of your rows. Defaults to 1, however a custom value may be needed for situations such as paging.

---

## verticalBorder

```ts
verticalBorder?: ((col: number) => boolean) | boolean;
```

Controls the drawing of the left hand vertical border of a column. If set to a boolean value it controls all borders. Defaults to `true`.

---

## gridSelection

```ts
gridSelection?: GridSelection;
onGridSelectionChange?: (newSelection: GridSelection | undefined) => void;
```

The currently selected `cell` and `range` in the data grid. If provided the `onGridSelectionChange` event should also be used as this property is controlled via that event. If this property is not provided, nor should the `onGridSelectionChange` event be.

---

## spanRangeBehavior

```ts
spanRangeBehavior?: "default" | "allowPartial";
```

If set to `default` the `gridSelection` will always be expanded to fully include any spans within it. This means in some cases the `range` of the selection may be inflated to the size of the entire sheet, however the user will be unable to highlight partial spans.

If `allowPartial` is set no inflation behavior will be enforced.

---

## onSelectionCleared

```ts
onSelectionCleared?: () => void;
```

Emitted when the current selection is cleared, usually when the user presses "Escape". `rowSelection`, `columnSelection`, and `gridSelection` should all be empty when this event is emitted. This event only emits when the user explicitly attempts to clear the selection.

---

## rangeSelect

```ts
rangeSelect?: "none" | "cell" | "rect" | "multi-cell" | "multi-rect"; // default rect
columnSelect?: "none" | "single" | "multi"; // default multi
rowSelect?: "none" | "single" | "multi"; // default multi
```

Controls if multi-selection is allowed. If disabled, shift/ctrl/command clicking will work as if no modifiers are pressed.

When range select is set to cell, only one cell may be selected at a time. When set to rect one one rect at a time. The multi variants allow for multiples of the rect or cell to be selected.

---

## rangeSelectionBlending

```ts
rangeSelectionBlending?: "exclusive" | "mixed" | "additive"; // default exclusive
columnSelectionBlending?: "exclusive" | "mixed" | "additive"; // default exclusive
rowSelectionBlending?: "exclusive" | "mixed" | "additive"; // default exclusive
```

Controls which types of selections can exist at the same time in the grid. If selection blending is set to `exclusive`, the grid will clear other types of selections when the exclusive selection is made. By default row, column, and range selections are exclusive. If `mixed` is set, other types of selections are kept only when a multi-key (e.g., Cmd/Ctrl) is held. If `additive` is set, other types of selections are always kept; selections accumulate without a modifier.

---

## highlightRegions

```ts
interface Highlight {
    readonly color: string;
    readonly range: Rectangle;
}

highlightRegions?: readonly Highlight[];
```

Highlight regions are regions on the grid which get drawn with a background color and a dashed line around the region. The color string must be css parseable and the opacity will be removed for the drawing of the dashed line. Opacity should be used to allow overlapping selections to properly blend in background colors.

---

## fillHandle

```ts
fillHandle?: boolean | Partial<FillHandleConfig>;
```

Controls the presence of the fill handle used for filling cells with the mouse.

**Configuration for the fill-handle (the small drag handle that appears in the
bottom-right of the current selection).**

```ts
interface FillHandleConfig {
    /** Shape of the handle. Defaults to "square". */
    shape?: "square" | "circle";
    /** Width/height (or diameter for circles) in CSS pixels. Defaults to `4`. */
    size?: number;
    /** Horizontal offset from the bottom-right corner of the cell (px). */
    offsetX?: number;
    /** Vertical offset from the bottom-right corner of the cell (px). Default is `-2`. */
    offsetY?: number;
    /** Stroke width (px) of the outline that surrounds the handle. Defaults to `0`. */
    outline?: number;
}
```

---

## allowedFillDirections

```ts
allowedFillDirections?: "horizontal" | "vertical" | "orthogonal" | "any"; // default "orthogonal"
```

Controls which directions the fill-handle may extend when the user drags it.

- "horizontal": Only left/right expansion is allowed.
- "vertical": Only up/down expansion is allowed.
- "orthogonal": Expands to the closest orthogonal edge (up/down/left/right). This is the default.
- "any": Expands freely in both axes (forms a rectangle to the pointer).

---

## onFillPattern

```ts
onFillPattern?: (event: FillPatternEventArgs) => void;

interface FillPatternEventArgs extends PreventableEvent {
    patternSource: Rectangle;
    fillDestination: Rectangle;
}
```

Emitted whenever the user initiates a pattern fill using the fill handle. The event provides both the source
pattern region and the destination region about to be filled. Call `event.preventDefault()` to cancel the fill.

Example: prevent filling into protected regions

```ts
<DataEditor
  onFillPattern={e => {
    const { fillDestination } = e;
    if (/* your condition */ false) {
      e.preventDefault();
    }
  }}
  {...props}
/>
```

---

## onDelete

```ts
onDelete?: (selection: GridSelection) => GridSelection | boolean;
```

`onDelete` is called when the user deletes one or more rows. `gridSelection` is current selection. If the callback returns false, deletion will not happen. If it returns true, all cells inside all selected rows, columns and ranges will be deleted. If the callback returns a GridSelection, the newly returned selection will be deleted instead.

---

## imageEditorOverride

```ts
imageEditorOverride?: ImageEditorType;
```

If `imageEditorOverride` is specified, then it will be used instead of the default image editor overlay, which is what the user sees when they double-click on an image cell.

---

## onCellEdited

```ts
onCellEdited?: (cell: Item, newValue: EditableGridCell) => void;
onCellsEdited?: (newValues: readonly { location: Item; value: EditableGridCell }[]) => boolean | void;
```

`onCellEdited` is called when the user finishes editing a cell. Note that you are responsible for setting the new value of the cell.

`onCellsEdited` is called whenever a batch of cells is about to be edited. If the callback returns `true`, `onCellEdited` will not be called for an cells in the event.

---

## onDeleteRows

```ts
onDeleteRows?: (rows: readonly number[]) => void;
```

`onDeleteRows` is called when the user deletes one or more rows. `rows` is an array with the absolute indexes of the deletes rows. Note that it is on you to actually effect the deletion of those rows.

---

## onFinishedEditing

```ts
onFinishedEditing?: (newValue: GridCell | undefined, movement: Item) => void;
```

Emitted whenever the data grid exits edit mode. The movement indicates which direction the user requested the selection move towards. `-1` is left/up, `1` is right/down.

---

## onGroupHeaderRenamed

```ts
onGroupHeaderRenamed?: (groupName: string, newVal: string) => void
```

If provided group headers will have an icon allowing users to rename them. When a user renames a group header this event will be emitted. It is up to the developer to actually rename the header.

---

## onPaste

```ts
onPaste?: ((target: Item, values: readonly (readonly string[])[]) => boolean) | boolean;
```

`onPaste` is called when data is pasted into the grid. If left undefined, the `DataEditor` will operate in a fallback mode and attempt to paste the text buffer into the current cell assuming the current cell is not readonly and can accept the data type. If `onPaste` is set to false or the function returns false, the grid will simply ignore paste. If `onPaste` evaluates to true the grid will attempt to split the data by tabs and newlines and paste into available cells.

The grid will not attempt to add additional rows if more data is pasted then can fit. In that case it is advisable to simply return false from onPaste and handle the paste manually.

---

## coercePasteValue

```ts
coercePasteValue?: (val: string, cell: GridCell) => GridCell | undefined;
```

This callback allows coercion of pasted values before they are passed to edit functions. `val` contains the pasted value and `cell` is the target of the paste. Returning `undefined` will accept the default behavior of the grid, or a `GridCell` may be returned which will be used for paste instead.

---

## trailingRowOptions

```ts
trailingRowOptions?: {
    readonly tint?: boolean; // DataEditor level only
    readonly sticky?: boolean; // DataEditor level only
    readonly hint?: string;
    readonly addIcon?: string;
    readonly targetColumn?: number | GridColumn;
    readonly themeOverride?: Partial<Theme>; // GridColumn only
    readonly disabled?: boolean; // GridColumn only
}
```

---

## onRowAppended

```ts
onRowAppended?: () => Promise<"top" | "bottom" | number | undefined> | void;
```

`onRowAppended` controls adding new rows at the bottom of the Grid. If `onRowAppended` is defined, an empty row will display at the bottom. When the user clicks on one of its cells, `onRowAppended` is called, which is responsible for appending the new row. The appearance of the blank row can be configured using `trailingRowOptions`.

The callback can optionally return (or resolve to) one of the following values to control focus after the row is added:

- `"top"` – focus the first row in the grid.
- `"bottom"` – focus the last row in the grid (default behaviour).
- `number` – focus the row at the specified zero-based index.
- `undefined` – default focus behaviour (equivalent to `"bottom"`).

---

## onColumnAppended

```ts
onColumnAppended?: () => Promise<"left" | "right" | number | undefined> | void;
```

`onColumnAppended` controls adding new columns to the Grid. When defined, the callback is invoked when the user requests to append a column (for example by editing past the last column). Your implementation is responsible for inserting the new column into the `columns` prop supplied to the grid.

The callback can optionally return (or resolve to) one of the following values to control focus after the column is added:

- `"left"` – focus the first column in the grid.
- `"right"` – focus the last column in the grid (default behaviour).
- `number` – focus the column at the specified zero-based index.
- `undefined` – default focus behaviour (equivalent to `"right"`).

---

## maxColumnWidth

```ts
maxColumnWidth?: number;
minColumnWidth?: number;
```

If `maxColumnWidth` is set with a value greater than 50, then columns will have a maximum size of that many pixels.
If the value is less than 50, it will be increased to 50. If it isn't set, the default value will be 500.

---

## onCellClicked

```ts
onCellClicked?: (cell: Item) => void;
```

`onCellClicked` is called whenever the user clicks a cell in the grid.

---

## onCellActivated

```ts
onCellActivated?: (
    cell: Item,
    event: CellActivatedEventArgs
) => void;
```

`onCellActivated` is called whenever the user double clicks, presses Enter or Space, or begins typing with a cell selected. The second argument describes how the activation occurred.

The `event` parameter is one of:

- `KeyboardCellActivatedEvent` – contains `inputType: "keyboard"` and a `key` field with the physical key pressed.
- `PointerCellActivatedEvent` – contains `inputType: "pointer"`, a `pointerActivation` reason such as `"double-click"` or `"single-click"`, and an optional `pointerType` (`"mouse"`, `"touch"`, or `"pen"`).

---

## onCellContextMenu

---

## onColumnMoved

```ts
onColumnMoved?: (startIndex: number, endIndex: number) => void;
```

`onColumnMoved` is called when the user finishes moving a column. `startIndex` is the index of the column that was moved, and `endIndex` is the index at which it should end up. Note that you have to effect the move of the column, and pass the reordered columns back in the `columns` property.

---

## onColumnResize

```ts
onColumnResize?: (column: GridColumn, newSize: number, columnIndex: number) => void;
onColumnResizeEnd?: (column: GridColumn, newSize: number, columnIndex: number) => void;
```

`onColumnResize` is called when the user is resizing a column. `newSize` is the new size of the column. Note that you have change the size of the column in the `GridColumn` and pass it back to the grid in the `columns` property.
`onColumnReizeEnd` is called with the same arguments, but only once the user ceases interaction with the resize handle.

## onColumnResizeStart

```ts
onColumnResizeStart?: (column: GridColumn, newSize: number, columnIndex: number) => void;
```

`onColumnResize` is called when the user starts resizing a column. `newSize` is the new size of the column.

## onColumnResizeEnd

```ts
onColumnResizeEnd?: (column: GridColumn, newSize: number, columnIndex: number) => void;
```

`onColumnResize` is called when the user ends resizing a column. `newSize` is the new size of the column.

---

## onGroupHeaderClicked

```ts
onGroupHeaderClicked?: (colIndex: number, event: GroupHeaderClickedEventArgs) => void;
```

Emitted whenever a group header is clicked.

---

## onGroupHeaderContextMenu

```ts
onGroupHeaderContextMenu?: (colIndex: number, event: GroupHeaderClickedEventArgs) => void
```

Emitted whenever a group header's context menu should be presented, usually right click.

---

## onHeaderClicked

```ts
onHeaderClicked?: (colIndex: number, event: HeaderClickedEventArgs) => void;
```

Emitted whenever a header is clicked.

---

## onHeaderContextMenu

```ts
onHeaderContextMenu?: (colIndex: number, event: HeaderClickedEventArgs) => void;
```

Emitted whenever a column header's context menu should be presented, usually right click.

---

## onHeaderMenuClick

```ts
onHeaderMenuClick?: (col: number, screenPosition: Rectangle) => void;
```

`onHeaderMenuClick` is called when the user clicks the menu button on a column header. `col` is the column index, and `screenPosition` is the bounds of the column header. You are responsible for drawing and handling the menu.

---

## onItemHovered

```ts
onItemHovered?: (args: GridMouseEventArgs) => void;
```

`onItemHovered` is called when the user hovers over a cell, a header, or outside the grid.

---

## onMouseMove

```ts
onMouseMove?: (args: GridMouseEventArgs) => void;
```

Emitted any time the mouse moves. Most behaviors relying on this should be debounced for performance reasons.

---

## onRowMoved

```ts
onRowMoved?: (startIndex: number, endIndex: number) => void;
```

Called whenever a row re-order operation is completed. Setting the callback enables re-ordering by dragging the first column of a row.

---

## preventDiagonalScrolling

```ts
preventDiagonalScrolling?: booling;
```

Set to true to prevent any diagonal scrolling.

---

## rowSelectionMode

```ts
rowSelectionMode?: "auto" | "multi";
```

`rowSelectionMode` changes how selecting a row marker behaves. In auto mode it adapts to touch or mouse environments automatically, in multi-mode it always acts as if the multi key (Ctrl) is pressed.

---

## columnSelectionMode

```ts
columnSelectionMode?: "auto" | "multi";
```

`columnSelectionMode` changes how selecting columns behaves. In auto mode it adapts to touch or mouse environments automatically, in multi-mode it always acts as if the multi key (Ctrl) is pressed.

---

## showMinimap

```ts
showMinimap?: boolean;
```

Enables/disables the interactive minimap. Default to `false`.

---

## scrollToEnd

```ts
scrollToEnd?: boolean;
```

When this property changes to `true`, the Grid will scroll all the way to the right. AI Data Grid uses that when the user clicks the "Add Column" button.

---

## validateCell

```ts
readonly validateCell?: (cell: Item, newValue: EditableGridCell) => boolean | EditableGridCell;
```

When returns false indicates to the user the value will not be accepted. When returns a new GridCell the value is coerced to match.

---

## isDraggable

```ts
isDraggable?: boolean;
onDragStart?: (args: GridDragEventArgs) => void;
```

If `isDraggable` is set, the whole Grid is draggable, and `onDragStart` will be called when dragging starts. You can use this to build a UI where the user can drag the Grid around.

---

## experimental

Behavior not defined or officially supported. Feel free to check out what this does in github but anything in here is up for grabs to be changed at any time.

---

# AI Fill

> **Guide and examples.** The [AI Fill guide](https://ai-data-grid-docs.vercel.app/docs/ai-fill) on the docs site walks through setup, connecting to Jev, the primitives, result policies, review, undo and the limitations, with complete examples. The Storybook has 13 AI Fill stories under **AI-Data-Grid / AI Fill** (sources in `src/ai-fill/stories/`, and `ai-fill-undo.stories.tsx` in the source package) that run against the mock with seeded answers. This chapter is the reference.

AI Fill is powered by [Jev](https://docs.typesafe.ai), TypeSafe's Choice, Score and Noul primitives.

## What it is

AI Fill lets a developer add AI-filled columns to a grid in configuration alone. You describe, per column, a Jev question (a **Choice**, a **Score** or a **Noul**), the row state it is asked about, and how answers become cell values. AI Fill decides, for every answer, whether it is shown, withheld, flagged for review or applied, by rules you set. It never writes a value the user didn't accept, unless you explicitly configure automatic application for a "Fill and apply" run.

Jev returns structured answers, not prose:

| Primitive | You define | Jev answers with |
|---|---|---|
| Choice | A question and a map of option ids to descriptions (2–255 options) | The selected option, the probability of every option (summing to 1), and a separate model confidence |
| Score | A question and an ordered rubric of 2–10 levels | A score in [0, levels − 1] (a probability-weighted position, not a percentage), a legend, each level's probability, and a confidence |
| Noul | A yes/no question, optionally with what true and false mean | The probability that the answer is yes, in [0, 1]. There is no confidence. A value near 0 is a strong no, not a failure. |

## Quick start (`aiFill` prop)

An existing `DataEditor` turns AI Fill on with one prop, and changes nothing else:

```tsx
import * as React from "react";
import { DataEditor, type AIFillConfig, type DataEditorRef } from "@specstory/ai-data-grid";
import "@specstory/ai-data-grid/dist/index.css"; // the same CSS import as today

function Contacts() {
    const ref = React.useRef<DataEditorRef>(null);
    const aiFill = React.useMemo<AIFillConfig>(
        () => ({
            connection: { mode: "endpoint", url: "/api/jev" },
            model: "jev-latest",
            rows: { getRowId: row => view[row].id },
            rowScope: () => ({ rows: "displayed", label: "filtered contacts" }),
            columns: { persona, seniority, ownsBudget }, // keyed by GridColumn.id, as in the overview below
        }),
        [view]
    );
    return (
        <DataEditor
            ref={ref}
            aiFill={aiFill}
            columns={columns}
            rows={view.length}
            getCellContent={getCellContent}
            onCellEdited={onCellEdited}
            validateCell={validateCell}
        />
    );
}

// Users fill, review and accept from the grid's own menus, inspector and status bar.
// App code can do the same through the API, for example from a toolbar button:
ref.current?.aiFill?.fill("column-empty", { columns: ["persona"] });
```

- **Unset, nothing changes.** Without `aiFill`, `DataEditor` passes the same props to the grid, the ref is the grid's own handle, and no AI module loads. A golden test (`test/ai-fill/unconfigured-grid.test.tsx`) checks this.
- **Loaded lazily.** AI Fill's controller loads in its own chunk the first time `aiFill` is set. Until it has loaded (normally a few milliseconds) the grid renders as if the prop were unset and `ref.current.aiFill` is `undefined`. Then `ref.current.aiFill` is set, and `aiFill.onReady(api)` is called once with the same API.
- **Setting and clearing.** Setting or clearing `aiFill` never remounts the grid. Clearing it aborts every request in flight and drops every result; nothing is written.
- **Keep the object stable,** for example with `useMemo`. A new object re-validates the configuration and applies it: a changed policy re-decides stored answers with no request, a changed question marks results stale, and a removed column drops its results.
- **Configuration problems** are reported once each through `onError` as `configuration` errors, and listed in `getRunState().issues`. A problem with a `columnId` disables that column; one without disables AI Fill.

What AI Fill adds to your props (each app handler is wrapped and still called, never replaced):

| Prop | What AI Fill does |
|---|---|
| `columns` | AI columns get `hasMenu: true`, in a shallow copy. Other column objects are passed as they are. |
| `drawCell` | Calls your `drawCell` (or draws the cell's content), then draws the AI state of cells with a result |
| `drawHeader` | Calls your `drawHeader` (or draws the header), then draws a ✦ badge on AI columns |
| `onCellEdited`, `onCellsEdited` | Watches edits made in the grid (an edited AI cell becomes `manual` and stale; results whose `sources` were edited become stale), then calls yours with the same arguments and returns its value. `onCellsEdited` is always passed, even when you don't pass one (it then returns `undefined`, so the grid still calls `onCellEdited`); `onCellEdited` is wrapped only when you pass it. |
| `onKeyDown` | Calls yours first. If it called `preventDefault()` or `cancel()`, AI Fill does nothing. Otherwise AI Fill's shortcuts act (see [Keyboard](#keyboard)). A shortcut with nothing to act on is left to the grid. |
| `onHeaderMenuClick`, `onHeaderContextMenu`, `onCellContextMenu` | On AI columns and cells, AI Fill's menu opens instead, and ends with "More options…", which calls yours with the original arguments. Other columns and cells go straight to yours. With `menus: "compose"` or `"off"`, passed through untouched. See [Menus in apps that already have menus](#menus-in-apps-that-already-have-menus). |
| `onCellClicked` | Calls yours, then opens the inspector when the click was on an AI cell's marker, at the cell's right edge |
| `className` | Adds `gdg-ai-grid` and a per-grid `gdg-ai-grid-<n>` class to yours. The built-in status bar uses it to find the grid's element. |
| `gridSelection`, `onGridSelectionChange` | Passed through when you control the selection. When you only pass `onGridSelectionChange`, AI Fill also notes each selection the grid reports. When you pass neither, AI Fill holds the selection. |
| `getCellContent`, `validateCell`, `portalElementRef`, everything else | Passed through untouched. AI Fill reads `getCellContent` when it fills, draws, commits and reverts, calls `validateCell` only when it commits or reverts, and puts its popups in `portalElementRef`. |

### The API (`AIFillApi`)

`ref.current.aiFill` and the `onReady` argument. Cells are always addressed by `[rowId, columnId]`, with the ids from `rows.getRowId` and `GridColumn.id`.

| Method | What it does |
|---|---|
| `fill(scope, { columns?, mode? })` | Starts a fill (see [Fill scopes](#fill-scopes)). `columns` limits it to some AI columns (default: all of them); `mode: "apply"` is "Fill and apply". Returns `{ runId, done, cells, requests, skipped, error? }`: the cells it evaluates, the requests it needs, the skipped cells by reason, and a `configuration` error when it can't run (nothing is sent). `done` resolves with the run's summary. |
| `cancel(runId?)` | Cancels one run, or all of them. Cells go back to the result they had before, and late answers are ignored. |
| `accept(target)` | Writes the `suggested` and `review` results in the target as one batch (see [Committing, validation and undo](#committing-validation-and-undo)). Returns the commit id, or `undefined` when nothing was written. |
| `reject(target)` | Marks the decided or stale results in the target `rejected`. Nothing is written. Returns how many were rejected. |
| `retry(target?)`, `rerunStale(target?)` | Re-runs the failed or stale cells in the target (default: all of them), each with the scope and mode it had |
| `revertCommit(commitId)` | Writes a commit's previous values back, by row id. Returns how many cells were restored. |
| `getCellState(rowId, columnId)` | The cell's `AICellState`: its status, the decision, the mapped output, the error, the commit id, whether it is `manual`, why its last commit was `blocked`, and its metadata. `undefined` for a cell with no result. |
| `getRunState()` | `AIRunState`: the active runs with their progress, the last run's summary, the number of cells in each status, and the configuration issues |
| `notifyRowsChanged(rowIds?)` | Tells AI Fill that rows changed outside the grid's edit handlers (see [Rows, identity and staleness](#rows-identity-and-staleness)) |
| `clear(target?)` | Drops the results in the target, or cancels every run and drops every result. Cells waiting for Jev keep waiting. Nothing is written. |
| `getMenuItems(target?)` | The AI menu items (`AIMenuItem[]`) for `{ column }`, for `{ cell: [rowId, columnId] }` and the selection around it, or, without a target, the grid-wide actions the status bar shows. See [Menus in apps that already have menus](#menus-in-apps-that-already-have-menus). |
| `openMenu(target)` | Opens the built-in menu for `{ column }` or `{ cell }`, below the header or the cell. Returns `false` when the target isn't a displayed AI column or cell, or when `menus` isn't `"built-in"`. |
| `openInspector([rowId, columnId])` | Selects the cell, scrolls to it and opens the inspector. Returns `false` when the cell isn't displayed or has no result. |
| `subscribe(listener)` | Calls `listener` after any change to a run or a result, for app-built displays. Returns the function that stops it. |

None of these send a request except `fill`, `retry`, `rerunStale`, and the `run()` of a fill, retry or re-run menu item.

A **target** (`AIFillTarget`) is `{ cells: [rowId, columnId][] }`, `{ selection: true }` (the AI cells in the grid's selection) or `{ column, filter }`. For a column, `filter` narrows the results the method acts on: `"all"` keeps them all, `"eligible"` only the `suggested` ones and `"review"` only the `review` ones. `accept({ column, filter: "eligible" })` is "Accept all eligible": it never includes review results, and it covers only displayed rows, so a decided result on a filtered-out row is left alone (see [Rows, identity and staleness](#rows-identity-and-staleness) for when such a result is dropped).

The method decides which results a target covers, whatever the target: `accept` takes `suggested` and `review` results, `reject` also `withheld` and `stale` ones, `retry` failed ones, `rerunStale` stale ones, and `clear` every result except cells still waiting for Jev. So `reject({ column, filter: "all" })` rejects every decided or stale result in the column, `clear({ column, filter: "all" })` drops every result in it, and `retry` and `rerunStale` take `filter: "all"` (with `"eligible"` or `"review"` they select nothing). They re-run only displayed rows: a failed or stale cell on a row that isn't displayed is skipped as `unloaded`, and no request goes out for it.

### Fill scopes

| Scope | Cells evaluated |
|---|---|
| `selection` | The AI cells in the selection: selected columns, selected rows intersected with the AI columns, and the selected ranges. Populated cells follow `overwrite`. |
| `selection-empty` | Only the empty AI cells in the selection |
| `column-empty` | The empty cells of the AI columns within `rowScope`. Needs `rowScope`. |
| `column` | Every cell of the AI columns within `rowScope`. Opt-in: a column takes part only if its `fillScopes` lists `column`. |

`rowScope: () => ({ rows: "displayed", label })` covers the rows displayed now; `rows: rowId[]` covers the listed rows that are displayed. A row that isn't displayed (filtered out) is never read or sent: it is skipped as `unloaded`, like a loading row. Each fill reports its skipped cells by reason (`populated`, `read-only`, `unloaded`, `not-applicable`, `missing-input` and `cached`; see [Planning a fill](#planning-a-fill)), and the scope never widens silently. Every scope, not only `column`, respects `fillScopes` (default `["selection", "selection-empty", "column-empty"]`): a column whose `fillScopes` doesn't list the fill's scope is skipped as `not-applicable`.

### Cell states on the canvas

AI Fill draws after the cell's normal content, only for cells with a result, and only when a result changes (no animation loop). Colors come from the grid theme, except the amber review marker and the red error marker.

| State | Drawn as |
|---|---|
| queued, pending | A small `⋯` glyph at the right edge |
| suggested | Empty cell: the suggestion as italic ghost text in the accent color, with a `✦` marker. Populated cell (`overwrite: "suggest"` or `"apply"`): the current value dimmed, with a `→ suggestion` chip. |
| review | Like suggested, plus an amber corner marker |
| semantic outcome (none, unknown) and the Noul middle band | The label in muted italic with a `◇` marker, not styled as an error |
| withheld | The current value unchanged, with a hollow `○` marker |
| error | A red corner marker |
| stale | The old suggestion as grey struck-through ghost text (on an empty cell), with a `↻` marker |
| accepted, applied, rejected | The normal cell, with no marker |

The suggestion text follows the presentation options: Choice `· 0.86` (the selected option's probability) and `· conf 0.81` (model confidence), Score `· conf 0.70` and a rubric bar, Noul a probability bar.

## Configuration overview

```ts
import type { AIFillConfig } from "@specstory/ai-data-grid";

const aiFill: AIFillConfig = {
    connection: { mode: "endpoint", url: "/api/jev" },
    model: "jev-latest", // required, no hidden default
    rows: { getRowId: row => contacts[row].id }, // results are keyed by stable row id, never by position
    columns: {
        // keyed by GridColumn.id
        persona: {
            primitive: "choice",
            instructions: "Which buyer persona best describes this contact?",
            sources: ["company", "title"],
            options: {
                champion: { description: "Drives the purchase internally", label: "Champion" },
                economic: { description: "Controls the budget", label: "Economic buyer" },
                none: { description: "None of these fit", label: "None of the above", outcome: "none" },
            },
            policy: {
                show: { minProbability: 0.8 },
                ready: { minProbability: 0.95 },
                autoApply: { minProbability: 0.95 },
            },
        },
        seniority: {
            primitive: "score",
            instructions: "How senior is this contact?",
            sources: ["title"],
            levels: ["Individual contributor", "Manager", "Director", "Executive"],
            output: { store: "level-label" },
            policy: { show: { minConfidence: 0.7 } },
        },
        ownsBudget: {
            primitive: "noul",
            instructions: "Does this contact own a budget?",
            sources: ["title", "notes"],
            output: { store: "boolean", bands: { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" } },
        },
    },
};
```

### Grid-level settings (`AIFillConfig`)

| Field | Meaning |
|---|---|
| `connection` | `{ mode: "endpoint", url, headers?, fetch? }` (production: the key stays on your server), `{ mode: "direct", apiKey, dangerouslyAllowBrowser?, baseURL?, fetch? }` (local and demo use; a key used in a browser is visible to that browser's user, so browsers need `dangerouslyAllowBrowser: true`), or `{ mode: "custom", send }` |
| `model` | The Jev model, for example `jev-latest`. Required. The versioned id that answered (for example `jev-1.13.0`) is kept with every answer. |
| `rows` | `getRowId(row)` (required) and optional `getRowIndex(rowId)` (see [Rows, identity and staleness](#rows-identity-and-staleness)) |
| `rowState` | The row state sent to Jev. Default: built from each column's `sources`. |
| `rowScope` | A function returning the rows a column-wide fill covers: `() => ({ rows: "displayed" \| rowId[], label })`. Without it, column-wide fills aren't offered. |
| `columns` | AI column definitions, keyed by `GridColumn.id` |
| `execution` | Scheduler limits (see [Execution and errors](#execution-and-errors)): `concurrency` (4), `maxRequestsPerMinute` (600), `timeoutMs` (15000), `maxRetries` (2), `backoff` (500 ms → 5 s, jitter 0.25), `maxCellsPerRun` (1000), `confirmAbove` (100: a fill started from the built-in menus or the fill shortcut that covers more cells asks for confirmation; `api.fill` never asks), `maxQuestionsPerRequest` (16), `maxStateChars` (60000), `cacheSize` (5000) |
| `onRunStart`, `onRunProgress`, `onRunEnd`, `onResult`, `onCommit`, `onReject`, `onError` | Observers. `onResult` fires for every decided result, including withheld and review ones. |
| `onReady(api)` | Called once, when AI Fill has loaded and `ref.current.aiFill` exists |
| `menus` | `"built-in"` (default), `"compose"` or `"off"`. See [Menus in apps that already have menus](#menus-in-apps-that-already-have-menus). |
| `statusBar` | `false` hides the built-in status bar. Default `true`. |
| `shortcuts` | `AIFillShortcuts`: rebinds or turns off each shortcut, or `false` for none. See [Keyboard](#keyboard). |

### Column settings (all primitives)

| Field | Meaning | Default |
|---|---|---|
| `primitive` | `"choice"`, `"score"` or `"noul"` | required |
| `instructions` | The Jev question (string, object or array) | required |
| `sources` | Source column ids: they build the default state and invalidate results when edited | `[]`, and then a `state` or grid `rowState` is required |
| `state` | A per-column row state accessor | grid `rowState` |
| `context` | Extra context such as category definitions or examples, sent as `{ instructions, context }` | none |
| `applies`, `missingInput`, `isMissing` | Row applicability and what to do with missing input | every row; `"skip"`; the column has sources and every one is empty by `isAIDestinationEmpty` |
| `isEmpty` | Whether a destination cell is empty. Under `isAIDestinationEmpty`, **`0` and `false` are values, not empty.** | `isAIDestinationEmpty` |
| `overwrite` | `"never"`, `"suggest"` (populated cells only in explicit selections, never auto-applied) or `"apply"` | `"never"` |
| `fillScopes` | Any of `"selection"`, `"selection-empty"`, `"column-empty"`, `"column"` | the first three |
| `policy` | Gates and `decide` (see below) | everything valid is suggested; nothing auto-applies |
| `output` | `format(value, answer)` for display text and `toCell(value, current, ctx)` for the written cell, plus primitive-specific mapping | per primitive |
| `presentation` | Display options | per primitive |
| `model` | A per-column model | grid `model` |

Primitive-specific settings:

- **Choice:** `options: { [id]: { description, label?, value?, outcome? } }`. `label` is what users see, `value` is what is stored (default `label ?? id`). `outcome: "none" | "unknown"` marks semantic outcomes such as none-of-the-above or insufficient information; they are answers, distinct from withheld, review and errors, and store nothing unless the option sets a `value`. `presentation: { showProbability?, showConfidence?, alternatives?: { count, minProbability? } }`.
- **Score:** `levels` (lowest first; a string, or `{ description, label?, value? }` where `description` is a string or an object such as `{ what, examples }`). `output.store`: `"score"` (rounded to `output.precision`, default 2), `"level"`, `"level-label"`, `"level-value"` (every level needs a `value`) or a function of the answer. `output.levelFrom`: `"nearest"` (half up, the default) or `"most-probable"` (ties to the lower level). `presentation: { showConfidence?, rubricBar? }`.
- **Noul:** `criteria?: { true?, false? }`. `output.store`: `"probability"` (the default, rounded to `precision`), `"boolean"` or `"label"`. The last two need `bands: { falseAtOrBelow, trueAtOrAbove, between: "review" | "withhold" }`; there are no default bands. `labels` default to `Yes`, `No` and `Uncertain`. `presentation: { probabilityBar? }`.

The raw answer, the display text and the committed value are always three separate things: `mapAIOutput` returns `answer`, `display` and `value` (with `hasValue`), plus the semantic `outcome`.

`validateAIFillConfig(config, { columns?, isBrowser? })` returns every problem as `{ path, message, columnId? }`. An issue with a `columnId` disables that column; one without disables AI Fill for the grid. Overlapping gates, out-of-range thresholds, unknown option or level ids, missing Noul bands, a confidence measure on a Noul and a direct-mode key in a browser without `dangerouslyAllowBrowser` are all reported. `isBrowser` defaults to detecting a browser window or a web worker.

## Result policies

A policy has up to three declarative gates and an optional callback:

- `show`: a result that fails it is **withheld**. It isn't shown and nothing is written, but the reason is kept.
- `ready`: a shown result that fails it goes to **review**. Review results are never auto-applied or included in "accept all eligible".
- `autoApply`: a ready result that passes it is an **apply candidate**, but only in a "Fill and apply" run and only when there is a value to write. Without `autoApply`, nothing is ever applied automatically.
- `decide(ctx)`: runs last, with the full answer, the cell context, the mapped candidate and the declarative decision. They are frozen copies, so it can't change the stored answer or give a result a value.

Every condition inside a gate must pass. A gate that isn't configured passes, except `autoApply`, which never passes unless configured.

| Primitive | Gate measures |
|---|---|
| Choice | `minProbability` (the selected option's probability, and nothing else), `minConfidence`, `minMargin` (top minus second probability), `options: { in?, notIn? }`, `optionProbability: { [id]: { min?, max? } }` |
| Score | `minConfidence`, `score: { min?, max? }`, `levelProbability: { [level]: { min?, max? } }` |
| Noul | `noul: { min?, max? }`. Mapped modes use `output.bands`. There is no confidence measure. |

### Precedence

For each answer, the first step that matches decides:

1. A transport or evaluation error: `error`.
2. A malformed answer (`parseJevAnswer` rejects it): `error: malformed`. It rejects a wrong type, a choice that isn't an option, probability keys that don't match the criteria, values that are non-finite or outside [0, 1], probabilities summing outside 1 ± 0.01, a Score outside [0, n − 1], a choice that isn't the most probable option (tolerance 1e-9), a non-object Score legend, and a response without a model.
3. Stale inputs: `stale`, never committed.
4. Mapping (`mapAIOutput`): a value that can't be produced or doesn't fit the destination is `error: type-mismatch`. An incomplete mapping (a `"level-value"` level without a `value`, or a Noul `"boolean"` or `"label"` store without `bands`) is `error: configuration`.
5. Gates: `show` fails → `withheld`; a Noul in the middle band → `review` (or `withheld`); `ready` fails → `review`; otherwise `suggested`, or `apply-candidate` when `autoApply` passes in a "Fill and apply" run.
6. `decide`: returns `withheld`, `review`, `suggested` or `apply`, or `undefined` to keep the decision. It can't create a value. `apply` becomes an apply candidate only when the column configures `autoApply`, the run is a "Fill and apply" run and there is a value to write. Without `autoApply` the result is `suggested` and a configuration error is reported. A throw or an invalid return value is `error: policy-callback`, and nothing is written.
7. Commit guards, for every write, in this order: not already committed, the row still exists, the fingerprints match, the destination is unchanged, the cell is writable, the overwrite policy and scope allow it, and `validateCell` passes.

`evaluateAIPolicy` runs steps 4–6 on a parsed answer. It makes no request, so when only the policy, `output.format`, the presentation or `decide` change, stored answers are re-decided for free.

### Exact comparisons

- A `min` passes when `value >= min`; a `max` passes when `value <= max`.
- Values are compared as the raw doubles from the response, with no epsilon and no rounding. So with `show: { minProbability: 0.8 }`, **0.79 is withheld, 0.80 is shown, and 0.7999999 is withheld.**
- Display rounding never feeds a decision. Reasons quote exact values, for example `withheld: probability 0.79 < show.minProbability 0.8`.
- A gate reads only the measure it names. **Confidence is never substituted for probability**, or the reverse: a Choice with probability 0.79 and confidence 0.95 is withheld by `minProbability: 0.8`, and one with probability 0.85 and confidence 0.30 is shown.
- Noul bands: at or below `falseAtOrBelow` is false, at or above `trueAtOrAbove` is true. With 0.2 / 0.8, 0.02 is a usable `false` (a strong no), 0.20 is false, 0.2000001 is in the middle band, 0.80 is true, and 0.5 is "Uncertain", never "No".
- Gates must be monotonic: `show.min ≤ ready.min ≤ autoApply.min` for every shared measure (the reverse for `max`). A looser later gate is reported as an overlapping-gate error.

**Thresholds are your choice, not accuracy guarantees.** Probability and confidence are what the model reports; they aren't measured correctness. Evaluate thresholds on your own data before relying on them.

## Rows, identity and staleness

Results are keyed by `(rowId, columnId)`, never by display position:

- **Rows** are identified by `rows.getRowId(row)`, and columns by `GridColumn.id`. Display positions are worked out only at the moment they are needed: when a cell is drawn (row → id) and when a result is written (id → row).
- **`rows.getRowIndex(rowId)`** answers id → row when you provide it. Its answer is checked against `getRowId`: an index whose row has another id counts as a missing row, so a wrong index can't redirect a read or a write. Without it, AI Fill scans `getRowId` over the rows once and reuses the map until the current task ends.
- **Sorting, filtering and moving columns** move nothing: results stay with their ids and are drawn wherever their row and column are now. A decided result on a row that is filtered out keeps its record, and "Accept all eligible" leaves it alone, until the row comes back, with the exceptions below.
- **Known limitation: a filtered-out row counts as a deleted row** wherever AI Fill has to look the row up. AI Fill only knows a row through `getRowId` / `getRowIndex` on the displayed rows, so it can't tell a filtered-out row from a deleted one. In these cases a filtered-out row's result is dropped, `onResult` reports it with status `cancelled` and `reason: "row-missing"`, and nothing is written:
    - an answer that arrives while the row is filtered out (fill the row again once it's displayed);
    - `notifyRowsChanged()` called while a filter hides the row (with no ids, or with its id): its decided results are dropped;
    - `accept` with a `{ cells }` target that names the hidden row: the commit path finds the row missing and drops the result. The same happens to an accept or Choose from the UI that reaches a hidden row, for example the `run()` of `getMenuItems({ cell })` items for a hidden row, or an inspector left open while a filter hides its row. The built-in menus and shortcuts otherwise act only on displayed cells, and rejecting or re-running never drops a result.
- **Edits in the grid.** An edit to a source column makes the row's results in the AI columns that list it `stale`, whether they are pending or decided. An edit to an AI cell makes its result `manual` and `stale`: it is never auto-applied or accepted. A late answer for a stale cell is stored as stale and never shown as a suggestion.
- **Changes outside the grid.** Call `api.notifyRowsChanged(rowIds?)` after changing rows without the grid's edit handlers. Their results are fingerprinted again: a changed input makes a result stale, a changed destination makes it `manual` and stale, and a decided result whose row is gone, or filtered out (see the limitation above), is dropped with `row-missing`. You don't have to call it for safety: every answer and every commit re-checks the inputs and the destination.
- **Accepted results** keep their commit id. They are never suggested again, including after an undo. Filling again is always explicit.

The fingerprints behind these checks:


- The question sent to Jev is built from the column definition: its `primitive`, `instructions` and `context`, plus the Choice option ids and descriptions, the Score level descriptions in order, or the Noul criteria.
- The question fingerprint is canonical JSON (sorted keys) of that question plus the column's `sources`, deduplicated and sorted. The input fingerprint is canonical JSON of the state sent.
- Cached answers are keyed by row id, column id, both fingerprints and the model. The key uses the exact canonical strings, so a hash collision can't attach a wrong answer. An 8-hex-digit FNV-1a short hash is used for display and metadata only.
- Changing the instructions, context, option ids or descriptions, level descriptions or their order, Noul criteria, sources, the state sent or the model changes the key. Changing the policy, output mapping (including option and level `label`, `value` and `outcome`, and Noul labels), presentation or `decide` doesn't.

## Committing, validation and undo

`accept`, auto-apply and `revertCommit` all write through your edit handlers, the same way the grid's paste does.

**The commit path.** For each result, right before writing:

1. The row is found again by id. A row that is gone, or filtered out, is `row-missing`, and its result is dropped.
2. The value is turned into a cell with `output.toCell` (by default, by the destination's kind). A value that no longer fits is `type-mismatch`.
3. The inputs are fingerprinted again and the destination compared with its value at request time. A changed input makes the result `stale`, and a changed destination makes it `manual` and stale.
4. The destination must be writable (an editable kind, not `readonly`), and the `overwrite` policy and the fill's scope must allow the write: an empty cell always, a populated one never under `"never"` or in the `-empty` scopes, only by `accept` in the `selection` scope under `"suggest"`, and under `"apply"` also by auto-apply.
5. `validateCell(location, next, current)` runs: `false` blocks the write, and a returned cell is written instead (coerced).

A result that fails any other guard isn't written and keeps its status; `getCellState` reports why in `blocked`, and `onError` gets one `commit-blocked` error (or `type-mismatch`) per reason, listing the cells. A result is committed at most once. A grid without `onCellEdited` or `onCellsEdited` can't commit, and reports `read-only`.

**One batch.** The results that pass go out together, in one synchronous tick:

1. If the grid has no selection, AI Fill first sets one covering the written cells, through your `onGridSelectionChange` (or its own held selection). `useUndoRedo` records nothing without a selection.
2. `onCommit({ commitId, source, edits })`, with each edit's `previous` and `next` cell, its location and its metadata. It is called just before the writes, once the results are recorded as committed.
3. `onCellsEdited(items)`, if you pass it.
4. Unless it returned `true`, `onCellEdited(location, cell)` for each item. The cells are then repainted with `updateCells`.

A Choice semantic outcome without a `value`, and a Noul in the middle band, have nothing to write: accepting one marks it `accepted` and writes nothing.

**Auto-apply.** In a "Fill and apply" run (`fill(scope, { mode: "apply" })`), a result that passes the column's `autoApply` gate is written as soon as it arrives, through the same path, as `source: "auto-apply"` and status `applied`. It must pass every guard; one that doesn't stays `suggested`. Review results, manual cells and populated cells under `overwrite: "suggest"` are never auto-applied, and a result re-decided after a policy change isn't either. Known issue: the run's summary (`onRunEnd`'s `counts`, `getRunState().last` and the status bar) counts an auto-applied result as `suggested`, because it is counted when the answer settles, before it is written. `getCellState` and `getRunState().cells` report it as `applied`.

**Undo with `useUndoRedo`** (`@specstory/ai-data-grid-source`). Wire it the standard way:

```tsx
const undo = useUndoRedo(ref, getCellContent, setCellValue);

<DataEditor
    ref={ref}
    aiFill={aiFill}
    getCellContent={getCellContent}
    onCellEdited={undo.onCellEdited}
    gridSelection={undo.gridSelection ?? undefined}
    onGridSelectionChange={undo.onGridSelectionChange}
/>;
```

A bulk accept is then **one undo step**: undo restores every cell, redo writes them again once, and no suggestion comes back. Known limits of `useUndoRedo` apply unchanged:

- It keys edits by display position, so an undo after re-sorting or filtering writes to positions, not to the rows that were accepted. `api.revertCommit(commitId)` is the id-safe alternative.
- If your `onCellsEdited` returns `true`, the per-cell `onCellEdited` calls don't happen, so `useUndoRedo` never sees the edits. The same is true of paste today.

**`revertCommit(commitId)`** writes a commit's previous values back by row id, through the same batch path (selection, `onCellsEdited`, `onCellEdited`), and returns how many cells it restored. It leaves a cell alone when its row is gone, when it no longer holds the committed value (a newer edit), when it is read-only now, or when `validateCell` rejects the old value. A commit is reverted at most once. The results stay `accepted`. With `onCommit`'s `previous` and `next` values, custom undo stacks can do the same.

## Built-in UI

A grid with `aiFill` supplies the whole review workflow itself: the app writes no AI menus, request loops, review controls or renderers. The UI loads with AI Fill's controller, so a grid without `aiFill` loads none of it.

**Menus.** An AI column's header gets a ▾ and a ✦ badge. The ▾, a right-click on the header, and the menu shortcut open the **column menu**:

| Item | When | What it does |
|---|---|---|
| Fill empty cells in *Persona* (*N* rows in *filtered contacts*) | `rowScope` is set and the column allows `column-empty` | Fills the empty cells within `rowScope` |
| Fill every cell in *Persona* (*N* rows in …)… | `rowScope` is set, the column lists `column` in `fillScopes`, and `overwrite` isn't `"never"` | Fills every cell within `rowScope`. Always asks first. |
| Fill selected cells (*N*) | The column allows `selection` | Fills the column's cells in the selection |
| Fill and apply… | The column's policy has `autoApply` | A "Fill and apply" run over the empty cells in `rowScope`, or over the selection when there is no `rowScope` or the column doesn't allow `column-empty`. Always asks first. |
| Accept *N* eligible | | Writes the column's `suggested` results in displayed rows, as one batch. Never includes review results. |
| Review *N* | | Selects the next `review` result in a displayed row, after the focused cell, and opens the inspector on it |
| Reject all suggestions | | `reject({ column, filter: "all" })`: rejects the column's `suggested`, `review`, `withheld` and `stale` results, including those on filtered-out rows |
| Retry *N* failed, Re-run *N* stale | | `retry({ column, filter: "all" })` or `rerunStale({ column, filter: "all" })`: evaluates the column's failed or stale cells again. Rows that aren't displayed are skipped as not loaded yet. |
| Cancel | A run is in progress | Cancels every run |

A right-click on an AI cell, or the menu shortcut on one, opens the **cell menu**: "Fill selected cells (*N*)" and "Fill empty selected cells (*N*)" for every AI column in the selection, "Fill and apply…" when one of them has `autoApply`, then "Accept", "Reject", "Inspect…" and "Retry" (or "Re-run" for a stale or rejected result) for the cell itself, and "Cancel" during a run. The counts are worked out when the menu opens, without sending anything. An item that can't act is shown disabled, with the reason under it (for example "No cells to fill: 2 already have a value"). Each *N* is what the item acts on: "Accept *N* eligible" and "Review *N*" count results in displayed rows only, and "Retry *N* failed" and "Re-run *N* stale" count the cells the run would evaluate, which leaves out results on filtered-out rows. An item with nothing it can act on is disabled, for example "Nothing to retry: 1 not loaded yet" when the only failed result is on a filtered-out row.

**Stating the scope.** A fill from the menus or the fill shortcut asks first when it covers more than `execution.confirmAbove` cells (default 100), when it is a `column` fill, and when it is "Fill and apply". The confirm dialog (`role="dialog"`) lists the columns, the row scope (`rowScope`'s label, or the selection), the cells to evaluate, the cells skipped by reason (already have a value, read-only, not loaded yet, not applicable, missing input, already have a result for the same input), the estimated number of requests, and whether anything will be written. Nothing is sent until it's confirmed. A fill that can't run (no `rowScope`, or more than `maxCellsPerRun` cells) shows why instead. `api.fill` never asks: the app decided.

**The status bar** (`gdg-ai-status`, `role="status"`, `aria-live="polite"`) floats over the bottom edge of the grid without changing its layout, and the grid stays fully usable under a run. During a run it shows "Evaluating *Persona*: 18 / 42" and Cancel. Afterwards it shows the summary ("Done: 12 suggested · 3 review · 2 withheld · 1 errors · 4 skipped", or "Cancelled: …") with "Review next", "Accept *N* eligible" and "Retry *N* failed" when they have something to do, and × to dismiss it. These are the grid-wide items from `getMenuItems()`, across every AI column, and they count the way the column menu's do: "Retry *N* failed" is `retry()`, and *N* leaves out results on filtered-out rows. "Review next" walks the results waiting for a decision (`review` and `suggested`) in displayed rows, in display order after the focused cell, wrapping around, and it's only offered when there is one to reach. With `statusBar: false` it isn't shown; render `<AIFillStatus api={ref.current?.aiFill} />` wherever you like instead. `AIFillStatus` is a small component that loads the status bar on first render, and renders nothing while `api` is `undefined`.

**The inspector** (`gdg-ai-inspector`, `role="dialog"`) opens from "Inspect…", from a click on a cell's AI marker, from the inspect shortcut, from "Review next", and from `api.openInspector`. Opening it selects the cell, and never sends a request. It shows only the structured answer and your configuration; Jev returns no prose, and none is invented:

- the status, the suggested display text and the value it writes (or "no value to write")
- the decision and its reason, with the exact value and the threshold (for example "review: probability 0.6 < ready.minProbability 0.8", then "minProbability 0.6, threshold 0.8")
- the error, a blocked commit's reason, or that the cell was edited after the request
- **Choice:** the options ranked by probability, with bars, the selected one marked, limited by `presentation.alternatives` when set, and the model confidence, labelled as model confidence and not accuracy
- **Score:** the score on the rubric, and each level with its probability, with the mapped level marked, and the model confidence
- **Noul:** the probability of yes and, with bands, the band it falls in (for example "Uncertain (between 0.2 and 0.8: review)"). A Noul has no confidence, and none is shown.
- the model id that answered, and when the answer was received

Its actions all write through the [commit path](#committing-validation-and-undo): **Accept** (also Enter), **Reject**, **Choose** (pick a value and "Write choice"; written as `source: "choose"` and checked by every commit guard, `overwrite` included; available for suggested, review and withheld results), **Edit manually** (closes the inspector, selects the cell and sends it Enter, so the cell's normal editor opens and the edit goes through your `onCellEdited`; with `keybindings.activateCell` off, it only selects the cell), and **Retry** or **Re-run** for failed, stale and rejected results. Choose offers:

- **Choice:** every option whose `outcome` is `"value"` (the default), plus semantic-outcome options that set a `value`, each written as `value ?? label ?? id`.
- **Score:** each level, written as its index with `store: "score"` (the default) or `"level"`, its label with `"level-label"`, and its `value` with `"level-value"` (levels without a `value` aren't offered). A function `store` offers no levels, so Choose isn't shown.
- **Noul:** Yes and No (your `output.labels`), written as `true` / `false` with `store: "boolean"`, as the label with `"label"`, and as 1 / 0 with `"probability"` (the default).

**Popups** (the menus, the confirm dialog and the inspector) render into `portalElementRef ?? #portal`, the same element the grid's overlay editor uses, and carry the `click-outside-ignore` class, so the grid doesn't treat clicks on them as clicks outside. A click outside a popup closes it. They copy the grid's `--gdg-*` theme variables, so they follow its theme.

**Screen readers.** The canvas doesn't expose suggestions. The menus, the confirm dialog, the inspector and the status bar are accessible DOM, and a hidden polite live region (`gdg-ai-sr`, in the portal) announces what menu, inspector and shortcut actions did, for example "Accepted 3 suggestions".

### Styling

The styles are in `index.css` with the rest of the grid's; there is no extra CSS import. Every element has a `gdg-ai-*` class (`gdg-ai-menu`, `gdg-ai-menu-item`, `gdg-ai-dialog`, `gdg-ai-inspector`, `gdg-ai-status`, `gdg-ai-bars`, `gdg-ai-primary` and so on), and every color reads a `--gdg-ai-*` variable that falls back to a `--gdg-*` theme variable. Set them on `:root`, or on an element that contains both the grid and the portal element. The popups render in the portal and copy only the grid's `theme` variables, so `--gdg-ai-*` variables set on the grid's container reach the status bar but not the popups:

| Variable | Falls back to | Used for |
|---|---|---|
| `--gdg-ai-font-family` | `--gdg-font-family` | All AI UI text |
| `--gdg-ai-text` | `--gdg-text-dark` | Text |
| `--gdg-ai-text-muted` | `--gdg-text-light` | Secondary text, disabled items, labels |
| `--gdg-ai-bg` | `--gdg-bg-cell` | Popup, status bar and button backgrounds |
| `--gdg-ai-border` | `--gdg-border-color` | Borders and the menu separator |
| `--gdg-ai-accent` | `--gdg-accent-color` | The primary button and focus rings |
| `--gdg-ai-accent-fg` | `--gdg-accent-fg` | Text on the primary button |
| `--gdg-ai-accent-light` | `--gdg-accent-light` | The focused or hovered menu item |
| `--gdg-ai-bar` | `--gdg-accent-color` | Probability bars |
| `--gdg-ai-bar-track` | `--gdg-bg-bubble` | The bars' track |
| `--gdg-ai-review` | `#b45309` | Review decisions |
| `--gdg-ai-error` | `#b91c1c` | Errors and blocked commits |

The canvas markers keep using the grid `theme` passed to `drawCell`.

## Menus in apps that already have menus

`onHeaderMenuClick`, `onHeaderContextMenu` and `onCellContextMenu` are yours to keep. `aiFill.menus` decides how AI Fill's menu fits in:

- **`"built-in"` (the default).** Columns and cells that aren't AI columns go straight to your handlers, unchanged: the same arguments, and nothing prevented. On an AI column or cell, AI Fill's menu opens instead (and the browser's context menu is suppressed with the event's `preventDefault()`). If you passed a handler for that menu, the AI menu ends with **"More options…"**, which calls it with the original `(col, bounds)`, `(col, event)` or `(cell, event)` arguments, so your menu is one click away. A menu opened from the keyboard or `api.openMenu` has no original event, so it has no "More options…".
- **`"compose"`.** AI Fill's menu never opens, and your handlers are always called. Put AI Fill's items into your own menu with `api.getMenuItems(target)`:

    ```tsx
    onHeaderMenuClick={(col, bounds) => {
        const id = columns[col].id;
        const ai = id === undefined ? [] : ref.current?.aiFill?.getMenuItems({ column: id }) ?? [];
        openMyMenu(bounds, [...myItems(col), ...ai.map(item => ({
            key: item.id, label: item.label, hint: item.detail ?? item.disabledReason,
            disabled: item.disabled, onSelect: item.run,
        }))]);
    }}
    ```

    Each `AIMenuItem` is `{ id, label, detail?, disabled, disabledReason?, run }`. The ids are stable: `fill-column-empty`, `fill-column`, `fill-selection`, `fill-selection-empty`, `fill-apply`, `accept-eligible`, `review-next`, `reject-all`, `retry-failed`, `rerun-stale` and `cancel`, and for a cell `accept`, `reject`, `inspect`, `retry` and `rerun`. `run()` does what the built-in item does, including asking for confirmation, and does nothing when the item is disabled. `getMenuItems({ cell: [rowId, columnId] })` counts the selection's AI cells, and `getMenuItems()` returns the grid-wide actions. It returns `[]` for a column that isn't an AI column.
- **`"off"`.** No AI menus. The API, the inspector, the status bar and the shortcuts still work.

## Keyboard

The shortcuts go through `DataEditor`'s `onKeyDown`, after yours: if your handler calls `preventDefault()` or `cancel()`, AI Fill does nothing. Each acts only when it has something to do, and otherwise leaves the key to the grid (so Alt+ArrowDown still moves the selection on a cell without a result).

| Shortcut (default) | `AIFillShortcuts` key | Action |
|---|---|---|
| Shift+F10, ContextMenu | `menu` | Opens the column menu when a whole AI column is selected, otherwise the cell menu for the focused AI cell. Only with `menus: "built-in"`. |
| Alt+ArrowDown | `inspect` | Opens the inspector for the focused cell, when it has a result |
| Mod+Enter | `accept` | Accepts the selected `suggested` and `review` results, as one batch |
| Mod+Backspace | `reject` | Rejects the selected `suggested`, `review`, `withheld` and `stale` results |
| Mod+Alt+F | `fill` | Fills the AI cells in the selection, asking first above `confirmAbove` |

Mod is ⌘ on macOS and Ctrl elsewhere. Rebind or turn off any of them with `aiFill.shortcuts`, in the syntax of the grid's `keybindings`: modifiers joined with `+` (`ctrl`, `shift`, `alt`, `meta`, and `primary` for Mod), then the key, with `|` between alternatives. `false` turns one off, and `shortcuts: false` turns them all off:

```ts
shortcuts: { inspect: "alt+i", fill: false }
```

Inside the UI:

- **Menus** (`role="menu"`, items `role="menuitem"`): focus moves to the first item. ArrowDown and ArrowUp move (wrapping), Home and End jump, Enter and Space pick, a letter jumps to the next item starting with it, and Esc or Tab closes the menu. Disabled items can be focused but not picked.
- **The confirm dialog and the inspector** (`role="dialog"`): Tab and Shift+Tab stay inside, and Esc closes. The confirm dialog focuses its confirm button. The inspector focuses itself, so Enter accepts; on a focused button, Enter presses that button.
- **Focus returns to the grid** when a menu or dialog closes from the keyboard or after an action. A click outside, or "More options…", leaves focus where it went.

## Connecting to Jev

AI Fill calls Jev's HTTP API (`POST https://api.typesafe.ai/v1/systemone`) with `fetch`. It doesn't use the TypeSafe SDK, and it adds no runtime dependency. `connection` picks one of three modes.

| Mode | Configuration | Use it for |
|---|---|---|
| Endpoint | `{ mode: "endpoint", url, headers?, fetch? }` | Production. The browser calls your server, which holds the key. |
| Direct | `{ mode: "direct", apiKey, dangerouslyAllowBrowser?, baseURL?, fetch? }` | Node scripts, server-side code and tests. In a browser, local demos only (see below). |
| Custom | `{ mode: "custom", send(request, signal) }` | Tests, Storybook and unusual hosts. `createMockJev` provides one. |

### The endpoint contract

In endpoint mode, AI Fill sends `POST <url>` with `content-type: application/json` and the headers returned by `connection.headers()` (called before every request, for example for a CSRF token). The body is exactly Jev's request body, a `JevRequest`:

```json
{
    "model": "jev-latest",
    "state": { "company": "Example Co", "title": "VP of Finance" },
    "questions": {
        "q0": { "type": "noul", "instructions": "Does this contact own a budget?" }
    }
}
```

- **Success:** status 200 with Jev's response body unchanged: `{ model, answers, usage }`. An `x-typesafe-request-id` header, when present, is kept as the result's `requestId`.
- **Failure:** a non-2xx status with a `JevEndpointErrorBody`, `{ error: { type, message, retryAfterMs?, detail? } }`. Forward Jev's status, and its `Retry-After` and `retry-after-ms` headers. The status decides the error kind (see [Errors](#errors)).

### The server helper

`@specstory/ai-data-grid/server` implements the contract. It has no React, DOM or styling imports, and runs in any Fetch-API host (Next.js route handlers, Node 20 and later, edge runtimes).

```ts
// app/api/jev/route.ts (Next.js App Router)
import { createJevHandler } from "@specstory/ai-data-grid/server";

export const POST = createJevHandler({
    apiKey: process.env.TYPESAFE_API_KEY ?? "", // explicit; the helper never reads the environment itself
    authorize: request => isSignedIn(request), // required; () => true only for local demos
    allowedModels: ["jev-latest"], // the default
});
```

For Express or Node `http`, wrap it with `toNodeListener`:

```ts
import express from "express";
import { createJevHandler, toNodeListener } from "@specstory/ai-data-grid/server";

const app = express();
app.post("/api/jev", toNodeListener(createJevHandler({ apiKey: process.env.TYPESAFE_API_KEY ?? "", authorize })));
```

`toNodeListener` streams the request body, or uses `req.body` when middleware such as `express.json()` already parsed it.

| `createJevHandler` option | Meaning | Default |
|---|---|---|
| `apiKey` | Your TypeSafe key. An empty key doesn't fail at load time (so a build without the key still works), but every authorized request then gets a 500 `server_configuration` error. | required |
| `authorize(request)` | Returns (or resolves to) `true` to let the request spend your key. Anything else, including a throw, is a 403. Construction throws a `TypeError` without it, so an app can't ship an open proxy by accident. | required |
| `allowedModels` | The models a request may ask for | `["jev-latest"]` |
| `maxBodyBytes` | The largest request body. Checked against `content-length` and again while reading. | `256000` |
| `maxQuestions` | The most questions in one request | `32` |
| `timeoutMs` | How long to wait for Jev | `20000` |
| `baseURL`, `fetch` | Jev's origin, and the `fetch` used to call it | `https://api.typesafe.ai`, the global `fetch` |

`createJevHandler` also throws a `TypeError` when `maxBodyBytes`, `maxQuestions` or `timeoutMs` is set to something other than a positive number.

In order, the handler answers:

| Status | `error.type` | When |
|---|---|---|
| 405 | `method_not_allowed` | The method isn't POST |
| 403 | `forbidden` | `authorize` didn't return `true` |
| 500 | `server_configuration` | `apiKey` is empty |
| 413 | `payload_too_large` | The body is over `maxBodyBytes` |
| 400 | `invalid_request` | The body isn't JSON, or isn't `{ model, state, questions }` with valid questions |
| 413 | `payload_too_large` | The body has more than `maxQuestions` questions |
| 400 | `model_not_allowed` | The model isn't in `allowedModels` |
| Jev's status | Jev's type, for example `rate_limit_error` | Jev returned an error. `Retry-After` and `retry-after-ms` are forwarded, and `retryAfterMs` is set in the body. |
| 504 | `upstream_timeout` | Jev didn't answer within `timeoutMs` |
| 502 | `upstream_unreachable` | Jev couldn't be reached |

Otherwise it forwards `{ state, model, questions }` (other fields are dropped) with `Authorization: Bearer <apiKey>`, and returns Jev's body and `x-typesafe-request-id` header. The key is never echoed: not in a body, an error message or a header. It is redacted from the `type`, `message` and `detail` of Jev's error responses; successful responses are returned unchanged. The helper forwards none of the incoming request's headers to Jev, logs nothing, and adds no CORS headers: serve it from your app's own origin, or add CORS yourself.

In Node, `require("@specstory/ai-data-grid/server")` works as well as `import`. Core's CommonJS build is ES modules, like the rest of the package, so `require` relies on Node's `require(esm)` (Node 20.19+, 22.12+ and 24).

### Direct mode

Direct mode sends the key from the process that runs the grid: `POST ${baseURL}/v1/systemone` with `Authorization: Bearer <apiKey>`.

> **A key used in a browser is visible to anyone using that browser.** Direct mode is for Node scripts, server-side code, tests and local demos. Use endpoint mode in production.

- **In Node** it works as is.
- **In a browser without `dangerouslyAllowBrowser: true`,** AI Fill refuses: `validateAIFillConfig` reports it, and a fill fails with a `configuration` error before any request is made.
- **In a browser with `dangerouslyAllowBrowser: true`,** AI Fill prints one `console.warn` per page that the key is visible to the browser's user.
- **CORS limitation:** TypeSafe's API currently rejects browser CORS preflights from every origin tried, so direct calls from a browser fail anyway. AI Fill reports that as a `network` error with the message "TypeSafe's API does not accept browser calls from this origin; use endpoint mode or the local dev proxy."

### The local dev proxy

For browser demos (Storybook, the sample apps), the repository has an unpublished proxy, `scripts/jev-dev-proxy.mjs`. It runs `createJevHandler` on `0.0.0.0:8787` with the key from `JEV_API_KEY` (or `TYPESAFE_API_KEY`):

```bash
npm run build
JEV_API_KEY=… node scripts/jev-dev-proxy.mjs [--port 8787] [--host 0.0.0.0] [--allow-origin https://my-storybook.example.com]… [--allow-model <model>]…
```

Then point the grid at it: `connection: { mode: "endpoint", url: "http://localhost:8787/api/jev" }` (any path works).

- It allows `http://localhost:<any port>` and `http://127.0.0.1:<any port>`, plus only the exact origins passed with `--allow-origin`. It never allows `*`, and it refuses `--allow-origin *`, `--allow-origin null` and values that aren't origins.
- `--allow-model` replaces the default model list (`jev-latest`) instead of adding to it, so pass `--allow-model jev-latest` too if you still want it.
- `authorize` checks the same list, so a request without an allowed `Origin` header (including one from `curl` without `-H "Origin: …"`) gets a 403 and never reaches Jev.
- It answers CORS preflights for allowed origins, and exposes `retry-after`, `retry-after-ms` and `x-typesafe-request-id` to the browser.
- It logs the method, path, status and time of each request, never the key, headers or bodies.
- Every request it forwards is a live, billed Jev call.

### The mock: `@specstory/ai-data-grid/testing`

`createMockJev` is a deterministic stand-in for Jev with no network access, for tests, Storybook and local development:

```ts
import { createMockJev } from "@specstory/ai-data-grid/testing";

const jev = createMockJev({
    seed: 1,
    latencyMs: 300,
    rules: [{ instructions: /own a budget/, answer: { type: "noul", noul: 0.92 } }],
    errors: [{ kind: "rate-limit", calls: [0], retryAfterMs: 2000 }],
});

const aiFill = { ...config, connection: jev.connection }; // or { mode: "endpoint", url: "/api/jev", fetch: jev.fetch }
```

| Option | Meaning | Default |
|---|---|---|
| `rules` | `MockJevRule[]`. Each matches on any of `questionId` (AI Fill sends `q0`, `q1`, … per request), `type`, `instructions` (a string or RegExp; for a column with `context`, the inner instructions) and `state` (a predicate, or a RegExp tested against its canonical JSON), and gives an `answer` or a function returning one. The first rule that answers wins. | none |
| `fixtures` | Recorded `{ request, response }` pairs, replayed when a request's `state` and `questions` are equal. Use synthetic data only. | none |
| `latencyMs` | A number, or a function of the `MockJevCall`. It uses timers, so fake timers control it. | `0` |
| `errors` | Errors to inject, each `{ kind, calls?, times?, retryAfterMs?, message? }`. `kind` is `authentication` (401), `configuration` (400), `invalid-request` (422), `input-too-large` (413), `rate-limit` (429), `overloaded` (529), `server-error` (500), `network` (the connection drops), `timeout` (never answers), `malformed` (a wrong answer type) or `evaluation` (answers left out). `calls` lists the 0-based call indexes it applies to (default every call), and `times` caps how often. | none |
| `seed` | Changes every generated answer | `0` |
| `model` | The model id reported, or a function of the requested one | `jev-mock-1.0.0` for `jev-latest` and `jev-preview`, otherwise the requested id |

A question no rule answers gets a generated answer. Generated answers depend only on the seed, the state and the question (not on call order or question ids), and always pass `parseJevAnswer`: Choice probabilities sum to 1 and the choice is the most probable option, a Score is the probability-weighted position with a legend, and a Noul is in [0, 1].

The returned `MockJev` has `connection` (`{ mode: "custom", send }`), `send`, `fetch`, `calls` and `reset()`. Its `fetch` behaves like Jev for URLs ending in `/v1/systemone` (it needs an `Authorization` header) and like an endpoint for any other URL: it takes the request body and answers with Jev's body or a `JevEndpointErrorBody`, but runs none of `createJevHandler`'s checks (method, `authorize`, models, sizes). `calls` logs every call as a `MockJevCall`: its `index`, `via` (`send` or `fetch`), `url`, `authorized` (whether an `Authorization` header was sent; its value is never recorded), `request`, `startedAt`, `status` (`pending`, `answered`, `failed` or `aborted`), `httpStatus`, the `error` kind for failed calls and the `response`. An injected `timeout` ends as `aborted` when the request is cancelled, and injected `malformed` and `evaluation` errors end as `answered` with status 200, since those are bad answers rather than failed calls.

### Models

The model in the configuration (the grid's `model`, or a column's) is sent to Jev as given, and no model version is hard-coded. The versioned id that answered, for example `jev-1.13.0` for a `jev-latest` request, is kept with every answer (`answer.model`) and reported in result metadata as `model`, next to `requestedModel`.

## Execution and errors

This section describes how AI Fill runs the fills a grid starts. The engine is internal, and its settings are the `execution` options in `AIFillConfig`.

### What starts a request

Only an explicit fill, retry or re-run starts inference: a menu item, a shortcut, a confirm dialog or app code. Painting, scrolling, sorting, filtering, selecting and opening a suggestion never send a request.

### Planning a fill

Before anything is sent, a fill works out which cells it evaluates and which it skips, and why:

| Skip reason | When |
|---|---|
| `unloaded` | The row is gone, or the destination is a loading cell |
| `read-only` | The destination isn't editable, or is `readonly` |
| `not-applicable` | The column is disabled by a configuration issue, its `fillScopes` doesn't include the scope, or `applies` returned false |
| `populated` | The destination isn't empty by `isEmpty`, and the scope or `overwrite` doesn't allow evaluating it (only `selection` with `overwrite: "suggest"` or `"apply"`, and `column` with `"apply"`, do) |
| `missing-input` | `missingInput` is `"skip"` (the default) and `isMissing` is true |
| `cached` | The cell already has a suggested, review or withheld result for the same question, input and model, not marked `manual`, and its destination hasn't changed since |

A fill is refused with a `configuration` error, before any request, when the configuration has a grid-level issue or the fill would evaluate more than `maxCellsPerRun` cells (skipped cells don't count). A refused fill only calls `onError`: it doesn't call `onRunStart` or `onRunEnd`. An `applies`, `isEmpty`, `isMissing`, `state` or grid `rowState` callback that throws gives that cell a `configuration` error.

### Requests, the cache and dedup

- **One row per request.** Rows are never packed together.
- **Columns share requests.** A row's AI columns whose state (as canonical JSON) and model are identical go into one request, one question per column, with the ids `q0`, `q1`, …. Groups are split into chunks of `maxQuestionsPerRequest` (default 16).
- **Size.** A state longer than `maxStateChars` (default 60000) characters of JSON is an `input-too-large` error for that cell, before anything is sent.
- **Cache.** Answers are cached (up to `cacheSize`, default 5000, least recently used first out) by row id, column id, question fingerprint, input fingerprint and requested model. A repeated fill of the same cell, for example after a reject, is answered from the cache with no request.
- **Dedup.** A cell whose identical request is already in flight joins it instead of sending another.

### Scheduling, limits and retries

| Setting | Default | Meaning |
|---|---|---|
| `concurrency` | 4 | Requests in flight at once. Never exceeded. |
| `maxRequestsPerMinute` | 600 | A token bucket, with bursts of up to one second's worth (at least one) |
| `timeoutMs` | 15000 | The timeout for each attempt |
| `maxRetries` | 2 | Retries after the first attempt, for retryable failures only |
| `backoff` | 500 ms → 5 s, jitter 0.25 | The delay doubles from `initialMs` up to `maxMs`, minus up to `jitter` of it at random |

- **Retried:** network errors, timeouts, and HTTP 408, 429, 500–599 (except an endpoint's 500 `server_configuration`) and 529. **Never retried:** every other 4xx status, including 400, 401, 403, 404, 405, 413 and 422.
- **Server delays.** A `retry-after-ms` or `Retry-After` header (or the endpoint body's `retryAfterMs`) of up to 60 s is honored instead of the backoff. A longer one falls back to the backoff.
- **Rate limits.** A 429, 503 or 529 that is still failing after the retries fails that request's cells with a retryable `rate-limit` or `overloaded` error, and pauses the whole queue for the server's delay (or `backoff.maxMs` when there is none), at most 60 s.
- **Authentication.** A 401 or 403 aborts the whole run: one `authentication` error goes to `onError`, listing every unfinished cell, and no further request is made for the run.
- **Partial success.** Every cell settles on its own. Cells that succeeded keep their results when others fail, and a retry re-runs only the failed cells, with the scope and mode they had.
- **Committing once.** A result is written at most once. A second commit of the same result is refused and reported as `commit-blocked`, so a retry or a repeated accept can't write twice.

### Cancellation, late and out-of-order responses

- **Cancel** drops the run's queued requests, aborts its in-flight requests (unless another run is waiting on the same request), and puts its cells back to the result they had before. The run ends with `cancelled: true`.
- **Late responses are ignored.** Every request for a cell gets a new sequence number, and a response settles a cell only when it belongs to the latest request for that row id and column id, from the same run. So a cancelled request, an older request that arrives after a newer one, or a retry can never attach its answer to a different cell, or overwrite a newer request's result.
- **Checked again on arrival.** When an answer arrives, the row's input is fingerprinted again and the destination compared with its value at request time. If the input changed (a source was edited, or the data changed outside the grid), the answer is stored as `stale`. If the destination changed, it is also marked `manual`. Neither is ever committed.
- **Deleted rows.** If the row is gone when an answer arrives, or when the app reports changed rows while a decided result waits, the result is dropped and `onResult` reports it with status `cancelled` and `reason: "row-missing"`. An error response for a deleted row is stored as an error. Rows are found by id, never by display position, so sorting or filtering while a request is pending can't move a result to another row.

### Re-evaluation without a request

Changing a column's `policy`, `output` (including `format`, labels and values), `presentation` or `decide` re-decides its stored answers synchronously, with no request. Changing its instructions, context, options, levels, criteria, sources or model, or the grid's `model`, marks its results `stale` instead; they need an explicit re-run. Removing a column drops its results. Marking a result stale never starts a request by itself.

### Errors

Every `AIFillError` has a `kind`, a `message` and `retryable`, plus `httpStatus` and `requestId` (the `x-typesafe-request-id` header) where they apply, and the affected `cells` (or `columnId` for a column-level error). Errors never write to the grid, though a failed request replaces the cell's earlier stored answer with the error.

| Kind | Scope | Retryable | Produced by |
|---|---|---|---|
| `configuration` | Run, column or cell | no | An invalid configuration, direct mode in a browser without `dangerouslyAllowBrowser`, a fill over `maxCellsPerRun`, an incomplete output mapping, a throwing `applies`, `isEmpty`, `isMissing`, `state`, `rowState` or `connection.headers()`, HTTP 400, 404 and 405, and an endpoint's 500 `server_configuration` |
| `authentication` | Run | no | HTTP 401 and 403. Aborts the run. |
| `rate-limit` | Cells | yes | HTTP 429 after the retries |
| `overloaded` | Cells | yes | HTTP 529 and 503 after the retries |
| `timeout` | Cells | yes | No response within `timeoutMs`, and HTTP 408 and 504, after the retries |
| `network` | Cells | yes | The request couldn't be sent or the connection failed, and other 5xx statuses. In direct mode in a browser, the message points to endpoint mode. |
| `invalid-request` | Cells | no | HTTP 422 (with Jev's `detail`) and other 4xx statuses |
| `input-too-large` | Cells | no | A state over `maxStateChars`, and HTTP 413 |
| `evaluation` | Cells | yes | The response has no answer for the cell's question id |
| `malformed` | Cells | no | The answer fails `parseJevAnswer`, or the body isn't JSON or has no `answers` |
| `type-mismatch` | Cells | no | The mapped value doesn't fit the destination cell, when the answer arrives or at commit time |
| `policy-callback` | Cells | no | `decide` threw or returned something invalid |
| `commit-blocked` | Cells | no | A write was refused: the result was already committed, its row is gone, its inputs or destination changed, the cell is read-only, the overwrite policy doesn't allow it, or `validateCell` returned `false` |

### Callbacks

| Callback | When |
|---|---|
| `onRunStart({ runId, columnIds, cells, apply })` | A run starts (not for a refused fill). `cells` counts the cells it evaluates. |
| `onRunProgress({ runId, done, total })` | After each cell settles |
| `onResult(event)` | For every settled cell: suggested, review, withheld, error and stale results, and `row-missing` drops. The event carries the result metadata: `runId`, `rowId`, `columnId`, `requestedModel`, `model`, the short `questionFingerprint` and `inputFingerprint`, the `answer`, and `timings` (`queuedAt`, `sentAt`, `receivedAt`). Re-evaluation after a configuration change doesn't call it. |
| `onRunEnd(summary)` | A started run ends, including when cancelled: `{ runId, cancelled, counts, skipped }`, with `counts` by status and `skipped` by reason |
| `onError(error)` | For a refused fill, once per failed request for each run waiting on it (once per run for `authentication`), and for each cell error. A `decide` that returns `apply` for a column without `autoApply` is reported once per column and message for the grid's lifetime. |
| `onReject({ cells })` | Results are rejected. Nothing is written. |
| `onCommit({ commitId, source, edits })` | Results are written, with each edit's previous and next cell and its metadata |

A callback that throws doesn't stop AI Fill. The error is rethrown asynchronously, so it still shows up in the console.

## Exports

AI Fill has three entry points:

| Entry | Contents |
|---|---|
| `@specstory/ai-data-grid` | The functions and types below. Every AI Fill export name here contains `AI`, `AIFill` or `Jev`, or starts with `Choice`, `Score` or `Noul`. |
| `@specstory/ai-data-grid/server` | `createJevHandler`, `toNodeListener`, and their types `JevHandlerOptions` and `JevNodeListener` (see [The server helper](#the-server-helper)) |
| `@specstory/ai-data-grid/testing` | `createMockJev`, and its types `MockJev`, `MockJevOptions`, `MockJevRule` and `MockJevCall` (see [The mock](#the-mock-specstoryai-data-gridtesting)) |

From `@specstory/ai-data-grid`:

| Export | What it does |
|---|---|
| `validateAIFillConfig(config, { columns?, isBrowser? })` | Returns every configuration problem as `AIFillConfigIssue[]`. An empty array means the configuration is valid. |
| `parseJevAnswer(raw, question, model)` | Checks a raw Jev answer against the question it answers. Returns `{ ok: true, answer }` with a `ParsedJevAnswer`, or `{ ok: false, reason }`. |
| `mapAIOutput(definition, answer, ctx?)` | Maps a parsed answer. Returns `{ ok: true, output }`, where the `AIMappedOutput` keeps the raw `answer`, the `display` text and the `value` to write (with `hasValue`) apart, plus the semantic `outcome`; or `{ ok: false, error }`. |
| `evaluateAIPolicy({ definition, answer, context, mode? })` | Runs mapping, the gates and `decide` on a parsed answer, and returns the status with its `AIPolicyDecision` and output, or an error. It makes no request. |
| `isAIDestinationEmpty(cell)` | The default emptiness check for destination cells. `0` and `false` are values, not empty. |
| `<AIFillStatus api className? style? />` | The status bar as a component you place yourself, for grids with `statusBar: false` (see [Built-in UI](#built-in-ui)). Its props type is `AIFillStatusProps`. |

The API types are `AIFillApi`, `AIFillTarget`, `AICellState`, `AIRunState` and `AIMenuItem` (see [The API](#the-api-aifillapi)), and the shortcuts are typed by `AIFillShortcuts`. The `aiFill` prop is on `DataEditorProps`, and `DataEditorRef` has the optional `aiFill` member; neither adds an export name.

The types cover the Jev contract (`JevRequest`, `JevResponse`, `JevQuestion`, `JevAnswer` and the per-primitive `JevChoice*`, `JevScore*` and `JevNoul*` types), the endpoint contract's error body (`JevEndpointErrorBody`), the parsed answers (`ChoiceAnswer`, `ScoreAnswer`, `NoulAnswer`), the configuration (`AIFillConfig`, `AIColumnDefinition` and its per-primitive parts), and the results (`AIPolicyDecision`, `AIMappedOutput`, `AIFillError`, and the result, run, commit and reject events). Each has TSDoc.

Tests never call Jev: they use `createMockJev` or a fake transport, and a guard installed by core's `vitest.setup.ts` fails any test that sends a request to `*.typesafe.ai`. They live in `packages/core/test/ai-fill/` and run with core's `npm test -- --run` (the bundle-budget and `/server` load tests need `npm run build` first).
