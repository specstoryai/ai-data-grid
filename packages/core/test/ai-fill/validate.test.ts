import { describe, expect, it } from "vitest";
import {
    type AIColumnDefinition,
    type AIFillConfig,
    type AIFillConfigIssue,
    validateAIFillConfig,
} from "../../src/ai-fill/index.js";
import { gridColumns, ownsBudget, persona, seniority, validConfig } from "./fixtures/definitions.js";

const server = { isBrowser: false, columns: gridColumns };

function validate(config: unknown, options = server): AIFillConfigIssue[] {
    return validateAIFillConfig(config as AIFillConfig, options);
}

function withColumn(id: string, def: unknown): unknown {
    const config = validConfig();
    return { ...config, columns: { ...config.columns, [id]: def } };
}

/** Asserts exactly one issue at `path`, with a message matching `message`, and returns it. */
function expectIssue(config: unknown, path: string, message: RegExp, options = server): AIFillConfigIssue {
    const issues = validate(config, options);
    const matching = issues.filter(i => i.path === path);
    expect(matching, `issues: ${JSON.stringify(issues, null, 1)}`).toHaveLength(1);
    expect(matching[0].message).toMatch(message);
    return matching[0];
}

describe("validateAIFillConfig: valid configurations", () => {
    it("returns no issues for a valid configuration", () => {
        expect(validate(validConfig())).toEqual([]);
    });

    it("accepts every documented option", () => {
        const config: AIFillConfig = {
            ...validConfig(),
            connection: {
                mode: "direct",
                apiKey: "test-key",
                dangerouslyAllowBrowser: true,
                baseURL: "https://x.test",
                fetch,
            },
            rows: { getRowId: row => String(row), getRowIndex: () => 0 },
            rowState: ({ rowId }) => ({ rowId }),
            rowScope: () => ({ rows: "displayed", label: "all contacts" }),
            execution: {
                concurrency: 2,
                maxRetries: 0,
                backoff: { initialMs: 100, maxMs: 1000, jitter: 0 },
                timeoutMs: 500,
            },
            onResult: () => undefined,
            columns: {
                persona: {
                    ...persona,
                    context: { note: "B2B" },
                    overwrite: "suggest",
                    fillScopes: ["selection", "column-empty"],
                    presentation: { showProbability: true, alternatives: { count: 3, minProbability: 0.05 } },
                    policy: {
                        show: {
                            minProbability: 0.8,
                            options: { notIn: ["user"] },
                            optionProbability: { economic: { min: 0, max: 0.5 } },
                        },
                        ready: { minProbability: 0.8, minMargin: 0.3, optionProbability: { economic: { max: 0.4 } } },
                        autoApply: { minProbability: 0.95, minConfidence: 0.9 },
                        decide: () => undefined,
                    },
                },
                seniority: {
                    ...seniority,
                    output: { store: "level-value", levelFrom: "most-probable", precision: 1 },
                    policy: {
                        show: { minConfidence: 0.5, score: { min: 0, max: 3 }, levelProbability: { 3: { max: 0.9 } } },
                    },
                },
                ownsBudget: {
                    ...ownsBudget,
                    sources: [],
                    state: () => "state",
                    policy: { show: { noul: { min: 0, max: 1 } } },
                },
            },
        };
        expect(validate(config)).toEqual([]);
    });

    it("accepts Score levels as objects without labels and Noul probability mode without bands", () => {
        const config = withColumn("ownsBudget", { ...ownsBudget, output: { store: "probability", precision: 3 } });
        expect(validate(config)).toEqual([]);
    });

    it("skips the grid column checks when no columns are given", () => {
        expect(validate(withColumn("elsewhere", persona), { isBrowser: false } as never)).toEqual([]);
    });
});

