import { GridCellKind } from "@specstory/ai-data-grid";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildQuestion,
    evaluatePolicy,
    parseAnswer,
    type AIColumnDefinition,
    type AIFillMode,
    type ChoiceColumnDefinition,
    type ChoicePolicy,
    type DecideContext,
    type NoulColumnDefinition,
    type ParsedAnswer,
    type PolicyEvaluation,
    type ScoreColumnDefinition,
} from "../src/index.js";
import {
    model,
    noulAnswer,
    ownsBudget,
    persona,
    personaAnswer,
    seniority,
    seniorityAnswer,
} from "./fixtures/definitions.js";

const context = { rowId: "row-7", columnId: "persona", row: 3, state: { company: "Acme", title: "VP Sales" } };

function evaluate(definition: AIColumnDefinition, answer: ParsedAnswer, mode?: AIFillMode): PolicyEvaluation {
    return evaluatePolicy({ definition, answer, context, mode });
}

function choice(policy: ChoicePolicy): ChoiceColumnDefinition {
    return { ...persona, policy };
}

function status(definition: AIColumnDefinition, answer: ParsedAnswer, mode?: AIFillMode): string {
    return evaluate(definition, answer, mode).status;
}

describe("Choice: show at probability 0.80", () => {
    const def = choice({ show: { minProbability: 0.8 } });

    it("withholds 0.79 and shows 0.80", () => {
        expect(status(def, personaAnswer(0.79, 0.9))).toBe("withheld");
        expect(status(def, personaAnswer(0.8, 0.9))).toBe("suggested");
    });

    it("withholds 0.7999999: no epsilon, no rounding", () => {
        expect(status(def, personaAnswer(0.7999999, 0.9))).toBe("withheld");
    });

    it("never substitutes confidence for probability", () => {
        expect(status(def, personaAnswer(0.79, 0.95))).toBe("withheld");
        expect(status(def, personaAnswer(0.85, 0.3))).toBe("suggested");
    });

    it("never substitutes probability for confidence", () => {
        const byConfidence = choice({ show: { minConfidence: 0.6 } });
        expect(status(byConfidence, personaAnswer(0.99, 0.59))).toBe("withheld");
        expect(status(byConfidence, personaAnswer(0.51, 0.6))).toBe("suggested");
    });

    it("explains a withheld result with the exact value and the gate", () => {
        const result = evaluate(def, personaAnswer(0.79, 0.95));
        expect(result.status === "withheld" && result.decision.reason).toEqual({
            code: "gate-failed",
            gate: "show",
            measure: "minProbability",
            actual: 0.79,
            threshold: 0.8,
            message: "withheld: probability 0.79 < show.minProbability 0.8",
        });
    });

    it("keeps the candidate for a withheld result without writing anything", () => {
        const result = evaluate(def, personaAnswer(0.79, 0.95));
        expect(result.status !== "error" && result.output.display).toBe("Champion");
    });
});

describe("Choice: show 0.80, ready 0.95, autoApply 0.95", () => {
    const def = choice({
        show: { minProbability: 0.8 },
        ready: { minProbability: 0.95 },
        autoApply: { minProbability: 0.95 },
    });

    it("reviews 0.80 and 0.94", () => {
        expect(status(def, personaAnswer(0.8, 0.9))).toBe("review");
        expect(status(def, personaAnswer(0.94, 0.9), "apply")).toBe("review");
    });

    it("makes 0.95 an apply candidate only in a Fill and apply run", () => {
        expect(status(def, personaAnswer(0.95, 0.9), "apply")).toBe("apply-candidate");
        const suggested = evaluate(def, personaAnswer(0.95, 0.9));
        expect(suggested.status).toBe("suggested");
        expect(suggested.status === "suggested" && suggested.decision.reason.code).toBe("apply-not-requested");
    });

    it("never makes anything an apply candidate without autoApply", () => {
        const noAuto = choice({ show: { minProbability: 0.8 }, ready: { minProbability: 0.95 } });
        for (const p of [0.95, 0.99, 1]) {
            expect(status(noAuto, personaAnswer(p, 1), "apply")).toBe("suggested");
        }
        expect(status(persona, personaAnswer(1, 1), "apply")).toBe("suggested");
    });

    it("keeps a result that fails autoApply suggested in an apply run, and says why", () => {
        const stricter = choice({ show: { minProbability: 0.8 }, autoApply: { minProbability: 0.97 } });
        const result = evaluate(stricter, personaAnswer(0.96, 0.9), "apply");
        expect(result.status === "suggested" && result.decision.reason.message).toBe(
            "suggested: probability 0.96 < autoApply.minProbability 0.97"
        );
    });
});

