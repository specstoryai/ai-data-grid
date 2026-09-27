/* eslint-disable sonarjs/no-duplicate-string */
import * as React from "react";
import type {
    AIFillConfig,
    ChoiceColumnDefinition,
    NoulColumnDefinition,
    ScoreColumnDefinition,
} from "../config/types.js";
import {
    AIStoryFrame,
    AIStoryGrid,
    choiceAnswer,
    contactsWith,
    endpointArgTypes,
    type EndpointArgs,
    noulAnswer,
    personaColumn,
    personaColumns,
    personaRows,
    personaRules,
    scoreAnswer,
    seededRule,
    type StoryColumn,
    type StoryRow,
    storyConfig,
    useMockJev,
    useStoryConnection,
    useStoryTable,
} from "./story-kit.js";

export default {
    title: "AI-Data-Grid/AI Fill/1 Primitives and thresholds",
};

const endpointStory = { args: { endpointUrl: "" }, argTypes: endpointArgTypes };

// ---------------------------------------------------------------------------
// 1. Buyer-persona Choice (the full workflow)
// ---------------------------------------------------------------------------

export const BuyerPersonaChoice: React.FC<EndpointArgs> = ({ endpointUrl }) => {
    const table = useStoryTable(personaRows, personaColumns);
    const jev = useMockJev(personaRules, 600);
    const connection = useStoryConnection(endpointUrl, jev);
    const aiFill = React.useMemo(
        () => storyConfig(connection, table.getRowId, { persona: personaColumn }),
        [connection, table.getRowId]
    );
    return (
        <AIStoryFrame
            title="1. Buyer-persona Choice: the full workflow"
            description={
                <>
                    <p>
                        The app passes one <code>aiFill</code> prop. It builds no AI menus, request loops, review
                        controls or renderers: everything below is AI Fill&apos;s built-in UI. Persona is a Choice over
                        five options, asked about each contact&apos;s title and notes. The policy shows answers with a
                        probability of at least 0.5 and sends those under 0.8 to review. Answers come from the mock
                        after 600 ms.
                    </p>
                    <ol>
                        <li>
                            Open the ▾ on the Persona header and pick <b>Fill empty cells in Persona</b>. Emery
                            Novak&apos;s cell already has a value, so it is skipped.
                        </li>
                        <li>
                            Suggestions appear as ghost text. Avery Chen, Blake Okafor and Finley Brooks are{" "}
                            <b>suggested</b>; Casey Romero (0.64) and Devon Patel (0.55) are in <b>review</b> (amber
                            corner); Jordan Lee (0.41) is <b>withheld</b> (hollow ○); Harper Singh gets &quot;None of
                            the above&quot;, a semantic outcome that has nothing to write.
                        </li>
                        <li>
                            Click <b>Review next</b> in the status bar, or a cell&apos;s marker, to open the inspector:
                            the ranked options with their probabilities, the decision and its reason, and the model id.
                            Accept, Reject, Choose another option, or Edit manually from there.
                        </li>
                        <li>
                            Accept the rest with <b>Accept N eligible</b> in the header menu or the status bar. Only
                            suggested results are included, never review ones.
                        </li>
                        <li>
                            Keyboard: select a Persona cell, then Shift+F10 opens the cell menu, Alt+ArrowDown the
                            inspector, Mod+Enter accepts and Mod+Backspace rejects.
                        </li>
                    </ol>
                </>
            }
        >
            <AIStoryGrid table={table} aiFill={aiFill} />
        </AIStoryFrame>
    );
};
Object.assign(BuyerPersonaChoice, { storyName: "01 Buyer-persona Choice (full workflow)", ...endpointStory });

// ---------------------------------------------------------------------------
// 2. Score seniority with level mapping
// ---------------------------------------------------------------------------

const seniorityLevels = ["Individual contributor", "Manager", "Director", "Vice president or C-level"];

