import * as React from "react";
import {
    type AIFillApi,
    type AIFillConfig,
    DataEditor,
    type DataEditorRef,
    type EditableGridCell,
    type GridCell,
    GridCellKind,
    type GridColumn,
    type Item,
} from "@specstory/ai-data-grid";
import { createMockJev } from "@specstory/ai-data-grid/testing";
import "@specstory/ai-data-grid/dist/index.css";
import { useUndoRedo } from "../use-undo-redo.js";

/**
 * AI Fill story 11 (SPST-16): a bulk accept is one `useUndoRedo` step. It
 * lives in the source package because core can't import `useUndoRedo`. The
 * other AI Fill stories are in core's `src/ai-fill/stories/`. Every contact
 * is synthetic, and answers come from `createMockJev` unless the endpoint URL
 * control is set.
 */

export default {
    title: "AI-Data-Grid/AI Fill/3 Undo with useUndoRedo",
};

interface Contact {
    readonly id: string;
    readonly name: string;
    readonly title: string;
    readonly persona: string;
}

const initialContacts: readonly Contact[] = [
    { id: "c1", name: "Avery Chen", title: "VP of Finance", persona: "" },
    { id: "c2", name: "Blake Okafor", title: "Operations Analyst", persona: "" },
    { id: "c3", name: "Emery Novak", title: "Staff Engineer", persona: "" },
    { id: "c4", name: "Finley Brooks", title: "Chief Operating Officer", persona: "" },
    { id: "c5", name: "Morgan Diaz", title: "Head of Sales", persona: "" },
    { id: "c6", name: "Riley Park", title: "Support Specialist", persona: "" },
];

const columns: GridColumn[] = [
    { id: "name", title: "Name", width: 150 },
    { id: "title", title: "Title", width: 220 },
    { id: "persona", title: "Persona", width: 240 },
];

const fields = ["name", "title", "persona"] as const;

/** The seeded answer for each title: the option and its probability. */
const seeded: Readonly<Record<string, readonly [string, number]>> = {
    "VP of Finance": ["economic", 0.97],
    "Operations Analyst": ["user", 0.88],
    "Staff Engineer": ["champion", 0.83],
    "Chief Operating Officer": ["economic", 0.96],
    "Head of Sales": ["champion", 0.9],
    "Support Specialist": ["user", 0.92],
};

const options = ["champion", "economic", "user"];

function stateTitle(state: unknown): string {
    return typeof state === "object" && state !== null && !Array.isArray(state)
        ? String((state as Record<string, unknown>).title ?? "")
        : "";
}