describe("validateAIFillConfig: grid-level structure", () => {
    it("rejects a non-object config", () => {
        expect(validate(undefined)).toEqual([{ path: "", message: "the AI Fill configuration must be an object" }]);
    });

    it("requires a valid connection", () => {
        expectIssue({ ...validConfig(), connection: undefined }, "connection", /is required/);
        expectIssue(
            { ...validConfig(), connection: { mode: "socket" } },
            "connection.mode",
            /"endpoint", "direct" or "custom"/
        );
        expectIssue(
            { ...validConfig(), connection: { mode: "endpoint", url: "" } },
            "connection.url",
            /non-empty string/
        );
        expectIssue(
            { ...validConfig(), connection: { mode: "endpoint", url: "/x", headers: {} } },
            "connection.headers",
            /function/
        );
        expectIssue({ ...validConfig(), connection: { mode: "custom" } }, "connection.send", /function/);
        expectIssue(
            { ...validConfig(), connection: { mode: "direct", apiKey: "k", baseURL: "" } },
            "connection.baseURL",
            /non-empty/
        );
    });

    it("requires an API key in direct mode, without echoing it", () => {
        expectIssue(
            { ...validConfig(), connection: { mode: "direct", apiKey: "" } },
            "connection.apiKey",
            /non-empty string/
        );
        const secret = "sk-should-never-appear";
        const issues = validate({
            ...validConfig(),
            connection: { mode: "direct", apiKey: secret, dangerouslyAllowBrowser: "yes" },
        });
        expect(issues.map(i => i.path)).toEqual(["connection.dangerouslyAllowBrowser"]);
        expect(JSON.stringify(issues)).not.toContain(secret);
    });

    it("requires dangerouslyAllowBrowser for direct mode in a browser only", () => {
        const direct = { ...validConfig(), connection: { mode: "direct", apiKey: "test-key" } };
        const issue = expectIssue(direct, "connection.dangerouslyAllowBrowser", /exposes the API key/, {
            ...server,
            isBrowser: true,
        });
        expect(issue.columnId).toBeUndefined();
        expect(validate(direct)).toEqual([]);
        expect(
            validate(
                { ...direct, connection: { ...direct.connection, dangerouslyAllowBrowser: true } },
                { ...server, isBrowser: true }
            )
        ).toEqual([]);
    });

    it("detects a browser by default", () => {
        // vitest runs these tests in jsdom, which has window and document.
        const direct = { ...validConfig(), connection: { mode: "direct", apiKey: "test-key" } };
        expect(validateAIFillConfig(direct as AIFillConfig, { columns: gridColumns }).map(i => i.path)).toEqual([
            "connection.dangerouslyAllowBrowser",
        ]);
    });

    it("requires a model", () => {
        expectIssue({ ...validConfig(), model: undefined }, "model", /is required/);
        expectIssue({ ...validConfig(), model: "" }, "model", /is required/);
    });

    it("requires rows.getRowId", () => {
        expectIssue({ ...validConfig(), rows: {} }, "rows.getRowId", /is required/);
        expectIssue({ ...validConfig(), rows: undefined }, "rows.getRowId", /is required/);
        expectIssue(
            { ...validConfig(), rows: { getRowId: () => "a", getRowIndex: 1 } },
            "rows.getRowIndex",
            /function/
        );
    });

    it("requires callbacks to be functions", () => {
        expectIssue({ ...validConfig(), rowState: "x" }, "rowState", /function/);
        expectIssue({ ...validConfig(), onCommit: true }, "onCommit", /function/);
    });

    it("checks execution limits", () => {
        const exec = (execution: unknown) => ({ ...validConfig(), execution });
        expectIssue(exec({ concurrency: 0 }), "execution.concurrency", /integer >= 1/);
        expectIssue(exec({ maxRetries: 1.5 }), "execution.maxRetries", /integer >= 0/);
        expectIssue(exec({ timeoutMs: -1 }), "execution.timeoutMs", /positive/);
        expectIssue(exec({ backoff: { jitter: 2 } }), "execution.backoff.jitter", /\[0, 1\]/);
        expectIssue(exec({ backoff: { initialMs: 10, maxMs: 1 } }), "execution.backoff", /initialMs must be <= maxMs/);
        expectIssue(exec("fast"), "execution", /must be an object/);
    });

    it("requires columns to be an object", () => {
        expectIssue({ ...validConfig(), columns: [] }, "columns", /must be an object/);
    });

    it("reports duplicate grid column ids", () => {
        expectIssue(validConfig(), "columns", /several grid columns have id "title"/, {
            ...server,
            columns: [...gridColumns, { id: "title", title: "Again", width: 10 }],
        });
    });
});

