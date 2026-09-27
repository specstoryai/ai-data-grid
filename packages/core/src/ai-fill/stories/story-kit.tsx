/**
 * Shared pieces of the AI Fill stories: synthetic contacts, a small editable
 * table with sorting and filtering, seeded mock answers, the story frame and
 * the "endpoint URL" control. Core's build excludes this folder, and nothing
 * in the package imports it.
 *
 * Every story turns AI Fill on only through the `aiFill` prop, and answers
 * come from `createMockJev` with fixed latency and seeded answers, so a story
 * makes no network call unless a developer sets its endpoint URL.
 */
import * as React from "react";
import { styled } from "@linaria/react";
import { createMockJev, type MockJev, type MockJevOptions, type MockJevRule } from "@specstory/ai-data-grid/testing";
import { DataEditorAll as DataEditor, type DataEditorAllProps } from "../../data-editor-all.js";
import type { DataEditorRef } from "../../data-editor/data-editor.js";
import {
    BooleanEmpty,
    type EditableGridCell,
    type GridCell,
    GridCellKind,
    type GridColumn,
    type Item,
} from "../../internal/data-grid/data-grid-types.js";
import type { AIFillConfig, AIFillConnection, ChoiceColumnDefinition, ChoiceOption } from "../config/types.js";
import type { JevChoiceAnswer, JevNoulAnswer, JevScoreAnswer, JevState } from "../contract/types.js";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export type StoryValue = string | number | boolean | undefined;

/** One row. `id` is the stable row id AI Fill keys results by. */
export interface StoryRow {
    readonly id: string;
    readonly [field: string]: StoryValue;
}

export interface StoryColumn {
    readonly id: string;
    readonly title: string;
    readonly width?: number;
    readonly kind?: "text" | "number" | "boolean";
    readonly readonly?: boolean;
    /** Shows the header ▾ for the app's own menu (AI Fill adds it to AI columns itself). */
    readonly hasMenu?: boolean;
}

/** Synthetic contacts. Every name, company and note is made up. */
export const contacts: readonly StoryRow[] = [
    {
        id: "c1",
        name: "Avery Chen",
        company: "Bluefin Supply",
        title: "VP of Finance",
        notes: "Owns the annual tooling budget and signs purchase orders.",
    },
    {
        id: "c2",
        name: "Blake Okafor",
        company: "Example Manufacturing Co",
        title: "Operations Analyst",
        notes: "Uses the reporting dashboard every day and asked for CSV export.",
    },
    {
        id: "c3",
        name: "Casey Romero",
        company: "Harbor Health",
        title: "Director of IT",
        notes: "Evaluating vendors and wants a security review before any trial.",
    },
    {
        id: "c4",
        name: "Devon Patel",
        company: "Kestrel Retail",
        title: "Head of Procurement",
        notes: "Runs the RFP process; the budget sits with the CFO.",
    },
    {
        id: "c5",
        name: "Emery Novak",
        company: "Tallgrass Labs",
        title: "Staff Engineer",
        notes: "Built the internal prototype and is pushing the team to adopt it.",
    },
    {
        id: "c6",
        name: "Finley Brooks",
        company: "Ridgeway Logistics",
        title: "Chief Operating Officer",
        notes: "Approved last year's platform spend.",
    },
    {
        id: "c7",
        name: "Harper Singh",
        company: "Maple Street Bank",
        title: "Marketing Coordinator",
        notes: "Downloaded a whitepaper.",
    },
    {
        id: "c8",
        name: "Jordan Lee",
        company: "Lumen Media",
        title: "Product Manager",
        notes: "Said budget planning happens next quarter.",
    },
];

/** The contacts with extra fields, for example empty AI columns or an expected-answer column. */
export function contactsWith(extra: (row: StoryRow) => Record<string, StoryValue>): StoryRow[] {
    return contacts.map(row => ({ ...row, ...extra(row) }));
}

// ---------------------------------------------------------------------------
// The table: data, a sortable and filterable view, and the grid callbacks
// ---------------------------------------------------------------------------