export const BulkAcceptAndUndo: React.FC<{ readonly endpointUrl: string }> = ({ endpointUrl }) => {
    const ref = React.useRef<DataEditorRef>(null);
    const [contacts, setContacts] = React.useState(initialContacts);
    const [api, setApi] = React.useState<AIFillApi>();
    const [, refresh] = React.useReducer((n: number) => n + 1, 0);

    const jev = React.useMemo(
        () =>
            createMockJev({
                seed: 1,
                latencyMs: 500,
                rules: [
                    {
                        instructions: /buyer persona/,
                        answer: ({ state }) => {
                            const [choice, probability] = seeded[stateTitle(state)] ?? ["user", 0.9];
                            const rest = (1 - probability) / (options.length - 1);
                            const probabilities = Object.fromEntries(
                                options.map(option => [option, option === choice ? probability : rest])
                            );
                            return { type: "choice", choice, probabilities, confidence: 0.85 };
                        },
                    },
                ],
            }),
        []
    );

    const getCellContent = React.useCallback(
        ([col, row]: Item): GridCell => {
            const value = contacts[row][fields[col]];
            return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
        },
        [contacts]
    );

    // useUndoRedo is position-based: it writes back by [col, row].
    const setCellValue = React.useCallback(([col, row]: Item, value: EditableGridCell) => {
        const text = typeof value.data === "string" ? value.data : "";
        setContacts(previous =>
            previous.map((contact, i) => (i === row ? { ...contact, [fields[col]]: text } : contact))
        );
    }, []);

    const undo = useUndoRedo(ref as React.RefObject<DataEditorRef>, getCellContent, setCellValue);

    const url = endpointUrl.trim();
    const aiFill = React.useMemo<AIFillConfig>(
        () => ({
            connection: url === "" ? jev.connection : { mode: "endpoint", url },
            model: "jev-latest",
            rows: { getRowId: row => initialContacts[row].id },
            rowScope: () => ({ rows: "displayed", label: "contacts" }),
            columns: {
                persona: {
                    primitive: "choice",
                    instructions: "Which buyer persona best describes this contact?",
                    sources: ["title"],
                    options: {
                        champion: { description: "Drives the purchase internally", label: "Champion" },
                        economic: { description: "Controls the budget", label: "Economic buyer" },
                        user: { description: "Uses the product day to day", label: "End user" },
                    },
                    policy: { show: { minProbability: 0.5 }, ready: { minProbability: 0.8 } },
                },
            },
            onReady: ready => {
                setApi(ready);
                ready.fill("column-empty");
            },
        }),
        [url, jev]
    );

    React.useEffect(() => api?.subscribe(refresh), [api]);
    const cells = api?.getRunState().cells;

    return (
        <div style={{ padding: "20px 28px", fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.5 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>11. Bulk accept and undo (useUndoRedo)</h1>
            <p style={{ maxWidth: 960 }}>
                The grid is wired to <code>useUndoRedo</code> from <code>@specstory/ai-data-grid-source</code> the
                standard way: its <code>onCellEdited</code>, <code>gridSelection</code> and{" "}
                <code>onGridSelectionChange</code>. The story fills the empty Persona cells when it loads, and every
                answer is suggested.
            </p>
            <ol style={{ maxWidth: 960 }}>
                <li>
                    Accept them all at once: <b>Accept 6 eligible</b> in the status bar or the Persona ▾ menu. The six
                    values are written as one batch.
                </li>
                <li>
                    Press <b>Cmd/Ctrl+Z</b> (or Undo below). Every Persona cell is restored in one step. No suggestion
                    comes back: the results stay <code>accepted</code>, and filling again is always explicit.
                </li>
                <li>
                    Press <b>Cmd/Ctrl+Shift+Z</b> (or Redo). The six values are written again, once.
                </li>
            </ol>
            <p style={{ maxWidth: 960 }}>
                <code>useUndoRedo</code> records edits by position, so an undo after re-sorting or filtering writes to
                positions. <code>api.revertCommit(commitId)</code> reverts a commit by row id instead.
            </p>
            <p>
                <button onClick={undo.undo} disabled={!undo.canUndo}>
                    Undo
                </button>{" "}
                <button onClick={undo.redo} disabled={!undo.canRedo}>
                    Redo
                </button>{" "}
                <code>
                    AI results: {cells?.suggested ?? 0} suggested, {cells?.accepted ?? 0} accepted
                </code>
            </p>
            <div style={{ height: 320, border: "1px solid #dde1e7", borderRadius: 6, overflow: "hidden" }}>
                <DataEditor
                    ref={ref}
                    aiFill={aiFill}
                    columns={columns}
                    rows={contacts.length}
                    getCellContent={getCellContent}
                    onCellEdited={undo.onCellEdited}
                    gridSelection={undo.gridSelection ?? undefined}
                    onGridSelectionChange={undo.onGridSelectionChange}
                    rowMarkers="number"
                    width="100%"
                    height={320}
                />
            </div>
        </div>
    );
};
Object.assign(BulkAcceptAndUndo, {
    storyName: "11 Bulk accept and undo (useUndoRedo)",
    args: { endpointUrl: "" },
    argTypes: {
        endpointUrl: {
            control: { type: "text" },
            description:
                "Leave empty to use the mock (no network calls). To call Jev, start `node scripts/jev-dev-proxy.mjs` " +
                "and enter its URL, for example http://localhost:8787/api/jev. Never enter a key here.",
        },
    },
});
