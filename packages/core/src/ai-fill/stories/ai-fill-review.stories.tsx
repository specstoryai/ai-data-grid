/* eslint-disable sonarjs/no-duplicate-string */
import * as React from "react";
import type { MockJevOptions } from "@specstory/ai-data-grid/testing";
import type { AIFillApi } from "../config/api.js";
import type { AIFillConfig, AIFillExecutionOptions, ChoiceColumnDefinition } from "../config/types.js";
import {
    AIStoryFrame,
    AIStoryGrid,
    AIStoryLog,
    choiceAnswer,
    contacts,
    contactsWith,
    endpointArgTypes,
    type EndpointArgs,
    expectedPersona,
    personaColumn,
    personaColumns,
    personaRules,
    seededRule,
    type StoryColumn,
    storyConfig,
    useMockJev,
    useStoryConnection,
    useStoryLog,
    useStoryTable,
} from "./story-kit.js";

export default {
    title: "AI-Data-Grid/AI Fill/2 Review, errors and rows",
};

const emptyPersonaRows = contactsWith(() => ({ persona: "" }));

// ---------------------------------------------------------------------------
// 7. Review queue and auto-apply
// ---------------------------------------------------------------------------

const applyColumn: ChoiceColumnDefinition = {
    ...personaColumn,
    policy: { show: { minProbability: 0.5 }, ready: { minProbability: 0.8 }, autoApply: { minProbability: 0.95 } },
};

export const ReviewQueueAndAutoApply: React.FC<EndpointArgs & { readonly fillAndApplyOnLoad: boolean }> = ({
    endpointUrl,
    fillAndApplyOnLoad,
}) => {
    const table = useStoryTable(emptyPersonaRows, personaColumns);
    const [lines, log] = useStoryLog();
    const jev = useMockJev(personaRules, 600);
    const connection = useStoryConnection(endpointUrl, jev);
    const aiFill = React.useMemo(
        () =>
            storyConfig(
                connection,
                table.getRowId,
                { persona: applyColumn },
                {
                    onReady: api => {
                        if (fillAndApplyOnLoad) api.fill("column-empty", { mode: "apply" });
                    },
                    onRunEnd: ({ cancelled, counts }) =>
                        log(`onRunEnd: ${cancelled ? "cancelled, " : ""}counts ${JSON.stringify(counts)}`),
                }
            ),
        [connection, table.getRowId, fillAndApplyOnLoad, log]
    );
    return (
        <AIStoryFrame
            title="7. Review queue and auto-apply"
            description={
                <>
                    <p>
                        The Persona policy has three gates: <code>show.minProbability: 0.5</code>,{" "}
                        <code>ready.minProbability: 0.8</code> and <code>autoApply.minProbability: 0.95</code>. Nothing
                        is ever written automatically except in a <b>Fill and apply</b> run, and then only results that
                        pass <code>autoApply</code>. With the <code>fillAndApplyOnLoad</code> control on (the default),
                        the story starts one when it loads; otherwise pick <b>Fill and apply…</b> from the Persona ▾
                        menu, which always asks first.
                    </p>
                    <ul>
                        <li>
                            Avery Chen (0.97) and Finley Brooks (0.96) are <b>applied</b>: written through the
                            app&apos;s <code>onCellEdited</code>, with no marker.
                        </li>
                        <li>
                            Blake Okafor (0.88), Emery Novak (0.83) and Harper Singh (&quot;None of the above&quot;,
                            0.86, nothing to write) are <b>suggested</b> and wait for a decision.
                        </li>
                        <li>
                            Casey Romero (0.64) and Devon Patel (0.55) are in <b>review</b>: never auto-applied and
                            never included in &quot;Accept all eligible&quot;.
                        </li>
                        <li>Jordan Lee (0.41) is withheld.</li>
                    </ul>
                    <p>
                        When the run ends, the status bar starts its summary with the applied count: &quot;Done: 2
                        applied · 3 suggested · 2 review · 1 withheld · …&quot;. The log below the grid shows the same
                        counts from <code>onRunEnd</code>. A result that passed <code>autoApply</code> but that a commit
                        guard kept from being written would count as suggested.
                    </p>
                    <p>
                        Work through the queue with <b>Review next</b> in the status bar: it opens the inspector on each
                        result waiting for a decision (review and suggested), in display order. Accept with Enter or the
                        Accept button, or Reject, and move on.
                    </p>
                </>
            }
        >
            <AIStoryGrid table={table} aiFill={aiFill} />
            <AIStoryLog lines={lines} empty="onRunEnd: the run hasn't ended yet" />
        </AIStoryFrame>
    );
};
Object.assign(ReviewQueueAndAutoApply, {
    storyName: "07 Review queue and auto-apply",
    args: { endpointUrl: "", fillAndApplyOnLoad: true },
    argTypes: {
        ...endpointArgTypes,
        fillAndApplyOnLoad: {
            control: { type: "boolean" },
            description: "Start a Fill and apply run over the empty Persona cells when the story loads.",
        },
    },
});