describe("validateAIFillConfig: column structure", () => {
    it("tags column issues with the column id", () => {
        const issue = expectIssue(
            withColumn("persona", { ...persona, instructions: "" }),
            "columns.persona.instructions",
            /is required/
        );
        expect(issue.columnId).toBe("persona");
    });

    it("requires the AI column to be a grid column with that id", () => {
        const config = withColumn("region", { ...persona });
        expectIssue(config, "columns.region", /no grid column has id "region"/);
    });

    it("quotes column ids that aren't identifiers in paths", () => {
        expectIssue(withColumn("buyer persona", { ...persona }), 'columns["buyer persona"]', /no grid column/);
    });

    it("requires a known primitive and a definition object", () => {
        expectIssue(
            withColumn("persona", { ...persona, primitive: "rank" }),
            "columns.persona.primitive",
            /"choice", "score" or "noul"/
        );
        expectIssue(withColumn("persona", "Choice"), "columns.persona", /definition object/);
    });

    it("checks sources", () => {
        expectIssue(withColumn("persona", { ...persona, sources: "title" }), "columns.persona.sources", /array/);
        expectIssue(
            withColumn("persona", { ...persona, sources: ["title", ""] }),
            "columns.persona.sources[1]",
            /non-empty/
        );
        expectIssue(
            withColumn("persona", { ...persona, sources: ["persona"] }),
            "columns.persona.sources[0]",
            /its own source/
        );
        expectIssue(
            withColumn("persona", { ...persona, sources: ["phone"] }),
            "columns.persona.sources[0]",
            /no grid column has id "phone"/
        );
    });

    it("requires a state accessor when there are no sources", () => {
        expectIssue(
            withColumn("persona", { ...persona, sources: [] }),
            "columns.persona.sources",
            /needs a state accessor/
        );
        expect(validate(withColumn("persona", { ...persona, sources: undefined, state: () => "s" }))).toEqual([]);
        const gridState = {
            ...(withColumn("persona", { ...persona, sources: [] }) as AIFillConfig),
            rowState: () => "s",
        };
        expect(validate(gridState)).toEqual([]);
    });

    it("checks the shared options", () => {
        expectIssue(withColumn("persona", { ...persona, applies: true }), "columns.persona.applies", /function/);
        expectIssue(withColumn("persona", { ...persona, isEmpty: "blank" }), "columns.persona.isEmpty", /function/);
        expectIssue(
            withColumn("persona", { ...persona, missingInput: "fail" }),
            "columns.persona.missingInput",
            /"skip", "evaluate"/
        );
        expectIssue(
            withColumn("persona", { ...persona, overwrite: "always" }),
            "columns.persona.overwrite",
            /"never", "suggest", "apply"/
        );
        expectIssue(withColumn("persona", { ...persona, model: "" }), "columns.persona.model", /non-empty/);
        expectIssue(
            withColumn("persona", { ...persona, fillScopes: [] }),
            "columns.persona.fillScopes",
            /non-empty array/
        );
        expectIssue(
            withColumn("persona", { ...persona, fillScopes: ["all"] }),
            "columns.persona.fillScopes[0]",
            /one of/
        );
    });

    it("rejects autoApply with overwrite never alongside the column scope", () => {
        const def = { ...persona, fillScopes: ["selection", "column"], policy: { autoApply: { minProbability: 0.9 } } };
        expectIssue(
            withColumn("persona", def),
            "columns.persona.policy.autoApply",
            /conflicts with the "column" fill scope/
        );
        expect(validate(withColumn("persona", { ...def, overwrite: "apply" }))).toEqual([]);
        expect(validate(withColumn("persona", { ...persona, policy: { autoApply: { minProbability: 0.9 } } }))).toEqual(
            []
        );
    });
});