export interface StorySort {
    readonly columnId: string;
    readonly direction: "asc" | "desc";
}

export interface StoryTable {
    readonly rows: readonly StoryRow[];
    /** The displayed rows, in display order. */
    readonly view: readonly StoryRow[];
    readonly columns: readonly GridColumn[];
    readonly getCellContent: (cell: Item) => GridCell;
    readonly onCellEdited: (cell: Item, value: EditableGridCell) => void;
    /** `rows.getRowId` for `aiFill`. It is stable and always reads the latest view. */
    readonly getRowId: (row: number) => string;
    /** Changes a value outside the grid's edit handlers. */
    readonly setValue: (rowId: string, field: string, value: StoryValue) => void;
    readonly sort: StorySort | undefined;
    readonly setSort: (sort: StorySort | undefined) => void;
    readonly hidden: ReadonlySet<string>;
    readonly toggleHidden: (rowId: string) => void;
}

function toStoryValue(cell: EditableGridCell): StoryValue {
    const data: unknown = cell.data;
    return typeof data === "string" || typeof data === "number" || typeof data === "boolean" ? data : undefined;
}

/**
 * A small in-memory table. `columnDefs` must be stable (a module constant).
 * Sorting and filtering change only the view: row ids stay with their rows.
 */
export function useStoryTable(initialRows: readonly StoryRow[], columnDefs: readonly StoryColumn[]): StoryTable {
    const [rows, setRows] = React.useState(initialRows);
    const [sort, setSort] = React.useState<StorySort | undefined>(undefined);
    const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());

    const view = React.useMemo(() => {
        const shown = rows.filter(row => !hidden.has(row.id));
        if (sort === undefined) return shown;
        const sign = sort.direction === "asc" ? 1 : -1;
        return [...shown].sort(
            (a, b) => sign * String(a[sort.columnId] ?? "").localeCompare(String(b[sort.columnId] ?? ""))
        );
    }, [rows, hidden, sort]);

    const viewRef = React.useRef(view);
    viewRef.current = view;

    const columns = React.useMemo<GridColumn[]>(
        () =>
            columnDefs.map(def => ({
                id: def.id,
                title: def.title,
                width: def.width ?? 160,
                hasMenu: def.hasMenu,
            })),
        [columnDefs]
    );

    const getCellContent = React.useCallback(
        ([col, row]: Item): GridCell => {
            const def = columnDefs[col];
            const value = view[row]?.[def.id];
            const readonly = def.readonly === true;
            switch (def.kind ?? "text") {
                case "number":
                    return {
                        kind: GridCellKind.Number,
                        data: typeof value === "number" ? value : undefined,
                        displayData: typeof value === "number" ? String(value) : "",
                        allowOverlay: true,
                        readonly,
                    };
                case "boolean":
                    return {
                        kind: GridCellKind.Boolean,
                        data: typeof value === "boolean" ? value : BooleanEmpty,
                        allowOverlay: false,
                        readonly,
                    };
                default: {
                    const text = value === undefined ? "" : String(value);
                    return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: true, readonly };
                }
            }
        },
        [view, columnDefs]
    );

    const setValue = React.useCallback((rowId: string, field: string, value: StoryValue) => {
        setRows(previous => previous.map(row => (row.id === rowId ? { ...row, [field]: value } : row)));
    }, []);

    const onCellEdited = React.useCallback(
        ([col, row]: Item, cell: EditableGridCell) => {
            const target = viewRef.current[row];
            if (target === undefined) return;
            setValue(target.id, columnDefs[col].id, toStoryValue(cell));
        },
        [columnDefs, setValue]
    );

    const getRowId = React.useCallback((row: number) => viewRef.current[row]?.id ?? `missing-${row}`, []);

    const toggleHidden = React.useCallback((rowId: string) => {
        setHidden(previous => {
            const next = new Set(previous);
            if (next.has(rowId)) next.delete(rowId);
            else next.add(rowId);
            return next;
        });
    }, []);

    return {
        rows,
        view,
        columns,
        getCellContent,
        onCellEdited,
        getRowId,
        setValue,
        sort,
        setSort,
        hidden,
        toggleHidden,
    };
}