// ---------------------------------------------------------------------------
// 8. Errors: auth, rate limit, timeout, malformed and type mismatch
// ---------------------------------------------------------------------------

const errorColumns: readonly StoryColumn[] = [
    { id: "name", title: "Name", width: 130 },
    { id: "company", title: "Company", width: 190 },
    { id: "title", title: "Title", width: 180 },
    { id: "notes", title: "Notes", width: 300 },
    { id: "persona", title: "Persona", width: 220 },
];
const errorRows = contacts.slice(0, 3).map(row => ({ ...row, persona: "" }));

const sizeColumns: readonly StoryColumn[] = [
    { id: "name", title: "Name", width: 130 },
    { id: "company", title: "Company", width: 190 },
    { id: "employees", title: "Employees (number column)", width: 260, kind: "number" },
];
const sizeRows = contacts.slice(0, 3).map(row => ({ ...row, employees: undefined }));
const sizeRules = [
    seededRule(/employees/, "company", {
        "Bluefin Supply": choiceAnswer({ small: 0.9, mid: 0.08, large: 0.02 }, 0.85),
        "Example Manufacturing Co": choiceAnswer({ small: 0.02, mid: 0.08, large: 0.9 }, 0.85),
        "Harbor Health": choiceAnswer({ small: 0.1, mid: 0.85, large: 0.05 }, 0.8),
    }),
];
const sizeColumn: ChoiceColumnDefinition = {
    primitive: "choice",
    instructions: "About how many employees does this company have?",
    sources: ["company"],
    // A misconfiguration on purpose: "large" stores text in a number column.
    options: {
        small: { description: "Fewer than 100", label: "Small", value: 50 },
        mid: { description: "100 to 1,000", label: "Mid-size", value: 500 },
        large: { description: "More than 1,000", label: "Large", value: "10k+" },
    },
};

interface ErrorCase {
    readonly title: string;
    readonly what: React.ReactNode;
    readonly errors?: MockJevOptions["errors"];
    readonly execution?: AIFillExecutionOptions;
    readonly typeMismatch?: boolean;
}

const errorCases: readonly ErrorCase[] = [
    {
        title: "Authentication (HTTP 401)",
        what: (
            <>
                Every call gets a 401. The first one aborts the whole run: every cell shows the red error marker,{" "}
                <code>onError</code> gets one <code>authentication</code> error, and no further request is made. It
                isn&apos;t retried automatically; a retry fails again until the key is fixed.
            </>
        ),
        errors: [{ kind: "authentication" }],
    },
    {
        title: "Rate limit (HTTP 429)",
        what: (
            <>
                The first six calls get a 429 with <code>retry-after-ms: 400</code>. Each request is retried once (
                <code>maxRetries: 1</code> here) after the server&apos;s delay, then its cells fail with a retryable{" "}
                <code>rate-limit</code> error. <b>Retry 3 failed</b> in the status bar then succeeds.
            </>
        ),
        errors: [{ kind: "rate-limit", retryAfterMs: 400, times: 6 }],
        execution: { maxRetries: 1 },
    },
    {
        title: "Timeout",
        what: (
            <>
                The first three calls never answer. After <code>timeoutMs: 1500</code> (and no retries here) the cells
                fail with a retryable <code>timeout</code> error. <b>Retry 3 failed</b> then succeeds.
            </>
        ),
        errors: [{ kind: "timeout", times: 3 }],
        execution: { timeoutMs: 1500, maxRetries: 0 },
    },
    {
        title: "Malformed answer",
        what: (
            <>
                Every answer has the wrong type. <code>parseJevAnswer</code> rejects it, so the cells fail with a{" "}
                <code>malformed</code> error, which isn&apos;t retryable, and the policy never runs.
            </>
        ),
        errors: [{ kind: "malformed" }],
    },
    {
        title: "Type mismatch",
        what: (
            <>
                The answers are fine, but the column is misconfigured: its &quot;Large&quot; option stores the text
                &quot;10k+&quot; in a number column. Example Manufacturing Co&apos;s answer is &quot;Large&quot;, so its
                cell fails with <code>type-mismatch</code> when the answer is mapped; the other two cells are suggested
                (50 and 500).
            </>
        ),
        typeMismatch: true,
    },
];

