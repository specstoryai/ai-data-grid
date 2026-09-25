import { describe, expect, it } from "vitest";
import { parseAnswer, type JevQuestion } from "../src/index.js";
import {
    choiceRequest,
    choiceResponse,
    noulRequest,
    noulResponse,
    scoreRequest,
    scoreResponse,
} from "./fixtures/jev-contract.js";

const choiceQuestion: JevQuestion = choiceRequest.questions.department;
const scoreQuestion: JevQuestion = scoreRequest.questions.question_id;
const noulQuestion: JevQuestion = noulRequest.questions.is_repeat_contact;

const validChoice = choiceResponse.answers.department;
const validScore = scoreResponse.answers.question_id;

function rejects(raw: unknown, question: JevQuestion, model: unknown = "jev-1.13.0"): string {
    const result = parseAnswer(raw, question, model);
    if (result.ok) throw new Error("expected a rejection");
    return result.reason;
}

describe("parseAnswer: contract fixture", () => {
    it("parses the documented Choice response and attaches the model", () => {
        const result = parseAnswer(validChoice, choiceQuestion, choiceResponse.model);
        expect(result).toEqual({
            ok: true,
            answer: {
                type: "choice",
                choice: "returns",
                probabilities: { returns: 1, shipping: 0, billing: 0 },
                confidence: 1,
                model: "jev-1.13.0",
            },
        });
    });

    it("parses the documented Score response, keeping its legend", () => {
        const result = parseAnswer(validScore, scoreQuestion, scoreResponse.model);
        expect(result).toEqual({
            ok: true,
            answer: {
                type: "score",
                score: 1.43,
                confidence: 0.35,
                legend: { "0": "Level 0 description", "1": "Level 1 description", "2": "Level 2 description" },
                probabilities: { "0": 0, "1": 0.57, "2": 0.43 },
                model: "jev-1.13.0",
            },
        });
    });

    it("parses both documented Noul answers, with and without criteria", () => {
        expect(
            parseAnswer(
                noulResponse.answers.is_human_escalation,
                noulRequest.questions.is_human_escalation,
                noulResponse.model
            )
        ).toEqual({
            ok: true,
            answer: { type: "noul", noul: 0.99, model: "jev-1.13.0" },
        });
        expect(parseAnswer(noulResponse.answers.is_repeat_contact, noulQuestion, noulResponse.model)).toEqual({
            ok: true,
            answer: { type: "noul", noul: 0.93, model: "jev-1.13.0" },
        });
    });

    it("treats a Noul of exactly 0 as a valid strong no", () => {
        expect(parseAnswer({ type: "noul", noul: 0 }, noulQuestion, "jev-1.13.0")).toEqual({
            ok: true,
            answer: { type: "noul", noul: 0, model: "jev-1.13.0" },
        });
    });

    it("builds a Score legend from the criteria when the answer has none", () => {
        const { legend: _legend, ...withoutLegend } = validScore;
        const result = parseAnswer(withoutLegend, scoreQuestion, "jev-1.13.0");
        expect(result.ok && result.answer.type === "score" ? result.answer.legend : undefined).toEqual({
            "0": "Level 0 description",
            "1": "Level 1 description",
            "2": "Level 2 description",
        });
    });

    it("drops unknown fields", () => {
        const result = parseAnswer({ ...validChoice, extra: "x" }, choiceQuestion, "jev-1.13.0");
        expect(result.ok && "extra" in result.answer).toBe(false);
    });
});

