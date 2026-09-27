import type { JevQuestion, AIJsonValue, ParsedJevAnswer } from "./types.js";

/** How far the sum of an answer's probabilities may be from 1. */
const probabilitySumTolerance = 0.01;
/** How far the selected Choice option may be below the highest probability. */
const choiceArgmaxTolerance = 1e-9;

/** The result of {@link parseJevAnswer}: a validated answer, or the reason it was rejected as malformed. */
export type ParseJevAnswerResult =
    { readonly ok: true; readonly answer: ParsedJevAnswer } | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnitInterval(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function sameKeys(actual: readonly string[], expected: readonly string[]): boolean {
    if (actual.length !== expected.length) return false;
    const expectedSet = new Set(expected);
    return actual.every(key => expectedSet.has(key));
}

type ProbabilityCheck =
    | { readonly ok: true; readonly probabilities: Record<string, number> }
    | { readonly ok: false; readonly reason: string };

function checkProbabilities(value: unknown, expectedKeys: readonly string[]): ProbabilityCheck {
    if (!isRecord(value)) return { ok: false, reason: "probabilities is missing or not an object" };
    const keys = Object.keys(value);
    if (!sameKeys(keys, expectedKeys)) {
        return {
            ok: false,
            reason: `probability keys [${keys.join(", ")}] don't match the criteria [${expectedKeys.join(", ")}]`,
        };
    }
    const probabilities: Record<string, number> = {};
    let sum = 0;
    for (const key of expectedKeys) {
        const p = value[key];
        if (!isUnitInterval(p))
            return { ok: false, reason: `probability for "${key}" is not a finite number in [0, 1]` };
        probabilities[key] = p;
        sum += p;
    }
    if (sum < 1 - probabilitySumTolerance || sum > 1 + probabilitySumTolerance) {
        return { ok: false, reason: `probabilities sum to ${sum}, outside 1 ± ${probabilitySumTolerance}` };
    }
    return { ok: true, probabilities };
}

/**
 * Validates one raw Jev answer against the question it answers, and attaches the
 * response's model id. This is step 2 of the result precedence: any rejection
 * makes the cell a `malformed` error and the policy is not evaluated.
 *
 * An answer is rejected when:
 * - the response has no `model` (a non-empty string)
 * - the answer isn't an object, or its `type` isn't the question's type
 * - a Choice `choice` isn't one of the question's options
 * - the probability keys don't exactly match the criteria (option ids, or `"0"`…`"n-1"` for a Score)
 * - a probability, confidence or Noul value is non-finite or outside [0, 1]
 * - the probabilities sum to something outside 1 ± 0.01
 * - a Score is non-finite or outside [0, n − 1]
 * - a Choice `choice` isn't the maximum-probability option (tolerance 1e-9)
 * - a Score `legend` is present but isn't an object
 *
 * A Score answer without a `legend` gets one built from the question's criteria.
 * The function is pure.
 *
 * @param raw - The value under `answers[questionId]` in the response.
 * @param question - The question that was sent under that id.
 * @param model - The response's top-level `model`.
 */
export function parseJevAnswer(raw: unknown, question: JevQuestion, model: unknown): ParseJevAnswerResult {
    if (typeof model !== "string" || model === "") return { ok: false, reason: "the response has no model id" };
    if (!isRecord(raw)) return { ok: false, reason: "the answer is missing or not an object" };
    if (raw.type !== question.type) {
        return {
            ok: false,
            reason: `answer type ${JSON.stringify(raw.type)} doesn't match question type "${question.type}"`,
        };
    }

    switch (question.type) {
        case "choice": {
            const optionIds = Object.keys(question.criteria);
            const choice = raw.choice;
            if (typeof choice !== "string" || !optionIds.includes(choice)) {
                return { ok: false, reason: `choice ${JSON.stringify(choice)} is not one of the options` };
            }
            const checked = checkProbabilities(raw.probabilities, optionIds);
            if (!checked.ok) return checked;
            if (!isUnitInterval(raw.confidence))
                return { ok: false, reason: "confidence is not a finite number in [0, 1]" };
            const max = Math.max(...Object.values(checked.probabilities));
            if (checked.probabilities[choice] < max - choiceArgmaxTolerance) {
                return { ok: false, reason: `choice "${choice}" is not the maximum-probability option` };
            }
            return {
                ok: true,
                answer: {
                    type: "choice",
                    choice,
                    probabilities: checked.probabilities,
                    confidence: raw.confidence,
                    model,
                },
            };
        }
        case "score": {
            const levels = question.criteria.length;
            const score = raw.score;
            if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > levels - 1) {
                return {
                    ok: false,
                    reason: `score ${JSON.stringify(score)} is not a finite number in [0, ${levels - 1}]`,
                };
            }
            const levelKeys = question.criteria.map((_, i) => String(i));
            const checked = checkProbabilities(raw.probabilities, levelKeys);
            if (!checked.ok) return checked;
            if (!isUnitInterval(raw.confidence))
                return { ok: false, reason: "confidence is not a finite number in [0, 1]" };
            let legend: Record<string, AIJsonValue>;
            if (raw.legend === undefined) {
                legend = Object.fromEntries(question.criteria.map((level, i) => [String(i), level]));
            } else if (isRecord(raw.legend)) {
                legend = { ...(raw.legend as Record<string, AIJsonValue>) };
            } else {
                return { ok: false, reason: "legend is not an object" };
            }
            return {
                ok: true,
                answer: {
                    type: "score",
                    score,
                    legend,
                    probabilities: checked.probabilities,
                    confidence: raw.confidence,
                    model,
                },
            };
        }
        case "noul": {
            if (!isUnitInterval(raw.noul)) return { ok: false, reason: "noul is not a finite number in [0, 1]" };
            return { ok: true, answer: { type: "noul", noul: raw.noul, model } };
        }
    }
}
