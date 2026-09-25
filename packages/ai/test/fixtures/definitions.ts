import type {
    AIFillConfig,
    ChoiceAnswer,
    ChoiceColumnDefinition,
    NoulAnswer,
    NoulColumnDefinition,
    ScoreAnswer,
    ScoreColumnDefinition,
} from "../../src/index.js";

export const model = "jev-1.13.0";

export const persona: ChoiceColumnDefinition = {
    primitive: "choice",
    instructions: "Which buyer persona best describes this contact?",
    sources: ["company", "title"],
    options: {
        champion: { description: "Drives the purchase internally", label: "Champion" },
        economic: { description: "Controls the budget", label: "Economic buyer", value: "ECON" },
        user: { description: "Uses the product day to day" },
        none_of_the_above: { description: "None of these fit", label: "None of the above", outcome: "none" },
        insufficient: { description: null, label: "Not enough information", outcome: "unknown" },
    },
};

export const seniority: ScoreColumnDefinition = {
    primitive: "score",
    instructions: "How senior is this contact?",
    sources: ["title"],
    levels: [
        { description: "Individual contributor", label: "IC", value: "ic" },
        { description: "Manager", label: "Manager", value: "mgr" },
        { description: "Director", label: "Director", value: "dir" },
        { description: { what: "Executive", examples: ["VP", "C-level"] }, label: "Executive", value: "exec" },
    ],
};

export const ownsBudget: NoulColumnDefinition = {
    primitive: "noul",
    instructions: "Does this contact own a budget?",
    sources: ["title", "notes"],
    criteria: { true: "Signs off on spend", false: "No spending authority" },
    output: { store: "boolean", bands: { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" } },
};

/** A Choice answer for `persona` where `champion` has probability `p` and `economic` the rest. */
export function personaAnswer(p: number, confidence: number, choice: string = "champion"): ChoiceAnswer {
    const other = choice === "champion" ? "economic" : "champion";
    return {
        type: "choice",
        choice,
        probabilities: {
            champion: 0,
            economic: 0,
            user: 0,
            none_of_the_above: 0,
            insufficient: 0,
            [choice]: p,
            [other]: 1 - p,
        },
        confidence,
        model,
    };
}

/** A Score answer for the 4-level `seniority` rubric. */
export function seniorityAnswer(
    score: number,
    confidence: number,
    probabilities: Record<string, number> = { "0": 0.05, "1": 0.1, "2": 0.35, "3": 0.5 }
): ScoreAnswer {
    return {
        type: "score",
        score,
        legend: {
            "0": "Individual contributor",
            "1": "Manager",
            "2": "Director",
            "3": { what: "Executive", examples: ["VP", "C-level"] },
        },
        probabilities,
        confidence,
        model,
    };
}

export function noulAnswer(noul: number): NoulAnswer {
    return { type: "noul", noul, model };
}

export const gridColumns = [
    { id: "company", title: "Company", width: 100 },
    { id: "title", title: "Title", width: 100 },
    { id: "notes", title: "Notes", width: 100 },
    { id: "persona", title: "Persona", width: 100 },
    { id: "seniority", title: "Seniority", width: 100 },
    { id: "ownsBudget", title: "Owns budget", width: 100 },
];

export function validConfig(): AIFillConfig {
    return {
        connection: { mode: "endpoint", url: "/api/jev" },
        model: "jev-latest",
        rows: { getRowId: row => `row-${row}` },
        columns: { persona, seniority, ownsBudget },
    };
}
