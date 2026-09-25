import { type GridCell, GridCellKind } from "../../internal/data-grid/data-grid-types.js";
import type { AIJsonValue, JevState } from "../contract/types.js";
import type { AIColumnDefinition, AIFillConfig, AIRowContext } from "../config/types.js";
import type { AIColumnId, AIRowId } from "../config/results.js";
import { isAIDestinationEmpty } from "../policy/cells.js";

/** What the grid reports about one AI cell when asked. */
export interface AIFillCellRead {
    /** The display row now. */
    readonly row: number;
    /** The destination cell now. */
    readonly destination: GridCell;
    /** The column's source cells now, by column id. */
    readonly sources: { readonly [columnId: string]: GridCell };
}

/**
 * The value a source cell contributes to the default row state: the data of
 * text, number and boolean cells (`null` when empty), the texts of a drilldown,
 * the data of image and bubble cells, and a custom cell's `copyData`.
 */
export function cellStateValue(cell: GridCell | undefined): AIJsonValue {
    if (cell === undefined) return null;
    switch (cell.kind) {
        case GridCellKind.Text:
        case GridCellKind.Uri:
        case GridCellKind.Markdown:
        case GridCellKind.RowID:
            return cell.data ?? null;
        case GridCellKind.Number:
            return typeof cell.data === "number" && Number.isFinite(cell.data) ? cell.data : null;
        case GridCellKind.Boolean:
            return typeof cell.data === "boolean" ? cell.data : null;
        case GridCellKind.Image:
        case GridCellKind.Bubble:
            return [...cell.data];
        case GridCellKind.Drilldown:
            return cell.data.map(item => item.text);
        case GridCellKind.Custom:
            return cell.copyData;
        case GridCellKind.Loading:
        case GridCellKind.Protected:
            return null;
    }
}

/** The context passed to `state`, `rowState`, `applies` and `isMissing`. */
export function rowContext(rowId: AIRowId, columnId: AIColumnId, read: AIFillCellRead): AIRowContext {
    return { rowId, columnId, row: read.row, sources: read.sources };
}

/**
 * The row state sent for a column: the column's `state`, else the grid's
 * `rowState`, else `{ [sourceId]: value }` for each of the column's `sources`
 * in order, using {@link cellStateValue}.
 */
export function buildState(config: AIFillConfig, definition: AIColumnDefinition, ctx: AIRowContext): JevState {
    if (definition.state !== undefined) return definition.state(ctx);
    if (config.rowState !== undefined) return config.rowState(ctx);
    const state: Record<string, AIJsonValue> = {};
    for (const source of definition.sources ?? []) state[source] = cellStateValue(ctx.sources[source]);
    return state;
}

/** Whether the input is missing: the column's `isMissing`, else "the column has sources and every one is empty". */
export function isInputMissing(definition: AIColumnDefinition, ctx: AIRowContext): boolean {
    if (definition.isMissing !== undefined) return definition.isMissing(ctx);
    const sources = definition.sources ?? [];
    return (
        sources.length > 0 &&
        sources.every(source => {
            const cell = ctx.sources[source];
            return cell === undefined || isAIDestinationEmpty(cell);
        })
    );
}