describe("validateAIFillConfig: Choice", () => {
    const options = (count: number) =>
        Object.fromEntries(Array.from({ length: count }, (_, i) => [`o${i}`, { description: `Option ${i}` }]));

    it("requires 2 to 255 options", () => {
        expectIssue(
            withColumn("persona", { ...persona, options: options(1) }),
            "columns.persona.options",
            /2 to 255 options; found 1/
        );
        expectIssue(
            withColumn("persona", { ...persona, options: options(256) }),
            "columns.persona.options",
            /found 256/
        );
        expect(validate(withColumn("persona", { ...persona, options: options(2) }))).toEqual([]);
        expect(validate(withColumn("persona", { ...persona, options: options(255) }))).toEqual([]);
        expectIssue(
            withColumn("persona", { ...persona, options: undefined }),
            "columns.persona.options",
            /must be an object/
        );
    });

    it("checks each option", () => {
        const bad = (option: unknown) =>
            withColumn("persona", { ...persona, options: { ...persona.options, champion: option } });
        expectIssue(
            bad({ label: "Champion" }),
            "columns.persona.options.champion.description",
            /string, an object, or null/
        );
        expectIssue(
            bad({ description: "" }),
            "columns.persona.options.champion.description",
            /string, an object, or null/
        );
        expectIssue(bad({ description: "x", label: 1 }), "columns.persona.options.champion.label", /non-empty/);
        expectIssue(
            bad({ description: "x", outcome: "other" }),
            "columns.persona.options.champion.outcome",
            /"value", "none", "unknown"/
        );
        expectIssue(bad("Champion"), "columns.persona.options.champion", /must be an object/);
        expectIssue(
            withColumn("persona", { ...persona, options: { ...persona.options, "": { description: "x" } } }),
            'columns.persona.options[""]',
            /non-empty/
        );
    });

    it("checks presentation and output", () => {
        expectIssue(
            withColumn("persona", { ...persona, presentation: { showConfidence: "yes" } }),
            "columns.persona.presentation.showConfidence",
            /boolean/
        );
        expectIssue(
            withColumn("persona", { ...persona, presentation: { alternatives: { count: 0 } } }),
            "columns.persona.presentation.alternatives.count",
            /integer >= 1/
        );
        expectIssue(
            withColumn("persona", { ...persona, presentation: { alternatives: { count: 2, minProbability: 2 } } }),
            "columns.persona.presentation.alternatives.minProbability",
            /\[0, 1\]/
        );
        expectIssue(
            withColumn("persona", { ...persona, output: { toCell: 1 } }),
            "columns.persona.output.toCell",
            /function/
        );
    });

    it("requires thresholds to be finite and within [0, 1]", () => {
        const gate = (show: unknown) => withColumn("persona", { ...persona, policy: { show } });
        expectIssue(
            gate({ minProbability: 80 }),
            "columns.persona.policy.show.minProbability",
            /finite number in \[0, 1\]/
        );
        expectIssue(gate({ minConfidence: -0.1 }), "columns.persona.policy.show.minConfidence", /\[0, 1\]/);
        expectIssue(gate({ minMargin: NaN }), "columns.persona.policy.show.minMargin", /\[0, 1\]/);
        expectIssue(gate({ minProbability: "0.8" }), "columns.persona.policy.show.minProbability", /\[0, 1\]/);
        expectIssue(
            gate({ optionProbability: { economic: { max: 1.5 } } }),
            "columns.persona.policy.show.optionProbability.economic.max",
            /\[0, 1\]/
        );
    });

    it("requires min <= max inside a range", () => {
        const def = { ...persona, policy: { show: { optionProbability: { economic: { min: 0.6, max: 0.4 } } } } };
        expectIssue(
            withColumn("persona", def),
            "columns.persona.policy.show.optionProbability.economic",
            /min \(0.6\) must be <= max \(0.4\)/
        );
    });

    it("requires referenced option ids to exist", () => {
        const gate = (show: unknown) => withColumn("persona", { ...persona, policy: { show } });
        expectIssue(
            gate({ options: { in: ["champion", "ceo"] } }),
            "columns.persona.policy.show.options.in[1]",
            /"ceo" is not an option id/
        );
        expectIssue(
            gate({ options: { notIn: "user" } }),
            "columns.persona.policy.show.options.notIn",
            /array of option ids/
        );
        expectIssue(
            gate({ options: { only: [] } }),
            "columns.persona.policy.show.options.only",
            /expected in or notIn/
        );
        expectIssue(
            gate({ optionProbability: { ceo: { min: 0.1 } } }),
            "columns.persona.policy.show.optionProbability.ceo",
            /not an option id/
        );
    });

    it("rejects unknown measures and policy keys", () => {
        expectIssue(
            withColumn("persona", { ...persona, policy: { show: { minScore: 1 } } }),
            "columns.persona.policy.show.minScore",
            /unknown choice gate measure/
        );
        expectIssue(
            withColumn("persona", { ...persona, policy: { hide: {} } }),
            "columns.persona.policy.hide",
            /unknown policy key/
        );
        expectIssue(
            withColumn("persona", { ...persona, policy: { decide: "review" } }),
            "columns.persona.policy.decide",
            /function/
        );
        expectIssue(
            withColumn("persona", { ...persona, policy: { show: 0.8 } }),
            "columns.persona.policy.show",
            /must be an object/
        );
        expectIssue(
            withColumn("persona", { ...persona, policy: { show: { optionProbability: { economic: { mid: 0.5 } } } } }),
            "columns.persona.policy.show.optionProbability.economic.mid",
            /only min and max/
        );
    });
});