const seniorityAnswers = {
    "VP of Finance": scoreAnswer(seniorityLevels, [0, 0.02, 0.08, 0.9], 0.88),
    "Operations Analyst": scoreAnswer(seniorityLevels, [0.85, 0.12, 0.03, 0], 0.86),
    "Director of IT": scoreAnswer(seniorityLevels, [0, 0.1, 0.8, 0.1], 0.79),
    "Head of Procurement": scoreAnswer(seniorityLevels, [0.02, 0.38, 0.45, 0.15], 0.62),
    "Staff Engineer": scoreAnswer(seniorityLevels, [0.45, 0.05, 0.05, 0.45], 0.12),
    "Chief Operating Officer": scoreAnswer(seniorityLevels, [0, 0, 0.05, 0.95], 0.95),
    "Marketing Coordinator": scoreAnswer(seniorityLevels, [0.9, 0.1, 0, 0], 0.9),
    "Product Manager": scoreAnswer(seniorityLevels, [0.2, 0.6, 0.2, 0], 0.55),
};

const seniorityRules = [seededRule(/How senior/, "title", seniorityAnswers)];

const seniorityColumns: readonly StoryColumn[] = [
    { id: "name", title: "Name", width: 130 },
    { id: "title", title: "Title", width: 190 },
    { id: "seniority", title: "Seniority (nearest level)", width: 250 },
    { id: "likeliest", title: "Most probable level", width: 230 },
    { id: "score", title: "Score", width: 200, kind: "number" },
];

const seniorityRows = contactsWith(() => ({ seniority: "", likeliest: "", score: undefined }));

const seniorityBase = {
    primitive: "score",
    instructions: "How senior is this contact?",
    sources: ["title"],
    levels: seniorityLevels,
    policy: { ready: { minConfidence: 0.6 } },
    presentation: { showConfidence: true, rubricBar: true },
} as const;

const seniorityDefinitions: AIFillConfig["columns"] = {
    seniority: { ...seniorityBase, output: { store: "level-label" } } satisfies ScoreColumnDefinition,
    likeliest: {
        ...seniorityBase,
        output: { store: "level-label", levelFrom: "most-probable" },
    } satisfies ScoreColumnDefinition,
    score: { ...seniorityBase, output: { store: "score", precision: 2 } } satisfies ScoreColumnDefinition,
};

export const ScoreSeniority: React.FC<EndpointArgs> = ({ endpointUrl }) => {
    const table = useStoryTable(seniorityRows, seniorityColumns);
    const jev = useMockJev(seniorityRules, 400);
    const connection = useStoryConnection(endpointUrl, jev);
    const aiFill = React.useMemo(
        () =>
            storyConfig(connection, table.getRowId, seniorityDefinitions, {
                onReady: api => api.fill("column-empty"),
            }),
        [connection, table.getRowId]
    );
    return (
        <AIStoryFrame
            title="2. Score: seniority with level mapping"
            description={
                <>
                    <p>
                        One Score question with a four-level rubric (Individual contributor, Manager, Director, Vice
                        president or C-level), mapped three ways. The three columns ask the same question about the same
                        state, so each row is one request with three questions. The story fills the empty cells when it
                        loads.
                    </p>
                    <ul>
                        <li>
                            <b>Seniority (nearest level)</b> stores the level label nearest the score (
                            <code>store: &quot;level-label&quot;</code>, <code>levelFrom: &quot;nearest&quot;</code>,
                            half up).
                        </li>
                        <li>
                            <b>Most probable level</b> stores the level with the highest probability (
                            <code>levelFrom: &quot;most-probable&quot;</code>, ties to the lower level).
                        </li>
                        <li>
                            <b>Score</b> stores the score itself (<code>store: &quot;score&quot;</code>), a
                            probability-weighted position on the rubric from 0 to 3. It is not a percentage.
                        </li>
                    </ul>
                    <p>
                        Emery Novak (Staff Engineer) shows why the mapping matters: the probability is split between the
                        lowest and the highest level (0.45 each), so the score is 1.5, which is nearest to Director,
                        while the most probable level is Individual contributor. Its confidence (0.12) is below{" "}
                        <code>ready.minConfidence: 0.6</code>, so all three cells are in review. Jordan Lee (0.55) is in
                        review too. Open the inspector (click a marker) to see the rubric with each level&apos;s
                        probability, the confidence and the model id.
                    </p>
                </>
            }
        >
            <AIStoryGrid table={table} aiFill={aiFill} />
        </AIStoryFrame>
    );
};
Object.assign(ScoreSeniority, { storyName: "02 Score seniority with level mapping", ...endpointStory });

