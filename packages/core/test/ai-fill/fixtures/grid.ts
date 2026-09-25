import { type GridCell, GridCellKind } from "../../../src/internal/data-grid/data-grid-types.js";
import type { AIFillEngineHost } from "../../../src/ai-fill/engine/engine.js";

/** A synthetic contact. Every value here is made up. */
export interface Contact {
    readonly id: string;
    company: string;
    title: string;
    notes: string;
    persona: string;
    seniority: string;
    ownsBudget: boolean | null;
    /** Makes the persona cell read-only. */
    lockedPersona?: boolean;
    /** Makes every cell of the row a loading cell. */
    loading?: boolean;
}

export function contact(id: string, title: string, company: string = "Example Co", notes: string = ""): Contact {
    return { id, company, title, notes, persona: "", seniority: "", ownsBudget: null };
}

function text(data: string, readonly: boolean = false): GridCell {
    return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: true, readonly };
}

function cellFor(row: Contact, columnId: string): GridCell {
    if (row.loading === true) return { kind: GridCellKind.Loading, allowOverlay: false };
    switch (columnId) {
        case "ownsBudget":
            return { kind: GridCellKind.Boolean, data: row.ownsBudget, allowOverlay: false };
        case "persona":
            return text(row.persona, row.lockedPersona === true);
        case "company":
        case "title":
        case "notes":
        case "seniority":
            return text(row[columnId]);
    }
    throw new Error(`unknown column ${columnId}`);
}

/** A grid whose display order (`view`) can be sorted, filtered and edited. Rows are found by id. */
export class FakeGrid implements AIFillEngineHost {
    view: Contact[];
    reads = 0;

    constructor(rows: Contact[]) {
        this.view = rows;
    }

    byId(id: string): Contact {
        const row = this.view.find(c => c.id === id);
        if (row === undefined) throw new Error(`no row ${id}`);
        return row;
    }

    readCell(rowId: string, columnId: string, sources: readonly string[]) {
        this.reads++;
        const row = this.view.findIndex(c => c.id === rowId);
        if (row < 0) return undefined;
        const data = this.view[row];
        return {
            row,
            destination: cellFor(data, columnId),
            sources: Object.fromEntries(sources.map(source => [source, cellFor(data, source)])),
        };
    }

    /** `[rowId, columnId]` for every row and the given columns. */
    cells(...columnIds: string[]): [string, string][] {
        return this.view.flatMap(row => columnIds.map(columnId => [row.id, columnId] as [string, string]));
    }
}
