import type { AIFillConfig } from "../../../src/ai-fill/config/types.js";
import type { MockJevOptions } from "../../../src/ai-fill/testing/index.js";
import { noulAnswer, ownsBudget, persona, personaAnswer, seniority, seniorityAnswer } from "./definitions.js";
import type { HarnessColumn, HarnessRow } from "./harness.js";

/** The contacts grid the grid-level tests use. Every value is made up. */
export const contactColumns: readonly HarnessColumn[] = [
    { id: "company", kind: "text" },
    { id: "title", kind: "text" },
    { id: "notes", kind: "text" },
    { id: "persona", kind: "text", readonly: row => row.locked === true },
    { id: "seniority", kind: "text" },
    { id: "ownsBudget", kind: "boolean" },
];

export const col = {
    company: 0,
    title: 1,
    notes: 2,
    persona: 3,
    seniority: 4,
    ownsBudget: 5,
} as const;

export function contactRows(): HarnessRow[] {
    return [
        { id: "r1", company: "Acme", title: "VP Sales", notes: "", persona: "", seniority: "", ownsBudget: null },
        { id: "r2", company: "Globex", title: "CFO", notes: "signs off", persona: "", seniority: "", ownsBudget: null },
        { id: "r3", company: "Initech", title: "Engineer", notes: "", persona: "", seniority: "", ownsBudget: null },
        { id: "r4", company: "Umbrella", title: "Intern", notes: "", persona: "", seniority: "", ownsBudget: null },
    ];
}

/**
 * Deterministic answers keyed on the title in the request's state:
 * - persona: VP → champion 0.9, CFO → economic 0.85, Engineer → champion 0.6 (review under the
 *   default policy below), Intern → none of the above 0.9
 * - seniority: VP → 3, CFO → 3, Engineer → 0, Intern → 0
 * - ownsBudget: CFO → 0.95, VP → 0.5 (between the bands), otherwise 0.02
 */
export const contactRules: NonNullable<MockJevOptions["rules"]> = [
    {
        type: "choice",
        answer: ({ state }) => {
            const text = JSON.stringify(state);
            if (text.includes("CFO")) return personaAnswer(0.85, 0.7, "economic");
            if (text.includes("VP")) return personaAnswer(0.9, 0.8, "champion");
            if (text.includes("Intern")) return personaAnswer(0.9, 0.9, "none_of_the_above");
            return personaAnswer(0.6, 0.4, "champion");
        },
    },
    {
        type: "score",
        answer: ({ state }) => {
            const text = JSON.stringify(state);
            return text.includes("VP") || text.includes("CFO")
                ? seniorityAnswer(3, 0.9, { "0": 0, "1": 0, "2": 0.1, "3": 0.9 })
                : seniorityAnswer(0, 0.9, { "0": 0.9, "1": 0.1, "2": 0, "3": 0 });
        },
    },
    {
        type: "noul",
        answer: ({ state }) => {
            const text = JSON.stringify(state);
            if (text.includes("CFO")) return noulAnswer(0.95);
            if (text.includes("VP")) return noulAnswer(0.5);
            return noulAnswer(0.02);
        },
    },
];

/** The contacts configuration: persona reviews below 0.8, seniority stores the level label, ownsBudget booleans. */
export function contactConfig(
    connection: AIFillConfig["connection"],
    getRowId: (row: number) => string,
    overrides: Partial<AIFillConfig> = {}
): AIFillConfig {
    return {
        connection,
        model: "jev-latest",
        rows: { getRowId },
        columns: {
            persona: { ...persona, policy: { ready: { minProbability: 0.8 } } },
            seniority: { ...seniority, output: { store: "level-label" } },
            ownsBudget,
        },
        execution: { timeoutMs: 600_000, backoff: { jitter: 0 } },
        ...overrides,
    };
}