// ---------------------------------------------------------------------------
// 3. Noul bands
// ---------------------------------------------------------------------------

const budgetAnswers = {
    "VP of Finance": noulAnswer(0.97),
    "Operations Analyst": noulAnswer(0.02),
    "Director of IT": noulAnswer(0.5),
    "Head of Procurement": noulAnswer(0.2),
    "Staff Engineer": noulAnswer(0.200_000_1),
    "Chief Operating Officer": noulAnswer(0.8),
    "Marketing Coordinator": noulAnswer(0.799_999_9),
    "Product Manager": noulAnswer(0.35),
};

const budgetRules = [seededRule(/own a budget/, "title", budgetAnswers)];

const budgetColumns: readonly StoryColumn[] = [
    { id: "name", title: "Name", width: 130 },
    { id: "title", title: "Title", width: 190 },
    { id: "notes", title: "Notes", width: 300 },
    { id: "ownsBudget", title: "Owns a budget", width: 170, kind: "boolean" },
    { id: "budgetLabel", title: "Answer", width: 170 },
    { id: "budgetProbability", title: "P(yes)", width: 170, kind: "number" },
];

const budgetRows = contactsWith(() => ({ ownsBudget: undefined, budgetLabel: "", budgetProbability: undefined }));

const budgetBase = {
    primitive: "noul",
    instructions: "Does this contact own a budget?",
    criteria: { true: "Signs off on spend", false: "No spending authority" },
    sources: ["title", "notes"],
    presentation: { probabilityBar: true },
} as const;