describe("Score: confidence gate", () => {
    const answer = seniorityAnswer(2.9, 0.4, { "0": 0, "1": 0.02, "2": 0.06, "3": 0.92 });

    it("withholds a high score with low confidence at show", () => {
        const def: ScoreColumnDefinition = { ...seniority, policy: { show: { minConfidence: 0.7 } } };
        expect(status(def, answer)).toBe("withheld");
    });

    it("reviews it when the gate is on ready", () => {
        const def: ScoreColumnDefinition = { ...seniority, policy: { ready: { minConfidence: 0.7 } } };
        expect(status(def, answer)).toBe("review");
    });

    it("passes at exactly the threshold", () => {
        const def: ScoreColumnDefinition = { ...seniority, policy: { show: { minConfidence: 0.7 } } };
        expect(status(def, seniorityAnswer(2.9, 0.7, { "0": 0, "1": 0.02, "2": 0.06, "3": 0.92 }))).toBe("suggested");
    });
});

describe("Noul bands: false ≤ 0.20, true ≥ 0.80, between → review", () => {
    it("maps 0.02 to a usable false suggestion, not an error", () => {
        const result = evaluate(ownsBudget, noulAnswer(0.02));
        expect(result.status).toBe("suggested");
        expect(result.status !== "error" && result.output).toMatchObject({
            value: false,
            hasValue: true,
            display: "No",
            outcome: "value",
        });
    });

    it("maps the exact edges: 0.20 → false, 0.2000001 → review, 0.80 → true", () => {
        const at020 = evaluate(ownsBudget, noulAnswer(0.2));
        expect(at020.status).toBe("suggested");
        expect(at020.status !== "error" && at020.output.value).toBe(false);
        expect(status(ownsBudget, noulAnswer(0.2000001))).toBe("review");
        const at080 = evaluate(ownsBudget, noulAnswer(0.8));
        expect(at080.status).toBe("suggested");
        expect(at080.status !== "error" && at080.output.value).toBe(true);
        expect(status(ownsBudget, noulAnswer(0.7999999))).toBe("review");
    });

    it("reviews 0.5 as Uncertain, never No", () => {
        const result = evaluate(ownsBudget, noulAnswer(0.5));
        expect(result.status).toBe("review");
        expect(result.status !== "error" && result.output).toMatchObject({
            display: "Uncertain",
            hasValue: false,
            value: undefined,
            outcome: "uncertain",
            band: "between",
        });
        expect(result.status !== "error" && result.decision.reason.code).toBe("band");
    });

    it('withholds the middle band with between: "withhold"', () => {
        const def: NoulColumnDefinition = {
            ...ownsBudget,
            output: { store: "boolean", bands: { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "withhold" } },
        };
        expect(status(def, noulAnswer(0.5))).toBe("withheld");
    });

    it("never makes the middle band an apply candidate", () => {
        const def: NoulColumnDefinition = { ...ownsBudget, policy: { autoApply: {} } };
        expect(status(def, noulAnswer(0.5), "apply")).toBe("review");
        expect(status(def, noulAnswer(0.9), "apply")).toBe("apply-candidate");
    });
});

