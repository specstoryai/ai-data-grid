import * as React from "react";
import {
    DataEditor,
    GridCellKind,
    type AIFillApi,
    type AIFillConfig,
    type EditableGridCell,
    type GridCell,
    type GridColumn,
    type Item,
} from "@specstory/ai-data-grid";
import "@specstory/ai-data-grid/dist/index.css";
import { createMockJev, type MockJevRule } from "@specstory/ai-data-grid/testing";
import { useMoveableColumns } from "@specstory/ai-data-grid-source";

// The AI Fill consumer scenario, at #ai-fill. `scripts/check-ai-fill-consumer.mjs`
// drives it through `window.__aiFillSmoke`. The mock answers every question, so
// nothing goes over the network. Every value is made up.

interface Contact {
    id: string;
    title: string;
    persona: string;
}

const initialRows: Contact[] = [
    { id: "c1", title: "VP of Finance", persona: "" },
    { id: "c2", title: "Staff Engineer", persona: "" },
    { id: "c3", title: "Operations Analyst", persona: "" },
    { id: "c4", title: "Head of Procurement", persona: "" },
];

const columnsIn: GridColumn[] = [
    { title: "Title", id: "title", width: 220 },
    { title: "Persona", id: "persona", width: 200 },
];

const options = {
    economic: { description: "Controls the budget", label: "Economic buyer" },
    champion: { description: "Drives the purchase internally", label: "Champion" },
    user: { description: "Uses the product day to day", label: "User" },
};

/** The option each title gets, with probability 0.95. */
const expected: Record<string, keyof typeof options> = {
    "VP of Finance": "economic",
    "Staff Engineer": "champion",
    "Operations Analyst": "user",
    "Head of Procurement": "economic",
};

const rules: MockJevRule[] = [
    {
        type: "choice",
        answer: ({ state }) => {
            const text = JSON.stringify(state);
            const title = Object.keys(expected).find(t => text.includes(t));
            if (title === undefined) return undefined;
            const choice = expected[title];
            const probabilities = { economic: 0.025, champion: 0.025, user: 0.025, [choice]: 0.95 };
            return { type: "choice", choice, probabilities, confidence: 0.9 };
        },
    },
];

/** What the check reads: the API, the app's rows, and the labels it should end up with. */
export interface AIFillSmokeHandle {
    readonly api: AIFillApi;
    readonly getRows: () => readonly Contact[];
    readonly expected: { readonly [rowId: string]: string };
}

declare global {
    interface Window {
        __aiFillSmoke?: AIFillSmokeHandle;
    }
}

export function AIFillSmoke() {
    const [rows, setRows] = React.useState(initialRows);
    const rowsRef = React.useRef(rows);
    rowsRef.current = rows;
    const jev = React.useMemo(() => createMockJev({ seed: 1, rules }), []);

    const getCellContentIn = React.useCallback(
        ([col, row]: Item): GridCell => {
            const contact = rows[row];
            const value = columnsIn[col].id === "title" ? contact.title : contact.persona;
            return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
        },
        [rows]
    );

    // From @specstory/ai-data-grid-source, so the sample imports, type-checks and bundles it.
    const { columns, getCellContent, onColumnMoved } = useMoveableColumns({
        columns: columnsIn,
        getCellContent: getCellContentIn,
    });

    const onCellEdited = React.useCallback(
        ([col, row]: Item, newValue: EditableGridCell) => {
            if (columns[col].id !== "persona" || newValue.kind !== GridCellKind.Text) return;
            setRows(prev => prev.map((c, i) => (i === row ? { ...c, persona: newValue.data } : c)));
        },
        [columns]
    );

    const aiFill = React.useMemo<AIFillConfig>(
        () => ({
            connection: jev.connection,
            model: "jev-latest",
            rows: { getRowId: row => rowsRef.current[row]?.id ?? `missing-${row}` },
            rowScope: () => ({ rows: "displayed", label: "contacts" }),
            columns: {
                persona: {
                    primitive: "choice",
                    instructions: "Which buyer persona best describes this contact?",
                    sources: ["title"],
                    options,
                    policy: { show: { minProbability: 0.5 }, ready: { minProbability: 0.8 } },
                },
            },
            onReady: api => {
                window.__aiFillSmoke = {
                    api,
                    getRows: () => rowsRef.current,
                    expected: Object.fromEntries(initialRows.map(r => [r.id, options[expected[r.title]].label])),
                };
            },
        }),
        [jev]
    );

    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <DataEditor
                columns={columns}
                rows={rows.length}
                getCellContent={getCellContent}
                onColumnMoved={onColumnMoved}
                onCellEdited={onCellEdited}
                aiFill={aiFill}
                width="100%"
                height="100%"
            />
        </div>
    );
}
