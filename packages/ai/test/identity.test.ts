import { describe, expect, it } from "vitest";
import {
    buildQuestion,
    cacheKey,
    canonicalJson,
    inputFingerprint,
    questionFingerprint,
    resolveModel,
    shortHash,
    type AIColumnDefinition,
    type CacheKeyParts,
    type ChoiceColumnDefinition,
    type NoulColumnDefinition,
    type ScoreColumnDefinition,
} from "../src/index.js";
import { ownsBudget, persona, seniority } from "./fixtures/definitions.js";

describe("canonicalJson", () => {
    it("doesn't depend on key order, at any depth", () => {
        const a = { b: 1, a: { d: [1, { y: 2, x: 1 }], c: "x" } };
        const b = { a: { c: "x", d: [1, { x: 1, y: 2 }] }, b: 1 };
        expect(canonicalJson(a)).toBe(canonicalJson(b));
        expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[1,{"x":1,"y":2}]},"b":1}');
    });

    it("keeps array order", () => {
        expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    });

    it("follows JSON.stringify for values", () => {
        const value = {
            u: undefined,
            f: () => 1,
            n: NaN,
            i: -Infinity,
            z: -0,
            d: new Date(0),
            arr: [undefined, () => 1],
            s: 'q"',
        };
        expect(JSON.parse(canonicalJson(value))).toEqual(JSON.parse(JSON.stringify(value)));
        expect(canonicalJson("x")).toBe('"x"');
        expect(canonicalJson(null)).toBe("null");
        expect(canonicalJson(true)).toBe("true");
    });

    it("throws for values with no JSON form", () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => canonicalJson(circular)).toThrow(/circular/);
        expect(() => canonicalJson(BigInt(1))).toThrow(/BigInt/);
        expect(() => canonicalJson(undefined)).toThrow(/undefined/);
    });

    it("allows the same object twice when it isn't circular", () => {
        const shared = { a: 1 };
        expect(canonicalJson([shared, shared])).toBe('[{"a":1},{"a":1}]');
    });
});

describe("buildQuestion", () => {
    it("sends Choice option descriptions keyed by id", () => {
        expect(buildQuestion(persona)).toEqual({
            type: "choice",
            instructions: persona.instructions,
            criteria: {
                champion: "Drives the purchase internally",
                economic: "Controls the budget",
                user: "Uses the product day to day",
                none_of_the_above: "None of these fit",
                insufficient: null,
            },
        });
    });

    it("sends Score level descriptions in order", () => {
        expect(buildQuestion(seniority)).toMatchObject({
            type: "score",
            criteria: [
                "Individual contributor",
                "Manager",
                "Director",
                { what: "Executive", examples: ["VP", "C-level"] },
            ],
        });
    });

    it("sends Noul criteria only when configured", () => {
        expect(buildQuestion(ownsBudget)).toMatchObject({ type: "noul", criteria: ownsBudget.criteria });
        expect(buildQuestion({ ...ownsBudget, criteria: undefined })).not.toHaveProperty("criteria");
    });

    it("sends context with the instructions", () => {
        expect(buildQuestion({ ...persona, context: { examples: ["CFO → economic"] } }).instructions).toEqual({
            instructions: persona.instructions,
            context: { examples: ["CFO → economic"] },
        });
    });
});

describe("fingerprints and cache keys", () => {
    const state = { company: "Acme", title: "VP Finance" };
    const parts = (definition: AIColumnDefinition, rowState: unknown = state, model = "jev-latest"): CacheKeyParts => ({
        rowId: "row-1",
        columnId: "persona",
        questionFingerprint: questionFingerprint(definition),
        inputFingerprint: inputFingerprint(rowState as never),
        model,
    });
    const key = (definition: AIColumnDefinition, rowState?: unknown, model?: string) =>
        cacheKey(parts(definition, rowState, model));
    const base = key(persona);

    it("changes when the instructions, context, options, levels, criteria or sources change", () => {
        const changed: AIColumnDefinition[] = [
            { ...persona, instructions: "Which persona fits?" },
            { ...persona, context: "B2B SaaS" },
            {
                ...persona,
                options: { ...persona.options, champion: { description: "Pushes the deal", label: "Champion" } },
            },
            { ...persona, options: { ...persona.options, influencer: { description: "Shapes opinion" } } },
            { ...persona, sources: ["company"] },
            { ...persona, sources: ["company", "title", "notes"] },
        ];
        for (const def of changed) expect(key(def)).not.toBe(base);

        const levels: ScoreColumnDefinition = { ...seniority, levels: [...seniority.levels, "Board member"] };
        expect(key(levels)).not.toBe(key(seniority));
        const levelText: ScoreColumnDefinition = { ...seniority, levels: ["a", "b", "c", "d"] };
        expect(key(levelText)).not.toBe(key(seniority));
        const criteria: NoulColumnDefinition = { ...ownsBudget, criteria: { true: "Approves spend" } };
        expect(key(criteria)).not.toBe(key(ownsBudget));
    });

    it("changes when the state or the model changes", () => {
        expect(key(persona, { ...state, title: "CFO" })).not.toBe(base);
        expect(key(persona, state, "jev-preview")).not.toBe(base);
        expect(cacheKey({ ...parts(persona), rowId: "row-2" })).not.toBe(base);
        expect(cacheKey({ ...parts(persona), columnId: "other" })).not.toBe(base);
    });

    it("doesn't change with the policy, output mapping, presentation, decide, labels or source order", () => {
        const same: ChoiceColumnDefinition[] = [
            { ...persona, policy: { show: { minProbability: 0.8 }, ready: { minConfidence: 0.9 } } },
            { ...persona, policy: { decide: () => ({ status: "review" }) } },
            { ...persona, output: { format: v => String(v), toCell: () => undefined } },
            { ...persona, presentation: { showProbability: true, alternatives: { count: 3 } } },
            {
                ...persona,
                options: { ...persona.options, champion: { ...persona.options.champion, label: "Internal champion" } },
            },
            { ...persona, fillScopes: ["selection"], overwrite: "suggest", missingInput: "evaluate" },
            { ...persona, sources: ["title", "company", "title"] },
        ];
        for (const def of same) expect(key(def)).toBe(base);
        const scoreOutput: ScoreColumnDefinition = { ...seniority, output: { store: "level-label", precision: 0 } };
        expect(key(scoreOutput)).toBe(key(seniority));
    });

    it("doesn't depend on the state's key order", () => {
        expect(key(persona, { title: "VP Finance", company: "Acme" })).toBe(base);
    });

    it("uses the exact canonical strings, not hashes", () => {
        const p = parts(persona);
        expect(base).toBe(canonicalJson([p.rowId, p.columnId, p.questionFingerprint, p.inputFingerprint, p.model]));
        expect(base).toContain(JSON.stringify(p.inputFingerprint));
    });

    it("resolves a per-column model before the grid's", () => {
        expect(resolveModel({ model: "jev-latest" }, persona)).toBe("jev-latest");
        expect(resolveModel({ model: "jev-latest" }, { ...persona, model: "jev-1.13.0" })).toBe("jev-1.13.0");
    });
});

describe("shortHash", () => {
    it("is 8 hex digits and deterministic", () => {
        expect(shortHash("abc")).toMatch(/^[0-9a-f]{8}$/);
        expect(shortHash("abc")).toBe(shortHash("abc"));
        expect(shortHash("")).toBe("811c9dc5");
        expect(shortHash("a")).toBe("e40c292c");
    });

    it("differs for different input", () => {
        expect(shortHash(questionFingerprint(persona))).not.toBe(shortHash(questionFingerprint(seniority)));
    });
});