const ErrorCaseGrid: React.FC<{ readonly errorCase: ErrorCase }> = ({ errorCase }) => {
    const { errors, execution, typeMismatch = false } = errorCase;
    const table = useStoryTable(typeMismatch ? sizeRows : errorRows, typeMismatch ? sizeColumns : errorColumns);
    const [lines, log] = useStoryLog();
    const jev = useMockJev(typeMismatch ? sizeRules : personaRules, 300, errors);
    const aiFill = React.useMemo<AIFillConfig>(
        () =>
            storyConfig(
                jev.connection,
                table.getRowId,
                typeMismatch ? { employees: sizeColumn } : { persona: personaColumn },
                {
                    execution: { backoff: { initialMs: 200, maxMs: 400 }, ...execution },
                    onReady: api => api.fill("column-empty"),
                    onError: error => log(`onError: ${error.kind}: ${error.message}`),
                }
            ),
        [jev, table.getRowId, typeMismatch, execution, log]
    );
    return (
        <>
            <h2>{errorCase.title}</h2>
            <p>{errorCase.what}</p>
            <AIStoryGrid table={table} aiFill={aiFill} height={220} />
            <AIStoryLog lines={lines} empty="onError: nothing yet" />
        </>
    );
};

export const Errors: React.FC = () => (
    <AIStoryFrame
        title="8. Errors: auth, rate limit, timeout, malformed and type mismatch"
        description={
            <p>
                Each grid has its own mock with an injected failure, and fills its empty cells when it loads. Errors
                never write to the grid. A failed cell shows a red corner marker; click it (or right-click the cell and
                pick Inspect…) to see the error. The log under each grid shows what the app&apos;s <code>onError</code>{" "}
                received. These grids always use the mock, because the failures are injected by it.
            </p>
        }
    >
        {errorCases.map(errorCase => (
            <ErrorCaseGrid key={errorCase.title} errorCase={errorCase} />
        ))}
    </AIStoryFrame>
);
Object.assign(Errors, { storyName: "08 Errors: auth, rate limit, timeout, malformed, type mismatch" });

// ---------------------------------------------------------------------------
// 9. Stale: editing a source while pending
// ---------------------------------------------------------------------------

const staleRules = [
    seededRule(/buyer persona/, "title", {
        "Office Manager": choiceAnswer({ champion: 0.03, economic: 0.02, technical: 0.02, user: 0.9, none: 0.03 }, 0.8),
    }),
    ...personaRules,
];