describe("validateAIFillConfig: overlapping gates", () => {
    const policy = (p: unknown) => withColumn("persona", { ...persona, policy: p });

    it("reports ready below show", () => {
        expectIssue(
            policy({ show: { minProbability: 0.8 }, ready: { minProbability: 0.7 } }),
            "columns.persona.policy.ready.minProbability",
            /overlapping gates: ready.minProbability \(0.7\) is looser than show.minProbability \(0.8\)/
        );
    });

    it("reports autoApply below ready, and below show", () => {
        const issues = validate(
            policy({ show: { minConfidence: 0.9 }, ready: { minConfidence: 0.95 }, autoApply: { minConfidence: 0.85 } })
        );
        expect(issues.map(i => i.message)).toEqual([
            expect.stringMatching(/autoApply.minConfidence \(0.85\) is looser than show.minConfidence \(0.9\)/),
            expect.stringMatching(/autoApply.minConfidence \(0.85\) is looser than ready.minConfidence \(0.95\)/),
        ]);
    });

    it("reports a later max above an earlier max", () => {
        expectIssue(
            policy({
                show: { optionProbability: { economic: { max: 0.3 } } },
                ready: { optionProbability: { economic: { max: 0.4 } } },
            }),
            "columns.persona.policy.ready.optionProbability.economic.max",
            /looser than show/
        );
    });

    it("allows equal and stricter later gates, and different measures", () => {
        expect(
            validate(
                policy({
                    show: { minProbability: 0.8 },
                    ready: { minProbability: 0.8 },
                    autoApply: { minProbability: 0.95 },
                })
            )
        ).toEqual([]);
        expect(validate(policy({ show: { minProbability: 0.8 }, ready: { minConfidence: 0.1 } }))).toEqual([]);
    });

    it("checks Score and Noul ranges too", () => {
        const score = withColumn("seniority", {
            ...seniority,
            policy: { show: { score: { min: 2 } }, ready: { score: { min: 1 } } },
        });
        expectIssue(score, "columns.seniority.policy.ready.score.min", /looser than show.score.min/);
        const noul = withColumn("ownsBudget", {
            ...ownsBudget,
            policy: { ready: { noul: { max: 0.5 } }, autoApply: { noul: { max: 0.6 } } },
        });
        expectIssue(noul, "columns.ownsBudget.policy.autoApply.noul.max", /looser than ready.noul.max/);
    });
});