describe("exact thresholds: a min passes at equality, and so does a max", () => {
    it("minMargin", () => {
        const def = choice({ show: { minMargin: 0.5 } });
        expect(status(def, personaAnswer(0.75, 0.9))).toBe("suggested");
        expect(status(choice({ show: { minMargin: 0.5000001 } }), personaAnswer(0.75, 0.9))).toBe("withheld");
    });

    it("optionProbability min and max", () => {
        const min = choice({ show: { optionProbability: { economic: { min: 0.25 } } } });
        expect(status(min, personaAnswer(0.75, 0.9))).toBe("suggested");
        expect(status(min, personaAnswer(0.76, 0.9))).toBe("withheld");
        const max = choice({ show: { optionProbability: { economic: { max: 0.25 } } } });
        expect(status(max, personaAnswer(0.75, 0.9))).toBe("suggested");
        const maxResult = evaluate(max, personaAnswer(0.625, 0.9));
        expect(maxResult.status).toBe("withheld");
        expect(maxResult.status === "withheld" && maxResult.decision.reason.message).toBe(
            'withheld: probability of "economic" 0.375 > show.optionProbability.economic.max 0.25'
        );
    });

    it("options.in and options.notIn", () => {
        expect(status(choice({ show: { options: { in: ["champion", "economic"] } } }), personaAnswer(0.9, 0.9))).toBe(
            "suggested"
        );
        expect(status(choice({ show: { options: { in: ["economic"] } } }), personaAnswer(0.9, 0.9))).toBe("withheld");
        expect(status(choice({ ready: { options: { notIn: ["champion"] } } }), personaAnswer(0.9, 0.9))).toBe("review");
        expect(status(choice({ ready: { options: { notIn: ["user"] } } }), personaAnswer(0.9, 0.9))).toBe("suggested");
    });

    it("levelProbability min and max", () => {
        const answer = seniorityAnswer(2.25, 0.8, { "0": 0, "1": 0.25, "2": 0.25, "3": 0.5 });
        const min: ScoreColumnDefinition = {
            ...seniority,
            policy: { show: { levelProbability: { 3: { min: 0.5 } } } },
        };
        expect(status(min, answer)).toBe("suggested");
        const tooHigh: ScoreColumnDefinition = {
            ...seniority,
            policy: { show: { levelProbability: { 3: { min: 0.5000001 } } } },
        };
        expect(status(tooHigh, answer)).toBe("withheld");
        const max: ScoreColumnDefinition = {
            ...seniority,
            policy: { ready: { levelProbability: { 1: { max: 0.25 } } } },
        };
        expect(status(max, answer)).toBe("suggested");
        const tooLow: ScoreColumnDefinition = {
            ...seniority,
            policy: { ready: { levelProbability: { 1: { max: 0.2499999 } } } },
        };
        expect(status(tooLow, answer)).toBe("review");
    });

    it("score min and max", () => {
        const answer = seniorityAnswer(2.5, 0.8, { "0": 0, "1": 0, "2": 0.5, "3": 0.5 });
        expect(status({ ...seniority, policy: { show: { score: { min: 2.5 } } } }, answer)).toBe("suggested");
        expect(status({ ...seniority, policy: { show: { score: { max: 2.5 } } } }, answer)).toBe("suggested");
        expect(status({ ...seniority, policy: { show: { score: { min: 2.5000001 } } } }, answer)).toBe("withheld");
        expect(status({ ...seniority, policy: { show: { score: { max: 2.4999999 } } } }, answer)).toBe("withheld");
    });

    it("noul min and max, in raw probability mode", () => {
        const raw: NoulColumnDefinition = {
            ...ownsBudget,
            output: undefined,
            policy: { show: { noul: { min: 0.3, max: 0.7 } } },
        };
        expect(status(raw, noulAnswer(0.3))).toBe("suggested");
        expect(status(raw, noulAnswer(0.7))).toBe("suggested");
        expect(status(raw, noulAnswer(0.2999999))).toBe("withheld");
        expect(status(raw, noulAnswer(0.7000001))).toBe("withheld");
    });

    it("checks every condition in a gate (they are ANDed)", () => {
        const def = choice({ show: { minProbability: 0.8, minConfidence: 0.5 } });
        expect(status(def, personaAnswer(0.9, 0.4))).toBe("withheld");
        expect(status(def, personaAnswer(0.9, 0.5))).toBe("suggested");
    });
});

describe("semantic outcomes, withheld, review and errors stay distinct", () => {
    it("reports none-of-the-above as a suggestion with outcome none and no value", () => {
        const result = evaluate(persona, personaAnswer(0.9, 0.9, "none_of_the_above"));
        expect(result.status).toBe("suggested");
        expect(result.status !== "error" && result.output).toMatchObject({
            outcome: "none",
            hasValue: false,
            display: "None of the above",
        });
    });

    it("reports insufficient information as outcome unknown", () => {
        const result = evaluate(persona, personaAnswer(0.9, 0.9, "insufficient"));
        expect(result.status !== "error" && result.output.outcome).toBe("unknown");
    });

    it("never makes a valueless outcome an apply candidate", () => {
        const def = choice({ autoApply: { minProbability: 0.5 } });
        const result = evaluate(def, personaAnswer(0.9, 0.9, "none_of_the_above"), "apply");
        expect(result.status).toBe("suggested");
        expect(result.status === "suggested" && result.decision.reason.code).toBe("no-value");
    });

    it("keeps a malformed answer out of the policy: parseAnswer rejects it first", () => {
        const parsed = parseAnswer({ type: "choice", choice: "nobody" }, buildQuestion(persona), model);
        expect(parsed.ok).toBe(false);
    });

    it("reports a value that doesn't fit the destination as a type-mismatch error", () => {
        const result = evaluatePolicy({
            definition: seniority,
            answer: seniorityAnswer(2.9, 0.9),
            context: {
                ...context,
                destination: { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: true },
            },
        });
        expect(result.status).toBe("error");
        expect(result.status === "error" && result.error.kind).toBe("type-mismatch");
    });
});