describe("parseAnswer: rejection rules", () => {
    it("rejects a response without a model", () => {
        expect(parseAnswer(validChoice, choiceQuestion, undefined)).toEqual({
            ok: false,
            reason: "the response has no model id",
        });
        expect(rejects(validChoice, choiceQuestion, "")).toMatch(/no model/);
        expect(rejects(validChoice, choiceQuestion, 13)).toMatch(/no model/);
    });

    it("rejects a missing or non-object answer", () => {
        expect(rejects(undefined, choiceQuestion)).toMatch(/missing or not an object/);
        expect(rejects([validChoice], choiceQuestion)).toMatch(/missing or not an object/);
    });

    it("rejects the wrong type", () => {
        expect(rejects({ ...validChoice, type: "score" }, choiceQuestion)).toMatch(
            /doesn't match question type "choice"/
        );
        expect(rejects({ type: "choice", choice: "x" }, noulQuestion)).toMatch(/doesn't match question type "noul"/);
    });

    it("rejects a choice that isn't one of the options", () => {
        expect(rejects({ ...validChoice, choice: "refunds" }, choiceQuestion)).toMatch(/not one of the options/);
        expect(rejects({ ...validChoice, choice: 1 }, choiceQuestion)).toMatch(/not one of the options/);
    });

    it("rejects probability keys that don't match the criteria", () => {
        expect(rejects({ ...validChoice, probabilities: { returns: 1, shipping: 0 } }, choiceQuestion)).toMatch(
            /don't match/
        );
        expect(
            rejects(
                { ...validChoice, probabilities: { returns: 1, shipping: 0, billing: 0, other: 0 } },
                choiceQuestion
            )
        ).toMatch(/don't match/);
        expect(rejects({ ...validScore, probabilities: { "1": 0.57, "2": 0.43, "3": 0 } }, scoreQuestion)).toMatch(
            /don't match/
        );
        expect(rejects({ ...validChoice, probabilities: undefined }, choiceQuestion)).toMatch(
            /probabilities is missing/
        );
    });

    it("rejects probabilities that are non-finite or outside [0, 1]", () => {
        expect(
            rejects({ ...validChoice, probabilities: { returns: 1.2, shipping: -0.2, billing: 0 } }, choiceQuestion)
        ).toMatch(/"returns" is not a finite number in \[0, 1\]/);
        expect(
            rejects({ ...validChoice, probabilities: { returns: 1, shipping: -0, billing: -0.01 } }, choiceQuestion)
        ).toMatch(/"billing"/);
        expect(
            rejects({ ...validChoice, probabilities: { returns: NaN, shipping: 0, billing: 0 } }, choiceQuestion)
        ).toMatch(/"returns"/);
        expect(
            rejects({ ...validChoice, probabilities: { returns: "1", shipping: 0, billing: 0 } }, choiceQuestion)
        ).toMatch(/"returns"/);
    });

    it("rejects confidence that is missing, non-finite or outside [0, 1]", () => {
        expect(rejects({ ...validChoice, confidence: 1.01 }, choiceQuestion)).toMatch(/confidence/);
        expect(rejects({ ...validChoice, confidence: undefined }, choiceQuestion)).toMatch(/confidence/);
        expect(rejects({ ...validScore, confidence: Infinity }, scoreQuestion)).toMatch(/confidence/);
    });

    it("rejects a Noul that is non-finite or outside [0, 1]", () => {
        expect(rejects({ type: "noul", noul: 1.0001 }, noulQuestion)).toMatch(/noul is not/);
        expect(rejects({ type: "noul", noul: -0.1 }, noulQuestion)).toMatch(/noul is not/);
        expect(rejects({ type: "noul" }, noulQuestion)).toMatch(/noul is not/);
    });

    it("rejects probabilities that sum outside 1 ± 0.01, and accepts inside it", () => {
        expect(
            rejects({ ...validChoice, probabilities: { returns: 0.9, shipping: 0.08, billing: 0 } }, choiceQuestion)
        ).toMatch(/sum to 0.98/);
        expect(rejects({ ...validScore, probabilities: { "0": 0.1, "1": 0.57, "2": 0.43 } }, scoreQuestion)).toMatch(
            /sum to/
        );
        expect(
            parseAnswer(
                { ...validChoice, probabilities: { returns: 0.995, shipping: 0, billing: 0 } },
                choiceQuestion,
                "m"
            ).ok
        ).toBe(true);
    });

    it("accepts sums of exactly 0.99 and 1.01", () => {
        const at = (returns: number, shipping: number) =>
            parseAnswer({ ...validChoice, probabilities: { returns, shipping, billing: 0 } }, choiceQuestion, "m").ok;
        expect(at(0.5, 0.49)).toBe(true);
        expect(at(0.51, 0.5)).toBe(true);
        expect(at(0.5, 0.4899)).toBe(false);
        expect(at(0.51, 0.5001)).toBe(false);
    });

    it("rejects a Score outside [0, n − 1]", () => {
        expect(rejects({ ...validScore, score: -0.01 }, scoreQuestion)).toMatch(/not a finite number in \[0, 2\]/);
        expect(rejects({ ...validScore, score: 2.01 }, scoreQuestion)).toMatch(/not a finite number in \[0, 2\]/);
        expect(rejects({ ...validScore, score: "1.4" }, scoreQuestion)).toMatch(/score/);
        expect(parseAnswer({ ...validScore, score: 2 }, scoreQuestion, "m").ok).toBe(true);
        expect(parseAnswer({ ...validScore, score: 0 }, scoreQuestion, "m").ok).toBe(true);
    });

    it("rejects a choice that isn't the maximum-probability option", () => {
        const probabilities = { returns: 0.4, shipping: 0.6, billing: 0 };
        expect(rejects({ ...validChoice, probabilities }, choiceQuestion)).toMatch(
            /not the maximum-probability option/
        );
    });

    it("accepts a choice tied with the maximum, within 1e-9", () => {
        expect(
            parseAnswer(
                { ...validChoice, probabilities: { returns: 0.5, shipping: 0.5, billing: 0 } },
                choiceQuestion,
                "m"
            ).ok
        ).toBe(true);
        expect(
            parseAnswer(
                { ...validChoice, probabilities: { returns: 0.5 - 5e-10, shipping: 0.5 + 5e-10, billing: 0 } },
                choiceQuestion,
                "m"
            ).ok
        ).toBe(true);
        expect(
            rejects(
                { ...validChoice, probabilities: { returns: 0.5 - 1e-6, shipping: 0.5 + 1e-6, billing: 0 } },
                choiceQuestion
            )
        ).toMatch(/maximum-probability/);
    });

    it("rejects a Score legend that isn't an object", () => {
        expect(rejects({ ...validScore, legend: ["a", "b", "c"] }, scoreQuestion)).toMatch(/legend is not an object/);
    });
});