describe("validateAIFillConfig: Score", () => {
    const score = (def: Partial<Record<keyof typeof seniority, unknown>>) =>
        withColumn("seniority", { ...seniority, ...def });

    it("requires 2 to 10 levels", () => {
        expectIssue(score({ levels: ["only"] }), "columns.seniority.levels", /2 to 10 levels; found 1/);
        expectIssue(
            score({ levels: Array.from({ length: 11 }, (_, i) => `L${i}`) }),
            "columns.seniority.levels",
            /found 11/
        );
        expect(validate(score({ levels: ["low", "high"] }))).toEqual([]);
        expect(validate(score({ levels: Array.from({ length: 10 }, (_, i) => `L${i}`) }))).toEqual([]);
        expectIssue(score({ levels: "low,high" }), "columns.seniority.levels", /must be an array/);
    });

    it("checks each level", () => {
        expectIssue(score({ levels: ["low", ""] }), "columns.seniority.levels[1]", /non-empty/);
        expectIssue(
            score({ levels: ["low", { label: "High" }] }),
            "columns.seniority.levels[1]",
            /\{ description, label\?, value\? \}/
        );
        expectIssue(
            score({ levels: ["low", { description: "high", label: 3 }] }),
            "columns.seniority.levels[1].label",
            /non-empty/
        );
    });

    it("checks the output mapping", () => {
        expectIssue(score({ output: { store: "percent" } }), "columns.seniority.output.store", /one of/);
        expectIssue(
            score({ output: { levelFrom: "floor" } }),
            "columns.seniority.output.levelFrom",
            /"nearest", "most-probable"/
        );
        expectIssue(
            score({ output: { precision: 1.5 } }),
            "columns.seniority.output.precision",
            /integer from 0 to 15/
        );
        expectIssue(
            score({ levels: ["a", { description: "b", value: 1 }], output: { store: "level-value" } }),
            "columns.seniority.levels[0]",
            /needs a value/
        );
        expect(validate(score({ output: { store: () => 1 } }))).toEqual([]);
    });

    it("checks the presentation", () => {
        expectIssue(
            score({ presentation: { rubricBar: "yes" } }),
            "columns.seniority.presentation.rubricBar",
            /boolean/
        );
    });

    it("bounds score thresholds by the rubric and level ids by the level count", () => {
        expectIssue(
            score({ policy: { show: { score: { max: 3.5 } } } }),
            "columns.seniority.policy.show.score.max",
            /\[0, 3\]/
        );
        expectIssue(
            score({ policy: { show: { score: { min: -1 } } } }),
            "columns.seniority.policy.show.score.min",
            /\[0, 3\]/
        );
        expectIssue(
            score({ policy: { show: { levelProbability: { 4: { min: 0.1 } } } } }),
            "columns.seniority.policy.show.levelProbability[4]",
            /level 4 doesn't exist/
        );
        expectIssue(
            score({ policy: { show: { levelProbability: { "01": { min: 0.1 } } } } }),
            "columns.seniority.policy.show.levelProbability[01]",
            /level 01 doesn't exist/
        );
        expectIssue(
            score({ policy: { show: { levelProbability: { top: { min: 0.1 } } } } }),
            "columns.seniority.policy.show.levelProbability[top]",
            /doesn't exist/
        );
        expectIssue(
            score({ policy: { ready: { minProbability: 0.5 } } }),
            "columns.seniority.policy.ready.minProbability",
            /unknown score gate measure/
        );
    });
});

