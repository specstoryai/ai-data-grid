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

> **In development: the `aiFill` prop arrives in a later package.** AI Fill is being built in stages inside `@specstory/ai-data-grid`. So far it has the Jev contract and answer parser, the configuration types and their validator, the result policy engine, and the execution layer: the Jev clients, the scheduler, the cache and the result store. `DataEditor` doesn't use it yet, so it can't fill a grid on its own. The server helper (`@specstory/ai-data-grid/server`) and the mock (`@specstory/ai-data-grid/testing`) are complete and usable now. The `aiFill` prop, `DataEditorRef.aiFill` and the built-in UI come in later stages.

AI Fill is powered by [Jev](https://docs.typesafe.ai), TypeSafe's Choice, Score and Noul primitives.

## What it is

AI Fill lets a developer add AI-filled columns to a grid in configuration alone. You describe, per column, a Jev question (a **Choice**, a **Score** or a **Noul**), the row state it is asked about, and how answers become cell values. AI Fill decides, for every answer, whether it is shown, withheld, flagged for review or applied, by rules you set. It never writes a value the user didn't accept, unless you explicitly configure automatic application for a "Fill and apply" run.

Jev returns structured answers, not prose:

| Primitive | You define | Jev answers with |
|---|---|---|
| Choice | A question and a map of option ids to descriptions (2–255 options) | The selected option, the probability of every option (summing to 1), and a separate model confidence |
| Score | A question and an ordered rubric of 2–10 levels | A score in [0, levels − 1] (a probability-weighted position, not a percentage), a legend, each level's probability, and a confidence |
| Noul | A yes/no question, optionally with what true and false mean | The probability that the answer is yes, in [0, 1]. There is no confidence. A value near 0 is a strong no, not a failure. |

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
| `rows` | `getRowId(row)` (required) and optional `getRowIndex(rowId)`. Nothing reads `getRowIndex` yet; the grid integration that uses it comes in a later stage. |
| `rowState` | The row state sent to Jev. Default: built from each column's `sources`. |
| `rowScope` | A function returning the rows a column-wide fill covers: `() => ({ rows: "displayed" \| rowId[], label })`. Without it, column-wide fills aren't offered. |
| `columns` | AI column definitions, keyed by `GridColumn.id` |
| `execution` | Scheduler limits (see [Execution and errors](#execution-and-errors)): `concurrency` (4), `maxRequestsPerMinute` (600), `timeoutMs` (15000), `maxRetries` (2), `backoff` (500 ms → 5 s, jitter 0.25), `maxCellsPerRun` (1000), `confirmAbove` (100; validated, but nothing acts on it until the confirm dialog arrives in a later stage), `maxQuestionsPerRequest` (16), `maxStateChars` (60000), `cacheSize` (5000) |
| `onRunStart`, `onRunProgress`, `onRunEnd`, `onResult`, `onCommit`, `onReject`, `onError` | Observers. `onResult` fires for every decided result, including withheld and review ones. |

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

## Identity and staleness

These rules are internal (the helpers aren't exported), but they decide when a stored answer can be reused:

- The question sent to Jev is built from the column definition: its `primitive`, `instructions` and `context`, plus the Choice option ids and descriptions, the Score level descriptions in order, or the Noul criteria.
- The question fingerprint is canonical JSON (sorted keys) of that question plus the column's `sources`, deduplicated and sorted. The input fingerprint is canonical JSON of the state sent.
- Cached answers are keyed by row id, column id, both fingerprints and the model. The key uses the exact canonical strings, so a hash collision can't attach a wrong answer. An 8-hex-digit FNV-1a short hash is used for display and metadata only.
- Changing the instructions, context, option ids or descriptions, level descriptions or their order, Noul criteria, sources, the state sent or the model changes the key. Changing the policy, output mapping (including option and level `label`, `value` and `outcome`, and Noul labels), presentation or `decide` doesn't.

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

This section describes how AI Fill runs fills once the `aiFill` prop arrives. The engine is internal, and its settings are the `execution` options in `AIFillConfig`.

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
| `type-mismatch` | Cells | no | The mapped value doesn't fit the destination cell |
| `policy-callback` | Cells | no | `decide` threw or returned something invalid |
| `commit-blocked` | Cells | no | A result that was already committed would be written again |

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

The types cover the Jev contract (`JevRequest`, `JevResponse`, `JevQuestion`, `JevAnswer` and the per-primitive `JevChoice*`, `JevScore*` and `JevNoul*` types), the endpoint contract's error body (`JevEndpointErrorBody`), the parsed answers (`ChoiceAnswer`, `ScoreAnswer`, `NoulAnswer`), the configuration (`AIFillConfig`, `AIColumnDefinition` and its per-primitive parts), and the results (`AIPolicyDecision`, `AIMappedOutput`, `AIFillError`, and the result, run, commit and reject events). Each has TSDoc.

Tests never call Jev: they use `createMockJev` or a fake transport, and a guard installed by core's `vitest.setup.ts` fails any test that sends a request to `*.typesafe.ai`. They live in `packages/core/test/ai-fill/` and run with core's `npm test -- --run` (the bundle-budget and `/server` load tests need `npm run build` first).