describe("decide", () => {
    it("receives the full answer, the row and column context, the candidate and the declarative decision", () => {
        const decide = vi.fn<[DecideContext], undefined>(() => undefined);
        const def = choice({ show: { minProbability: 0.8 }, decide: decide as never });
        const answer = personaAnswer(0.85, 0.3);
        const result = evaluatePolicy({ definition: def, answer, context, mode: "apply" });
        expect(result.status).toBe("suggested");
        expect(decide).toHaveBeenCalledTimes(1);
        const ctx = decide.mock.calls[0][0];
        expect(ctx.answer).toEqual(answer);
        expect(ctx.answer.type === "choice" && ctx.answer.probabilities).toEqual(answer.probabilities);
        expect(ctx.answer.type === "choice" && ctx.answer.confidence).toBe(0.3);
        expect(ctx.answer.model).toBe(model);
        expect(ctx).toMatchObject({ rowId: "row-7", columnId: "persona", row: 3, state: context.state, mode: "apply" });
        expect(ctx.definition).toBe(def);
        expect(ctx.candidate).toMatchObject({ value: "Champion", display: "Champion", outcome: "value" });
        expect(ctx.decision.status).toBe("suggested");
    });

    it("receives a Score's legend, probabilities and confidence", () => {
        let seen: DecideContext | undefined;
        const def: ScoreColumnDefinition = {
            ...seniority,
            policy: { decide: ctx => void (seen = ctx as DecideContext) },
        };
        const answer = seniorityAnswer(2.9, 0.4);
        evaluatePolicy({ definition: def, answer, context });
        expect(seen?.answer).toEqual(answer);
        expect(seen?.answer.type === "score" && seen.answer.legend["3"]).toEqual({
            what: "Executive",
            examples: ["VP", "C-level"],
        });
    });

    it("can inspect any option's probability, as in the SPST-16 example", () => {
        const def = choice({
            decide: ({ answer }) =>
                answer.probabilities.none_of_the_above > 0.3 ? { status: "review", reason: "ambiguous" } : undefined,
        });
        const ambiguous = personaAnswer(0.6, 0.5);
        const probabilities = { ...ambiguous.probabilities, economic: 0.05, none_of_the_above: 0.35 };
        const result = evaluate(def, { ...ambiguous, probabilities });
        expect(result.status).toBe("review");
        expect(result.status === "review" && result.decision.reason).toEqual({
            code: "decide",
            message: "review: ambiguous",
        });
        expect(status(def, personaAnswer(0.6, 0.5))).toBe("suggested");
    });

    it("keeps the declarative decision when it returns undefined", () => {
        const def = choice({ show: { minProbability: 0.8 }, decide: () => undefined });
        expect(status(def, personaAnswer(0.79, 0.9))).toBe("withheld");
    });

    it("may return withheld, review or suggested", () => {
        expect(status(choice({ decide: () => ({ status: "withheld" }) }), personaAnswer(0.9, 0.9))).toBe("withheld");
        expect(status(choice({ decide: () => ({ status: "review" }) }), personaAnswer(0.9, 0.9))).toBe("review");
        const upgraded = evaluate(
            choice({ show: { minProbability: 0.95 }, decide: () => ({ status: "suggested" }) }),
            personaAnswer(0.9, 0.9)
        );
        expect(upgraded.status === "suggested" && upgraded.decision.reason.message).toBe("suggested: set by decide");
    });

    it("can't create a value", () => {
        const def = choice({ decide: () => ({ status: "suggested", value: "INVENTED" }) as never });
        const result = evaluate(def, personaAnswer(0.9, 0.9, "economic"));
        expect(result.status !== "error" && result.output.value).toBe("ECON");
        const none = evaluate(def, personaAnswer(0.9, 0.9, "none_of_the_above"));
        expect(none.status !== "error" && none.output).toMatchObject({ hasValue: false, value: undefined });
    });

    it("can't change the answer, the candidate or the decision it is given", () => {
        const answer = noulAnswer(0.5);
        const attempts: ((ctx: DecideContext) => void)[] = [
            ctx => void Object.assign(ctx.candidate, { hasValue: true, value: true }),
            ctx => void Object.assign(ctx.answer, { noul: 0.99 }),
            ctx => void Object.assign(ctx.decision, { status: "apply-candidate" }),
        ];
        for (const attempt of attempts) {
            const def: NoulColumnDefinition = {
                ...ownsBudget,
                policy: {
                    autoApply: {},
                    decide: ctx => {
                        attempt(ctx as DecideContext);
                        return undefined;
                    },
                },
            };
            const result = evaluatePolicy({ definition: def, answer, context, mode: "apply" });
            expect(result.status === "error" && result.error.kind).toBe("policy-callback");
            expect(result.status === "error" && result.output).toMatchObject({ hasValue: false, value: undefined });
        }
        expect(answer).toEqual(noulAnswer(0.5));
        const probabilities = personaAnswer(0.9, 0.9);
        const def = choice({
            decide: ctx => {
                (ctx.answer.probabilities as Record<string, number>).champion = 0;
                return undefined;
            },
        });
        expect(evaluate(def, probabilities).status).toBe("error");
        expect(probabilities.probabilities.champion).toBe(0.9);
    });

    it("may return apply only when autoApply is configured; otherwise it is suggested with a configuration error", () => {
        const result = evaluate(choice({ decide: () => ({ status: "apply" }) }), personaAnswer(0.9, 0.9), "apply");
        expect(result.status).toBe("suggested");
        expect(result.status === "suggested" && result.configurationError).toMatchObject({
            kind: "configuration",
            columnId: "persona",
            retryable: false,
        });
    });

    it("turns apply into an apply candidate with autoApply, only in an apply run", () => {
        const def = choice({
            autoApply: { minProbability: 0.99 },
            decide: () => ({ status: "apply", reason: "trusted source" }),
        });
        const applied = evaluate(def, personaAnswer(0.9, 0.9), "apply");
        expect(applied.status).toBe("apply-candidate");
        expect(applied.status === "apply-candidate" && applied.decision.reason.message).toBe(
            "apply-candidate: trusted source"
        );
        expect(status(def, personaAnswer(0.9, 0.9), "suggest")).toBe("suggested");
    });

    it("turns a throw into a policy-callback error", () => {
        const def = choice({
            decide: () => {
                throw new Error("boom");
            },
        });
        const result = evaluate(def, personaAnswer(0.9, 0.9));
        expect(result.status).toBe("error");
        expect(result.status === "error" && result.error).toEqual({
            kind: "policy-callback",
            message: "decide threw: boom",
            retryable: false,
            cells: [["row-7", "persona"]],
        });
    });

    it("turns an invalid return into a policy-callback error", () => {
        for (const bad of [{ status: "accept" }, "review", null, { status: "review", reason: 3 }]) {
            const result = evaluate(choice({ decide: () => bad as never }), personaAnswer(0.9, 0.9));
            expect(result.status === "error" && result.error.kind).toBe("policy-callback");
        }
    });
});

describe("re-evaluation is pure", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("re-decides a stored answer under a new policy with no request and no mutation", () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const answer = Object.freeze(personaAnswer(0.9, 0.9));
        const before = JSON.stringify(answer);
        const loose = choice({ show: { minProbability: 0.8 } });
        const strict = choice({ show: { minProbability: 0.95 } });
        expect(status(loose, answer)).toBe("suggested");
        expect(status(strict, answer)).toBe("withheld");
        expect(status(loose, answer)).toBe("suggested");
        expect(JSON.stringify(answer)).toBe(before);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("is deterministic", () => {
        const def = choice({ show: { minProbability: 0.8 }, ready: { minConfidence: 0.9 } });
        const answer = personaAnswer(0.85, 0.5);
        expect(evaluate(def, answer)).toEqual(evaluate(def, answer));
    });
});