// ---------------------------------------------------------------------------
// Seeded answers
// ---------------------------------------------------------------------------

/** A Choice answer. The choice is the most probable option, as Jev guarantees. */
export function choiceAnswer(probabilities: Record<string, number>, confidence: number): JevChoiceAnswer {
    let choice = "";
    let best = Number.NEGATIVE_INFINITY;
    for (const [option, probability] of Object.entries(probabilities)) {
        if (probability > best) {
            best = probability;
            choice = option;
        }
    }
    return { type: "choice", choice, probabilities, confidence };
}

/** A Score answer: the score is the probability-weighted position on the rubric. */
export function scoreAnswer(
    levels: readonly string[],
    probabilities: readonly number[],
    confidence: number
): JevScoreAnswer {
    const score = probabilities.reduce((sum, probability, level) => sum + probability * level, 0);
    return {
        type: "score",
        score: Math.round(score * 10_000) / 10_000,
        legend: Object.fromEntries(levels.map((level, i) => [String(i), level])),
        probabilities: Object.fromEntries(probabilities.map((probability, i) => [String(i), probability])),
        confidence,
    };
}

export function noulAnswer(noul: number): JevNoulAnswer {
    return { type: "noul", noul };
}

/**
 * A mock rule that answers the questions whose instructions match, from a
 * table keyed by one field of the row state (for example the contact's
 * title). A row missing from the table gets the mock's generated answer.
 */
export function seededRule(
    instructions: RegExp,
    key: string,
    answers: Readonly<Record<string, JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer>>
): MockJevRule {
    return {
        instructions,
        answer: ({ state }) => {
            const value = stateField(state, key);
            return value === undefined ? undefined : answers[value];
        },
    };
}