const StaleDemo: React.FC<{ readonly endpointUrl: string; readonly scripted: boolean }> = ({
    endpointUrl,
    scripted,
}) => {
    const table = useStoryTable(emptyPersonaRows, personaColumns);
    const jev = useMockJev(staleRules, 4000);
    const connection = useStoryConnection(endpointUrl, jev);
    const [api, setApi] = React.useState<AIFillApi>();
    const [edited, setEdited] = React.useState(false);
    const aiFill = React.useMemo(
        () =>
            storyConfig(
                connection,
                table.getRowId,
                { persona: personaColumn },
                { execution: { concurrency: 8 }, onReady: setApi }
            ),
        [connection, table.getRowId]
    );

    const { setValue } = table;
    React.useEffect(() => {
        if (api === undefined) return;
        api.fill("column-empty");
        if (!scripted) return;
        const timer = setTimeout(() => {
            setValue("c1", "title", "Office Manager");
            setEdited(true);
        }, 1000);
        return () => clearTimeout(timer);
    }, [api, scripted, setValue]);

    // Runs after the render that shows the new title, so AI Fill reads the changed row.
    React.useEffect(() => {
        if (edited) api?.notifyRowsChanged(["c1"]);
    }, [edited, api]);

    return <AIStoryGrid table={table} aiFill={aiFill} />;
};

export const StaleWhilePending: React.FC<EndpointArgs & { readonly scripted: boolean }> = ({
    endpointUrl,
    scripted,
}) => {
    const [run, setRun] = React.useState(0);
    return (
        <AIStoryFrame
            title="9. Stale: editing a source while pending"
            description={
                <>
                    <p>
                        Persona is asked about each contact&apos;s title and notes (its <code>sources</code>), and the
                        mock takes 4 seconds to answer (all eight requests are in flight at once). The story fills the
                        empty cells when it loads. With the <code>scripted</code> control on (the default), one second
                        later it changes Avery Chen&apos;s title to &quot;Office Manager&quot; outside the grid and
                        calls <code>api.notifyRowsChanged([&quot;c1&quot;])</code>.
                    </p>
                    <ul>
                        <li>
                            When the answers arrive, Avery Chen&apos;s Persona is <b>stale</b>, with a ↻ marker. Its
                            answer is never shown as a suggestion and can&apos;t be accepted. The other rows are decided
                            as usual.
                        </li>
                        <li>
                            Marking a result stale never sends a request by itself. Pick <b>Re-run 1 stale</b> from the
                            Persona ▾ menu: the new title is sent, and the answer is &quot;End user&quot;.
                        </li>
                        <li>
                            Edit a source after its suggestion has arrived: double-click Blake Okafor&apos;s Title and
                            change it. The suggestion turns into grey, struck-through ghost text with ↻. An edit made in
                            the grid goes through <code>onCellEdited</code>, which AI Fill watches, so the app calls
                            nothing.
                        </li>
                        <li>
                            To edit while pending by hand, turn <code>scripted</code> off, press <b>Start over</b>, and
                            change a Title or Notes cell while its ⋯ is showing.
                        </li>
                    </ul>
                    <div className="ai-story-toolbar">
                        <button onClick={() => setRun(value => value + 1)}>Start over</button>
                    </div>
                </>
            }
        >
            <StaleDemo key={run} endpointUrl={endpointUrl} scripted={scripted} />
        </AIStoryFrame>
    );
};
Object.assign(StaleWhilePending, {
    storyName: "09 Stale: editing a source while pending",
    args: { endpointUrl: "", scripted: true },
    argTypes: {
        ...endpointArgTypes,
        scripted: {
            control: { type: "boolean" },
            description: "Change Avery Chen's title outside the grid one second after the fill starts.",
        },
    },
});

// ---------------------------------------------------------------------------
// 10. Sorting and filtering while pending
// ---------------------------------------------------------------------------

const movingColumns: readonly StoryColumn[] = [
    { id: "name", title: "Name", width: 130 },
    { id: "title", title: "Title", width: 190 },
    { id: "notes", title: "Notes", width: 300 },
    { id: "expected", title: "Seeded answer (expected)", width: 220, readonly: true },
    { id: "persona", title: "Persona", width: 240 },
];
const movingRows = contactsWith(row => ({ expected: expectedPersona(row), persona: "" }));

