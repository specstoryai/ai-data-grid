import { type EditableGridCell, type GridCell, GridCellKind } from "../../internal/data-grid/data-grid-types.js";

interface DropdownData {
    readonly kind: "dropdown-cell";
    readonly value: string | null | undefined;
    readonly allowedValues: readonly (string | { readonly value: string; readonly label: string } | null | undefined)[];
}

function dropdownData(cell: GridCell): DropdownData | undefined {
    if (cell.kind !== GridCellKind.Custom) return undefined;
    const data = cell.data as Partial<DropdownData> | null | undefined;
    return data?.kind === "dropdown-cell" ? (data as DropdownData) : undefined;
}

/** Implements the public `isAIDestinationEmpty`; its reference documentation is on the export in `ai-fill/index.ts`. */
export function isAIDestinationEmpty(cell: GridCell): boolean {
    switch (cell.kind) {
        case GridCellKind.Text:
        case GridCellKind.Uri:
        case GridCellKind.Markdown:
        case GridCellKind.RowID:
            return cell.data === "" || cell.data === null || cell.data === undefined;
        case GridCellKind.Number:
            return cell.data === null || cell.data === undefined || Number.isNaN(cell.data);
        case GridCellKind.Boolean:
            return cell.data === null || cell.data === undefined;
        case GridCellKind.Custom: {
            const dropdown = dropdownData(cell);
            if (dropdown !== undefined) {
                return dropdown.value === "" || dropdown.value === null || dropdown.value === undefined;
            }
            return cell.data === null || cell.data === undefined;
        }
        case GridCellKind.Image:
        case GridCellKind.Bubble:
        case GridCellKind.Drilldown:
            return cell.data.length === 0;
        case GridCellKind.Loading:
        case GridCellKind.Protected:
            return false;
    }
}

/**
 * The default `output.toCell`: writes `value` into a copy of the destination
 * cell, by the destination's current kind. Returns `undefined` (a
 * `type-mismatch`) when the value doesn't fit:
 * - Text: a string (also written to `displayData`)
 * - Markdown and Uri: a string
 * - Number: a finite number (`displayData` is `String(value)`)
 * - Boolean: `true` or `false`
 * - the cells package's dropdown cell: a string that is one of its `allowedValues`
 * - any other kind: never; configure `output.toCell`
 *
 * It doesn't check `readonly`; the commit guards do.
 */
export function defaultToCell(value: unknown, current: GridCell): EditableGridCell | undefined {
    switch (current.kind) {
        case GridCellKind.Text:
            return typeof value === "string" ? { ...current, data: value, displayData: value } : undefined;
        case GridCellKind.Markdown:
            return typeof value === "string" ? { ...current, data: value } : undefined;
        case GridCellKind.Uri: {
            if (typeof value !== "string") return undefined;
            const { displayData: _stale, ...rest } = current;
            return { ...rest, data: value };
        }
        case GridCellKind.Number:
            return typeof value === "number" && Number.isFinite(value)
                ? { ...current, data: value, displayData: String(value) }
                : undefined;
        case GridCellKind.Boolean:
            return typeof value === "boolean" ? { ...current, data: value } : undefined;
        case GridCellKind.Custom: {
            const dropdown = dropdownData(current);
            if (dropdown === undefined || typeof value !== "string") return undefined;
            const allowed = dropdown.allowedValues.some(option =>
                typeof option === "string" ? option === value : option?.value === value
            );
            return allowed ? { ...current, data: { ...dropdown, value }, copyData: value } : undefined;
        }
        default:
            return undefined;
    }
}