describe("validateAIFillConfig: Noul", () => {
    const noul = (def: Partial<Record<keyof typeof ownsBudget, unknown>>) =>
        withColumn("ownsBudget", { ...ownsBudget, ...def });

    it("requires bands for the boolean and label mappings", () => {
        expectIssue(
            noul({ output: { store: "boolean" } }),
            "columns.ownsBudget.output.bands",
            /there are no default bands/
        );
        expectIssue(noul({ output: { store: "label" } }), "columns.ownsBudget.output.bands", /needs bands/);
    });

    it("checks the bands", () => {
        const bands = (b: unknown) => noul({ output: { store: "boolean", bands: b } });
        expectIssue(
            bands({ falseAtOrBelow: 0.8, trueAtOrAbove: 0.2, between: "review" }),
            "columns.ownsBudget.output.bands",
            /must be < trueAtOrAbove/
        );
        expectIssue(
            bands({ falseAtOrBelow: 0.5, trueAtOrAbove: 0.5, between: "review" }),
            "columns.ownsBudget.output.bands",
            /must be </
        );
        expectIssue(
            bands({ falseAtOrBelow: -1, trueAtOrAbove: 0.8, between: "review" }),
            "columns.ownsBudget.output.bands.falseAtOrBelow",
            /\[0, 1\]/
        );
        expectIssue(
            bands({ falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "false" }),
            "columns.ownsBudget.output.bands.between",
            /"review" or "withhold"/
        );
    });

    it("rejects bands in probability mode", () => {
        expectIssue(
            noul({ output: { bands: { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" } } }),
            "columns.ownsBudget.output.bands",
            /only to output.store "boolean" and "label"/
        );
    });

    it("rejects a confidence measure on a Noul", () => {
        expectIssue(
            noul({ policy: { show: { minConfidence: 0.7 } } }),
            "columns.ownsBudget.policy.show.minConfidence",
            /a Noul answer has no confidence/
        );
        expectIssue(
            noul({ policy: { ready: { minProbability: 0.7 } } }),
            "columns.ownsBudget.policy.ready.minProbability",
            /no separate probability/
        );
    });

    it("checks criteria, labels and ranges", () => {
        expectIssue(noul({ criteria: { yes: "x" } }), "columns.ownsBudget.criteria.yes", /only true and false/);
        expectIssue(
            noul({ criteria: { true: "" } }),
            "columns.ownsBudget.criteria.true",
            /non-empty string or an object/
        );
        expectIssue(
            noul({ output: { ...ownsBudget.output, labels: { maybe: "?" } } }),
            "columns.ownsBudget.output.labels.maybe",
            /true, false or uncertain/
        );
        expectIssue(
            noul({ output: { ...ownsBudget.output, labels: { true: "" } } }),
            "columns.ownsBudget.output.labels.true",
            /non-empty/
        );
        expectIssue(
            noul({ policy: { show: { noul: { min: 1.2 } } } }),
            "columns.ownsBudget.policy.show.noul.min",
            /\[0, 1\]/
        );
        expectIssue(
            noul({ policy: { show: { noul: { min: 0.6, max: 0.4 } } } }),
            "columns.ownsBudget.policy.show.noul",
            /min \(0.6\) must be <= max/
        );
        expectIssue(
            noul({ output: { store: "yes/no" } }),
            "columns.ownsBudget.output.store",
            /"probability", "boolean", "label"/
        );
        expectIssue(
            noul({ presentation: { probabilityBar: 1 } }),
            "columns.ownsBudget.presentation.probabilityBar",
            /boolean/
        );
    });

    it("lets one bad column leave the others valid", () => {
        const issues = validate(withColumn("ownsBudget", { ...ownsBudget, output: { store: "boolean" } }));
        expect(issues.every(i => i.columnId === "ownsBudget")).toBe(true);
    });
});

describe("validateAIFillConfig: every column definition type", () => {
    it("validates definitions typed as AIColumnDefinition", () => {
        const defs: AIColumnDefinition[] = [persona, seniority, ownsBudget];
        const config = {
            ...validConfig(),
            columns: Object.fromEntries(defs.map((d, i) => [gridColumns[3 + i].id, d])),
        };
        expect(validate(config)).toEqual([]);
    });
});
