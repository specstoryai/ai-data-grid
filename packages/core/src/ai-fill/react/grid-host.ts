import type { GridCell, GridColumn, Item } from "../../internal/data-grid/data-grid-types.js";
import type { AIFillConfig } from "../config/types.js";
import type { AIColumnId, AIRowId } from "../config/results.js";
import type { AIFillEngineHost } from "../engine/engine.js";
import type { AIFillCellRead } from "../engine/state.js";

/** The grid props AI Fill reads. */
export interface AIFillGridProps {
    readonly columns: readonly GridColumn[];
    readonly rows: number;
    readonly getCellContent: (cell: Item) => GridCell;
}

/**
 * Reads the grid for the engine, always by stable id. Display coordinates are
 * resolved only at the moment they're needed, from the latest props.
 *
 * `rows.getRowIndex` is used when the app provides it, and its answer is
 * checked against `rows.getRowId`: an index that maps back to another id is
 * treated as a missing row, so a wrong index can't redirect a write. Without
 * it, the rows are scanned once and the map is reused until the current task
 * ends or {@link invalidate} is called.
 */
export class AIFillGridHost implements AIFillEngineHost {
    private scan: Map<AIRowId, number> | undefined;
    private columnsFor: readonly GridColumn[] | undefined;
    private columnIndex = new Map<AIColumnId, number>();

    constructor(
        private readonly props: () => AIFillGridProps,
        private readonly config: () => AIFillConfig
    ) {}

    /** Forgets the cached row scan. Call it after anything that can change the display order. */
    invalidate(): void {
        this.scan = undefined;
    }

    /** The display row of a row id now, or `undefined` when the row isn't displayed. */
    rowIndex(rowId: AIRowId): number | undefined {
        const { rows } = this.props();
        const { getRowId, getRowIndex } = this.config().rows;
        if (getRowIndex !== undefined) {
            const row = getRowIndex(rowId);
            return row !== undefined && Number.isInteger(row) && row >= 0 && row < rows && getRowId(row) === rowId
                ? row
                : undefined;
        }
        if (this.scan === undefined) {
            const scan = new Map<AIRowId, number>();
            for (let row = 0; row < rows; row++) {
                const id = getRowId(row);
                if (!scan.has(id)) scan.set(id, row);
            }
            this.scan = scan;
            queueMicrotask(() => {
                if (this.scan === scan) this.scan = undefined;
            });
        }
        return this.scan.get(rowId);
    }

    /** The row id of a display row. */
    rowId(row: number): AIRowId {
        return this.config().rows.getRowId(row);
    }

    /** The display index of a column id now, or `undefined` when the grid has no such column. */
    colIndex(columnId: AIColumnId): number | undefined {
        const { columns } = this.props();
        if (this.columnsFor !== columns) {
            this.columnsFor = columns;
            this.columnIndex = new Map();
            for (const [index, column] of columns.entries()) {
                if (column.id !== undefined && !this.columnIndex.has(column.id)) this.columnIndex.set(column.id, index);
            }
        }
        return this.columnIndex.get(columnId);
    }

    /** The display location of a cell now, or `undefined` when its row or column isn't displayed. */
    locate(rowId: AIRowId, columnId: AIColumnId): Item | undefined {
        const col = this.colIndex(columnId);
        if (col === undefined) return undefined;
        const row = this.rowIndex(rowId);
        return row === undefined ? undefined : [col, row];
    }

    readCell(rowId: AIRowId, columnId: AIColumnId, sources: readonly AIColumnId[]): AIFillCellRead | undefined {
        const location = this.locate(rowId, columnId);
        if (location === undefined) return undefined;
        const [col, row] = location;
        const { getCellContent } = this.props();
        const cells: { [columnId: string]: GridCell } = {};
        for (const source of sources) {
            const sourceCol = this.colIndex(source);
            if (sourceCol !== undefined) cells[source] = getCellContent([sourceCol, row]);
        }
        return { row, destination: getCellContent([col, row]), sources: cells };
    }
}