function stateField(state: JevState, key: string): string | undefined {
    if (typeof state !== "object" || state === null || Array.isArray(state)) return undefined;
    const value = (state as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
}

/** A mock Jev for one story, with fixed latency. Recreated only when the rules or the latency change. */
export function useMockJev(
    rules: readonly MockJevRule[],
    latencyMs: number,
    errors?: MockJevOptions["errors"]
): MockJev {
    return React.useMemo(() => createMockJev({ seed: 1, latencyMs, rules, errors }), [rules, latencyMs, errors]);
}

// ---------------------------------------------------------------------------
// The buyer-persona Choice used by several stories
// ---------------------------------------------------------------------------

export const personaOptions: Readonly<Record<string, ChoiceOption>> = {
    champion: { description: "Drives the purchase internally and advocates for it", label: "Champion" },
    economic: { description: "Controls the budget and signs off on spend", label: "Economic buyer" },
    technical: { description: "Evaluates the product's technical fit", label: "Technical evaluator" },
    user: { description: "Uses the product day to day", label: "End user" },
    none: { description: "None of these fit", label: "None of the above", outcome: "none" },
};

export const personaInstructions = "Which buyer persona best describes this contact?";

/** Seeded persona answers, keyed by the contact's title. */
export const personaAnswers: Readonly<Record<string, JevChoiceAnswer>> = {
    "VP of Finance": choiceAnswer({ champion: 0.01, economic: 0.97, technical: 0.005, user: 0.005, none: 0.01 }, 0.93),
    "Operations Analyst": choiceAnswer(
        { champion: 0.06, economic: 0.01, technical: 0.03, user: 0.88, none: 0.02 },
        0.81
    ),
    "Director of IT": choiceAnswer({ champion: 0.2, economic: 0.1, technical: 0.64, user: 0.04, none: 0.02 }, 0.52),
    "Head of Procurement": choiceAnswer(
        { champion: 0.1, economic: 0.55, technical: 0.25, user: 0.05, none: 0.05 },
        0.41
    ),
    "Staff Engineer": choiceAnswer({ champion: 0.83, economic: 0.01, technical: 0.12, user: 0.03, none: 0.01 }, 0.74),
    "Chief Operating Officer": choiceAnswer(
        { champion: 0.02, economic: 0.96, technical: 0.01, user: 0, none: 0.01 },
        0.9
    ),
    "Marketing Coordinator": choiceAnswer(
        { champion: 0.03, economic: 0.01, technical: 0.02, user: 0.08, none: 0.86 },
        0.77
    ),
    "Product Manager": choiceAnswer({ champion: 0.41, economic: 0.02, technical: 0.2, user: 0.35, none: 0.02 }, 0.2),
};

/** The label each contact's seeded persona answer selects, for "expected" columns. */
export function expectedPersona(row: StoryRow): string {
    const answer = personaAnswers[String(row.title)];
    return answer === undefined ? "" : (personaOptions[answer.choice]?.label ?? answer.choice);
}

export const personaRules: readonly MockJevRule[] = [seededRule(/buyer persona/, "title", personaAnswers)];

export const personaColumns: readonly StoryColumn[] = [
    { id: "name", title: "Name", width: 130 },
    { id: "company", title: "Company", width: 190 },
    { id: "title", title: "Title", width: 180 },
    { id: "notes", title: "Notes", width: 330 },
    { id: "persona", title: "Persona", width: 220 },
];

export const personaRows = contactsWith(row => ({ persona: row.id === "c5" ? "Champion" : "" }));

export const personaColumn: ChoiceColumnDefinition = {
    primitive: "choice",
    instructions: personaInstructions,
    sources: ["title", "notes"],
    options: personaOptions,
    policy: { show: { minProbability: 0.5 }, ready: { minProbability: 0.8 } },
    presentation: { showProbability: true, alternatives: { count: 3 } },
};

// ---------------------------------------------------------------------------
// Connection: the mock by default, or a local dev proxy
// ---------------------------------------------------------------------------

/** The args every AI Fill story with a single mock takes. */
export interface EndpointArgs {
    /**
     * Empty (the default): answers come from the mock and nothing goes over the
     * network. Set it to a local dev proxy, for example
     * `http://localhost:8787/api/jev`, to send the story's fills to Jev.
     */
    readonly endpointUrl: string;
}

export const endpointArgTypes = {
    endpointUrl: {
        control: { type: "text" },
        description:
            "Leave empty to use the mock (no network calls). To call Jev, start `node scripts/jev-dev-proxy.mjs` " +
            "(with `--allow-origin <this Storybook's origin>` when it isn't localhost) and enter its URL, for " +
            "example http://localhost:8787/api/jev. The key stays in the proxy's environment; never enter one here.",
    },
};

/** A story's `aiFill`: the connection, `jev-latest`, the table's row ids and a `rowScope` over the displayed rows. */
export function storyConfig(
    connection: AIFillConnection,
    getRowId: (row: number) => string,
    columns: AIFillConfig["columns"],
    extra?: Omit<Partial<AIFillConfig>, "connection" | "rows" | "columns">
): AIFillConfig {
    return {
        connection,
        model: "jev-latest",
        rows: { getRowId },
        rowScope: () => ({ rows: "displayed", label: "contacts" }),
        columns,
        ...extra,
    };
}

/** The mock's connection, or endpoint mode when a URL is set. */
export function useStoryConnection(endpointUrl: string, jev: MockJev): AIFillConnection {
    const url = endpointUrl.trim();
    return React.useMemo(() => (url === "" ? jev.connection : { mode: "endpoint", url }), [url, jev]);
}

// ---------------------------------------------------------------------------
// Frame, grid and log
// ---------------------------------------------------------------------------

const FrameStyle = styled.div`
    box-sizing: border-box;
    min-height: 100vh;
    padding: 20px 28px 28px;
    background: #f6f7f9;
    color: #1f2933;
    font-family:
        Inter,
        Roboto,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

    *,
    *::before,
    *::after {
        box-sizing: inherit;
    }

    h1 {
        margin: 0 0 8px;
        font-size: 24px;
        font-weight: 600;
    }

    h2 {
        margin: 20px 0 6px;
        font-size: 16px;
        font-weight: 600;
    }

    p,
    li {
        max-width: 960px;
        margin: 0 0 8px;
        font-size: 14px;
        line-height: 1.5;
    }

    ul,
    ol {
        margin: 0 0 12px;
        padding-left: 22px;
    }

    code {
        padding: 1px 4px;
        border-radius: 3px;
        background: #e9ecf1;
        font-size: 13px;
    }

    .ai-story-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0;
    }

    .ai-story-toolbar button {
        padding: 5px 10px;
        border: 1px solid #c9ced6;
        border-radius: 5px;
        background: #fff;
        color: inherit;
        font: inherit;
        font-size: 13px;
        cursor: pointer;
    }

    .ai-story-toolbar button:disabled {
        opacity: 0.45;
        cursor: default;
    }

    .ai-story-grid {
        position: relative;
        overflow: hidden;
        border: 1px solid #dde1e7;
        border-radius: 6px;
        background: #fff;
    }

    .ai-story-menu-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
    }

    .ai-story-menu {
        position: fixed;
        min-width: 220px;
        padding: 4px 0;
        border: 1px solid #c9ced6;
        border-radius: 6px;
        background: #fff;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        font-size: 13px;
    }

    .ai-story-menu-heading {
        padding: 4px 12px 6px;
        color: #6b7280;
        font-size: 12px;
    }

    .ai-story-menu hr {
        margin: 4px 0;
        border: none;
        border-top: 1px solid #e5e7eb;
    }

    .ai-story-menu button {
        display: block;
        width: 100%;
        padding: 5px 12px;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .ai-story-menu button:hover:not(:disabled) {
        background: #eef2ff;
    }

    .ai-story-menu button:disabled {
        color: #9ca3af;
        cursor: default;
    }

    .ai-story-menu small {
        display: block;
        color: #6b7280;
        font-size: 11px;
    }

    .ai-story-log {
        max-width: 960px;
        margin-top: 12px;
        padding: 8px 12px;
        border: 1px solid #dde1e7;
        border-radius: 6px;
        background: #fff;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        line-height: 1.6;
        white-space: pre-wrap;
    }
`;

export const AIStoryFrame: React.FC<React.PropsWithChildren<{ title: string; description: React.ReactNode }>> = ({
    title,
    description,
    children,
}) => (
    <FrameStyle>
        <h1>{title}</h1>
        {description}
        {children}
    </FrameStyle>
);

/** The grid of a story. AI Fill is on only when `aiFill` is set. */
export const AIStoryGrid: React.FC<{
    readonly table: StoryTable;
    readonly aiFill?: AIFillConfig;
    readonly gridRef?: React.Ref<DataEditorRef>;
    readonly height?: number;
    readonly props?: Partial<DataEditorAllProps>;
}> = ({ table, aiFill, gridRef, height = 420, props }) => (
    <div className="ai-story-grid" style={{ height }}>
        <DataEditor
            ref={gridRef}
            aiFill={aiFill}
            columns={table.columns}
            rows={table.view.length}
            getCellContent={table.getCellContent}
            onCellEdited={table.onCellEdited}
            getCellsForSelection={true}
            rowMarkers="number"
            smoothScrollX={true}
            smoothScrollY={true}
            width="100%"
            height={height}
            {...props}
        />
    </div>
);

/** A small append-only log for what a story's callbacks saw. */
export function useStoryLog(): readonly [readonly string[], (line: string) => void] {
    const [lines, setLines] = React.useState<readonly string[]>([]);
    const push = React.useCallback((line: string) => setLines(previous => [...previous.slice(-11), line]), []);
    return [lines, push];
}

export const AIStoryLog: React.FC<{ readonly lines: readonly string[]; readonly empty: string }> = ({
    lines,
    empty,
}) => <div className="ai-story-log">{lines.length === 0 ? empty : lines.join("\n")}</div>;