const MovingDemo: React.FC<{ readonly endpointUrl: string; readonly scripted: boolean }> = ({
    endpointUrl,
    scripted,
}) => {
    const table = useStoryTable(movingRows, movingColumns);
    const jev = useMockJev(personaRules, 3000);
    const connection = useStoryConnection(endpointUrl, jev);
    const [lines, log] = useStoryLog();
    const [api, setApi] = React.useState<AIFillApi>();
    const aiFill = React.useMemo(
        () =>
            storyConfig(
                connection,
                table.getRowId,
                { persona: personaColumn },
                {
                    execution: { concurrency: 8 },
                    onReady: setApi,
                    onResult: event => {
                        if (event.reason === "row-missing") {
                            log(`onResult: ${event.rowId} ${event.columnId}: ${event.status} (row-missing)`);
                        }
                    },
                    onRunEnd: summary =>
                        log(`onRunEnd: ${JSON.stringify(summary.counts)}${summary.cancelled ? " (cancelled)" : ""}`),
                }
            ),
        [connection, table.getRowId, log]
    );

    const { setSort, toggleHidden } = table;
    React.useEffect(() => {
        if (api === undefined) return;
        api.fill("column-empty");
        if (!scripted) return;
        const timer = setTimeout(() => {
            setSort({ columnId: "name", direction: "desc" });
            toggleHidden("c3");
        }, 800);
        return () => clearTimeout(timer);
    }, [api, scripted, setSort, toggleHidden]);

    const casey = table.hidden.has("c3");
    return (
        <>
            <div className="ai-story-toolbar">
                <button onClick={() => setSort({ columnId: "name", direction: "asc" })}>Sort by name A → Z</button>
                <button onClick={() => setSort({ columnId: "name", direction: "desc" })}>Sort by name Z → A</button>
                <button onClick={() => setSort(undefined)}>Original order</button>
                <button onClick={() => toggleHidden("c3")}>{casey ? "Show" : "Hide"} Casey Romero</button>
                <button onClick={() => api?.fill("column-empty")} disabled={api === undefined}>
                    Fill empty Persona cells
                </button>
            </div>
            <AIStoryGrid table={table} aiFill={aiFill} />
            <AIStoryLog lines={lines} empty="onResult (row-missing) and onRunEnd: nothing yet" />
        </>
    );
};

export const SortingAndFilteringWhilePending: React.FC<EndpointArgs & { readonly scripted: boolean }> = ({
    endpointUrl,
    scripted,
}) => {
    const [run, setRun] = React.useState(0);
    return (
        <AIStoryFrame
            title="10. Sorting and filtering while pending"
            description={
                <>
                    <p>
                        Results are keyed by row id (<code>rows.getRowId</code>) and column id, never by display
                        position. The mock takes 3 seconds to answer. The story fills the empty cells when it loads;
                        with the <code>scripted</code> control on (the default), 0.8 seconds later it sorts by name Z →
                        A and filters Casey Romero out, while every request is still pending.
                    </p>
                    <ul>
                        <li>
                            <b>Sorting while pending</b> lands every answer on the right row: each Persona suggestion
                            matches the &quot;Seeded answer&quot; column of its own row, whatever the order (Jordan
                            Lee&apos;s answer, 0.41, is withheld, so it shows only ○). Sort again, or go back to the
                            original order: the suggestions move with their rows.
                        </li>
                        <li>
                            <b>Filtering while pending</b> loses that row&apos;s answer. AI Fill can&apos;t tell a
                            filtered-out row from a deleted one, so Casey Romero&apos;s answer is dropped as{" "}
                            <code>row-missing</code> (see the log), and nothing is written. Show the row again: its
                            Persona cell has no result. Fill it again once it&apos;s displayed. This is a known
                            limitation.
                        </li>
                    </ul>
                    <div className="ai-story-toolbar">
                        <button onClick={() => setRun(value => value + 1)}>Start over</button>
                    </div>
                </>
            }
        >
            <MovingDemo key={run} endpointUrl={endpointUrl} scripted={scripted} />
        </AIStoryFrame>
    );
};
Object.assign(SortingAndFilteringWhilePending, {
    storyName: "10 Sorting and filtering while pending",
    args: { endpointUrl: "", scripted: true },
    argTypes: {
        ...endpointArgTypes,
        scripted: {
            control: { type: "boolean" },
            description: "Sort by name Z → A and hide Casey Romero 0.8 seconds after the fill starts.",
        },
    },
});