const bands = { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" } as const;

const budgetDefinitions: AIFillConfig["columns"] = {
    ownsBudget: { ...budgetBase, output: { store: "boolean", bands } } satisfies NoulColumnDefinition,
    budgetLabel: { ...budgetBase, output: { store: "label", bands } } satisfies NoulColumnDefinition,
    budgetProbability: {
        ...budgetBase,
        output: { store: "probability", precision: 7 },
    } satisfies NoulColumnDefinition,
};

export const NoulBands: React.FC<EndpointArgs> = ({ endpointUrl }) => {
    const table = useStoryTable(budgetRows, budgetColumns);
    const jev = useMockJev(budgetRules, 400);
    const connection = useStoryConnection(endpointUrl, jev);
    const aiFill = React.useMemo(
        () =>
            storyConfig(connection, table.getRowId, budgetDefinitions, {
                onReady: api => api.fill("column-empty"),
            }),
        [connection, table.getRowId]
    );
    return (
        <AIStoryFrame
            title="3. Noul bands (≤ 0.20 false, ≥ 0.80 true, review between)"
            description={
                <>
                    <p>
                        A Noul answers a yes/no question with one number: the probability that the answer is yes. There
                        is no confidence. <b>Owns a budget</b> stores a boolean and <b>Answer</b> stores Yes / No, both
                        with the bands <code>{'{ falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" }'}</code>.{" "}
                        <b>P(yes)</b> stores the probability itself, so you can compare. The story fills the empty cells
                        when it loads.
                    </p>
                    <ul>
                        <li>
                            0.02 (Blake Okafor) is a usable <b>No</b>: a strong no, not a failure.
                        </li>
                        <li>0.20 (Devon Patel) is No: the band includes its boundary.</li>
                        <li>
                            0.2000001 (Emery Novak), 0.35, 0.5 and 0.7999999 (Harper Singh) are in the middle band: they
                            go to review and read <b>&quot;Uncertain&quot;</b>, never &quot;No&quot;, and accepting one
                            writes nothing.
                        </li>
                        <li>0.80 (Finley Brooks) and 0.97 (Avery Chen) are Yes.</li>
                    </ul>
                </>
            }
        >
            <AIStoryGrid table={table} aiFill={aiFill} />
        </AIStoryFrame>
    );
};
Object.assign(NoulBands, { storyName: "03 Noul bands", ...endpointStory });

// ---------------------------------------------------------------------------
// Accounts, for the threshold stories
// ---------------------------------------------------------------------------

const industryOptions = {
    software: { description: "Builds or sells software", label: "Software" },
    retail: { description: "Sells goods to consumers", label: "Retail" },
    other: { description: "Any other industry", label: "Other" },
};

const industryInstructions = "Which industry is this company in?";

/** An industry answer with `software` at the given probability. */
function industry(software: number, confidence: number) {
    return choiceAnswer({ software, retail: 1 - software - 0.01, other: 0.01 }, confidence);
}

const accountColumnsBase: readonly StoryColumn[] = [
    { id: "company", title: "Company", width: 180 },
    { id: "seeded", title: "Mock answer (seeded)", width: 300, readonly: true },
];

function accounts(seeded: readonly string[]): StoryRow[] {
    const companies = ["Bluefin Supply", "Harbor Health", "Kestrel Retail", "Tallgrass Labs", "Ridgeway Logistics"];
    return seeded.map((text, i) => ({ id: `a${i + 1}`, company: companies[i], seeded: text }));
}

// ---------------------------------------------------------------------------
// 4. Threshold boundary, 0.79 vs 0.80
// ---------------------------------------------------------------------------

const boundaryProbabilities = [0.79, 0.8, 0.799_999_9, 0.800_000_1, 0.5];
const boundaryRows: StoryRow[] = accounts(boundaryProbabilities.map(p => `Software, probability ${p}`)).map(row => ({
    ...row,
    industry: "",
}));
const boundaryRules = [
    seededRule(
        /industry/,
        "company",
        Object.fromEntries(boundaryRows.map((row, i) => [String(row.company), industry(boundaryProbabilities[i], 0.9)]))
    ),
];
const boundaryColumns: readonly StoryColumn[] = [
    ...accountColumnsBase,
    { id: "industry", title: "Industry", width: 260 },
];
const boundaryDefinitions: AIFillConfig["columns"] = {
    industry: {
        primitive: "choice",
        instructions: industryInstructions,
        sources: ["company"],
        options: industryOptions,
        policy: { show: { minProbability: 0.8 } },
        presentation: { showProbability: true },
    },
};

export const ThresholdBoundary: React.FC<EndpointArgs> = ({ endpointUrl }) => {
    const table = useStoryTable(boundaryRows, boundaryColumns);
    const jev = useMockJev(boundaryRules, 300);
    const connection = useStoryConnection(endpointUrl, jev);
    const aiFill = React.useMemo(
        () =>
            storyConfig(connection, table.getRowId, boundaryDefinitions, {
                onReady: api => api.fill("column-empty"),
            }),
        [connection, table.getRowId]
    );
    return (
        <AIStoryFrame
            title="4. Threshold boundary: 0.79 vs 0.80"
            description={
                <>
                    <p>
                        Industry is a Choice with <code>show: {"{ minProbability: 0.8 }"}</code>. Comparisons are exact:
                        a minimum passes when the value is at least the threshold, on the raw number from the response,
                        with no rounding and no epsilon. The story fills the empty cells when it loads.
                    </p>
                    <ul>
                        <li>
                            0.79 and 0.7999999 are <b>withheld</b>: nothing is shown or written, only a hollow ○.
                        </li>
                        <li>
                            0.80 and 0.8000001 are <b>shown</b> as suggestions.
                        </li>
                        <li>0.5 is withheld.</li>
                    </ul>
                    <p>
                        Click a withheld cell&apos;s marker: the inspector gives the exact reason, for example
                        &quot;withheld: probability 0.79 &lt; show.minProbability 0.8&quot;.
                    </p>
                </>
            }
        >
            <AIStoryGrid table={table} aiFill={aiFill} height={300} />
        </AIStoryFrame>
    );
};
Object.assign(ThresholdBoundary, { storyName: "04 Threshold boundary, 0.79 vs 0.80", ...endpointStory });

// ---------------------------------------------------------------------------
// 5. Probability ≠ confidence
// ---------------------------------------------------------------------------

const splitSeeds: readonly (readonly [number, number])[] = [
    [0.79, 0.95],
    [0.85, 0.3],
    [0.92, 0.9],
    [0.6, 0.4],
];
const splitRows: StoryRow[] = accounts(splitSeeds.map(([p, c]) => `Software, probability ${p}, confidence ${c}`)).map(
    row => ({
        ...row,
        byProbability: "",
        byConfidence: "",
    })
);
const splitRules = [
    seededRule(
        /industry/,
        "company",
        Object.fromEntries(splitRows.map((row, i) => [String(row.company), industry(...splitSeeds[i])]))
    ),
];
const splitColumns: readonly StoryColumn[] = [
    ...accountColumnsBase,
    { id: "byProbability", title: "Gated by probability", width: 250 },
    { id: "byConfidence", title: "Gated by confidence", width: 250 },
];
const splitBase: Omit<ChoiceColumnDefinition, "policy"> = {
    primitive: "choice",
    instructions: industryInstructions,
    sources: ["company"],
    options: industryOptions,
    presentation: { showProbability: true, showConfidence: true },
};
const splitDefinitions: AIFillConfig["columns"] = {
    byProbability: { ...splitBase, policy: { show: { minProbability: 0.8 } } },
    byConfidence: { ...splitBase, policy: { show: { minConfidence: 0.8 } } },
};

export const ProbabilityIsNotConfidence: React.FC<EndpointArgs> = ({ endpointUrl }) => {
    const table = useStoryTable(splitRows, splitColumns);
    const jev = useMockJev(splitRules, 300);
    const connection = useStoryConnection(endpointUrl, jev);
    const aiFill = React.useMemo(
        () =>
            storyConfig(connection, table.getRowId, splitDefinitions, {
                onReady: api => api.fill("column-empty"),
            }),
        [connection, table.getRowId]
    );
    return (
        <AIStoryFrame
            title="5. Probability ≠ confidence"
            description={
                <>
                    <p>
                        A Choice answer has two different numbers: the <b>probability</b> of the selected option and the
                        model&apos;s <b>confidence</b>. A gate reads only the measure it names, and one is never used in
                        place of the other. Both columns ask the same question; the first is gated by{" "}
                        <code>show.minProbability: 0.8</code>, the second by <code>show.minConfidence: 0.8</code>. The
                        story fills the empty cells when it loads.
                    </p>
                    <ul>
                        <li>
                            Bluefin Supply (probability 0.79, confidence 0.95): withheld by probability, shown by
                            confidence.
                        </li>
                        <li>
                            Harbor Health (probability 0.85, confidence 0.30): shown by probability, withheld by
                            confidence.
                        </li>
                        <li>Kestrel Retail is shown in both, and Tallgrass Labs is withheld in both.</li>
                    </ul>
                    <p>Neither number is measured accuracy. Pick thresholds by evaluating them on your own data.</p>
                </>
            }
        >
            <AIStoryGrid table={table} aiFill={aiFill} height={270} />
        </AIStoryFrame>
    );
};
Object.assign(ProbabilityIsNotConfidence, { storyName: "05 Probability ≠ confidence", ...endpointStory });

// ---------------------------------------------------------------------------
// 6. High Score with low confidence
// ---------------------------------------------------------------------------

const expansionLevels = ["Very unlikely", "Unlikely", "Possible", "Likely", "Very likely"];
const expansionSeeds: readonly (readonly [readonly number[], number])[] = [
    [[0, 0, 0.02, 0.1, 0.88], 0.9],
    [[0.05, 0.05, 0.1, 0.2, 0.6], 0.55],
    [[0.12, 0.03, 0.05, 0.2, 0.6], 0.22],
    [[0.9, 0.08, 0.02, 0, 0], 0.92],
];
const expansionRows: StoryRow[] = accounts(
    expansionSeeds.map(([probabilities, confidence]) => {
        const { score } = scoreAnswer(expansionLevels, probabilities, confidence);
        return `score ${score}, confidence ${confidence}`;
    })
).map(row => ({ ...row, expansionScore: undefined, expansion: "" }));
const expansionRules = [
    seededRule(
        /expand/,
        "company",
        Object.fromEntries(
            expansionRows.map((row, i) => [String(row.company), scoreAnswer(expansionLevels, ...expansionSeeds[i])])
        )
    ),
];
const expansionColumns: readonly StoryColumn[] = [
    ...accountColumnsBase,
    { id: "expansionScore", title: "Expansion score", width: 220, kind: "number" },
    { id: "expansion", title: "Expansion", width: 220 },
];
const expansionBase = {
    primitive: "score",
    instructions: "How likely is this account to expand its contract this year?",
    sources: ["company"],
    levels: expansionLevels,
    policy: { show: { minConfidence: 0.4 }, ready: { minConfidence: 0.7 } },
    presentation: { showConfidence: true, rubricBar: true },
} as const;
const expansionDefinitions: AIFillConfig["columns"] = {
    expansionScore: { ...expansionBase, output: { store: "score", precision: 2 } } satisfies ScoreColumnDefinition,
    expansion: { ...expansionBase, output: { store: "level-label" } } satisfies ScoreColumnDefinition,
};

export const HighScoreLowConfidence: React.FC<EndpointArgs> = ({ endpointUrl }) => {
    const table = useStoryTable(expansionRows, expansionColumns);
    const jev = useMockJev(expansionRules, 300);
    const connection = useStoryConnection(endpointUrl, jev);
    const aiFill = React.useMemo(
        () =>
            storyConfig(connection, table.getRowId, expansionDefinitions, {
                onReady: api => api.fill("column-empty"),
            }),
        [connection, table.getRowId]
    );
    return (
        <AIStoryFrame
            title="6. High Score with low confidence"
            description={
                <>
                    <p>
                        A Score is a position on the rubric (0 to 4 here), not a measure of certainty. These columns
                        show a Score with <code>show.minConfidence: 0.4</code> and <code>ready.minConfidence: 0.7</code>
                        . The story fills the empty cells when it loads.
                    </p>
                    <ul>
                        <li>Bluefin Supply: score 3.86, confidence 0.90: suggested.</li>
                        <li>Harbor Health: score 3.25, confidence 0.55: a high score, but it goes to review.</li>
                        <li>
                            Kestrel Retail: score 3.13, confidence 0.22: withheld. Part of the probability sits on
                            &quot;Very unlikely&quot;, so the model isn&apos;t sure, whatever the score says.
                        </li>
                        <li>Tallgrass Labs: score 0.12, confidence 0.92: a confident low score, suggested.</li>
                    </ul>
                    <p>Open the inspector to see each level&apos;s probability next to the score.</p>
                </>
            }
        >
            <AIStoryGrid table={table} aiFill={aiFill} height={270} />
        </AIStoryFrame>
    );
};
Object.assign(HighScoreLowConfidence, { storyName: "06 High Score with low confidence", ...endpointStory });
