import type { ChoiceAnswer, NoulAnswer, ParsedJevAnswer, ScoreAnswer } from "../contract/types.js";
import type {
    AICellContext,
    AIColumnDefinition,
    AIFillMode,
    AIRange,
    ChoiceGate,
    AIDecideContext,
    AIDecideResult,
    NoulGate,
    ScoreGate,
} from "../config/types.js";
import type {
    AIFillError,
    AIDecisionReason,
    AIGateName,
    AIMappedOutput,
    AIPolicyDecision,
    AIPolicyStatus,
} from "../config/results.js";
import { mapAIOutput } from "./map-output.js";

/** Input to {@link evaluateAIPolicy}. */
export interface EvaluateAIPolicyInput {
    readonly definition: AIColumnDefinition;
    /** A validated answer from `parseJevAnswer`. */
    readonly answer: ParsedJevAnswer;
    /** The cell. Pass `destination` to have the value checked against the destination cell. */
    readonly context: AICellContext;
    /** `"apply"` for a "Fill and apply" run. Default `"suggest"`, in which nothing is an apply candidate. */
    readonly mode?: AIFillMode;
}

/** The result of {@link evaluateAIPolicy}: a decision, or an error for the cell. */
export type AIPolicyEvaluation =
    | {
          readonly status: AIPolicyStatus;
          readonly decision: AIPolicyDecision;
          readonly output: AIMappedOutput;
          /** Set when `decide` returned `apply` for a column without `autoApply`. Report it once per column. */
          readonly configurationError?: AIFillError;
      }
    | {
          readonly status: "error";
          /** `type-mismatch` or `configuration` from mapping, or `policy-callback` from `decide`. */
          readonly error: AIFillError;
          readonly output?: AIMappedOutput;
      };

interface GateFailure {
    readonly measure: string;
    readonly actual: number | string;
    readonly threshold: number | readonly string[];
    readonly message: string;
}

const decideStatuses: ReadonlySet<unknown> = new Set(["withheld", "review", "suggested", "apply"]);

function checkMin(
    gate: AIGateName,
    measure: string,
    label: string,
    actual: number,
    threshold: number | undefined
): GateFailure | undefined {
    if (threshold === undefined || actual >= threshold) return undefined;
    return { measure, actual, threshold, message: `${label} ${actual} < ${gate}.${measure} ${threshold}` };
}

function checkRange(
    gate: AIGateName,
    measure: string,
    label: string,
    actual: number,
    range: AIRange | undefined
): GateFailure | undefined {
    if (range === undefined) return undefined;
    const min = checkMin(gate, `${measure}.min`, label, actual, range.min);
    if (min !== undefined) return min;
    if (range.max === undefined || actual <= range.max) return undefined;
    return {
        measure: `${measure}.max`,
        actual,
        threshold: range.max,
        message: `${label} ${actual} > ${gate}.${measure}.max ${range.max}`,
    };
}

function firstFailure(checks: readonly (() => GateFailure | undefined)[]): GateFailure | undefined {
    for (const check of checks) {
        const failure = check();
        if (failure !== undefined) return failure;
    }
    return undefined;
}

/** The difference between the highest and second-highest option probabilities. */
export function choiceMargin(answer: ChoiceAnswer): number {
    const sorted = Object.values(answer.probabilities).sort((a, b) => b - a);
    return sorted[0] - (sorted[1] ?? 0);
}

function checkChoiceGate(name: AIGateName, gate: ChoiceGate, answer: ChoiceAnswer): GateFailure | undefined {
    const { choice, probabilities } = answer;
    return firstFailure([
        () => checkMin(name, "minProbability", "probability", probabilities[choice], gate.minProbability),
        () => checkMin(name, "minConfidence", "confidence", answer.confidence, gate.minConfidence),
        () => checkMin(name, "minMargin", "margin", choiceMargin(answer), gate.minMargin),
        () => {
            const allowed = gate.options?.in;
            if (allowed === undefined || allowed.includes(choice)) return undefined;
            return {
                measure: "options.in",
                actual: choice,
                threshold: allowed,
                message: `choice "${choice}" is not in ${name}.options.in`,
            };
        },
        () => {
            const denied = gate.options?.notIn;
            if (denied === undefined || !denied.includes(choice)) return undefined;
            return {
                measure: "options.notIn",
                actual: choice,
                threshold: denied,
                message: `choice "${choice}" is in ${name}.options.notIn`,
            };
        },
        ...Object.keys(gate.optionProbability ?? {})
            .sort()
            .map(
                id => () =>
                    checkRange(
                        name,
                        `optionProbability.${id}`,
                        `probability of "${id}"`,
                        probabilities[id],
                        gate.optionProbability?.[id]
                    )
            ),
    ]);
}

function checkScoreGate(name: AIGateName, gate: ScoreGate, answer: ScoreAnswer): GateFailure | undefined {
    const levelProbability = (gate.levelProbability ?? {}) as Readonly<Record<string, AIRange>>;
    return firstFailure([
        () => checkMin(name, "minConfidence", "confidence", answer.confidence, gate.minConfidence),
        () => checkRange(name, "score", "score", answer.score, gate.score),
        ...Object.keys(levelProbability)
            .sort((a, b) => Number(a) - Number(b))
            .map(
                level => () =>
                    checkRange(
                        name,
                        `levelProbability.${level}`,
                        `probability of level ${level}`,
                        answer.probabilities[level],
                        levelProbability[level]
                    )
            ),
    ]);
}

function checkNoulGate(name: AIGateName, gate: NoulGate, answer: NoulAnswer): GateFailure | undefined {
    return checkRange(name, "noul", "noul", answer.noul, gate.noul);
}

function checkGate(definition: AIColumnDefinition, name: AIGateName, answer: ParsedJevAnswer): GateFailure | undefined {
    switch (definition.primitive) {
        case "choice": {
            const gate = definition.policy?.[name];
            return gate === undefined ? undefined : checkChoiceGate(name, gate, answer as ChoiceAnswer);
        }
        case "score": {
            const gate = definition.policy?.[name];
            return gate === undefined ? undefined : checkScoreGate(name, gate, answer as ScoreAnswer);
        }
        case "noul": {
            const gate = definition.policy?.[name];
            return gate === undefined ? undefined : checkNoulGate(name, gate, answer as NoulAnswer);
        }
    }
}

function gateFailed(status: AIPolicyStatus, gate: AIGateName, failure: GateFailure): AIPolicyDecision {
    return {
        status,
        reason: {
            code: "gate-failed",
            gate,
            measure: failure.measure,
            actual: failure.actual,
            threshold: failure.threshold,
            message: `${status}: ${failure.message}`,
        },
    };
}

function suggested(code: AIDecisionReason["code"], message: string): AIPolicyDecision {
    return { status: "suggested", reason: { code, message: `suggested: ${message}` } };
}

function deepFreeze<T>(value: T): T {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const member of Object.values(value)) deepFreeze(member);
    }
    return value;
}

/**
 * Frozen copies of the answer and candidate for `decide`, so the callback can't
 * change the stored answer or give a result a value. The answer is plain JSON,
 * so it is deep-copied; the candidate's cell and value are the app's own objects
 * and are copied one level deep.
 */
function callbackView(output: AIMappedOutput): { answer: ParsedJevAnswer; candidate: AIMappedOutput } {
    const answer = deepFreeze(JSON.parse(JSON.stringify(output.answer)) as ParsedJevAnswer);
    const cell = output.cell === undefined ? {} : { cell: Object.freeze({ ...output.cell }) };
    return { answer, candidate: Object.freeze({ ...output, answer, ...cell }) };
}

/** Resolves a would-be apply candidate against the run mode and whether there is a value. */
function applyCandidate(mode: AIFillMode, output: AIMappedOutput, reason: AIDecisionReason): AIPolicyDecision {
    if (mode !== "apply")
        return suggested("apply-not-requested", "qualifies for auto-apply, but this isn't a Fill and apply run");
    if (!output.hasValue) return suggested("no-value", "qualifies for auto-apply, but there is no value to write");
    return { status: "apply-candidate", reason };
}

function declarativeDecision(
    definition: AIColumnDefinition,
    output: AIMappedOutput,
    mode: AIFillMode
): AIPolicyDecision {
    const answer = output.answer;
    const show = checkGate(definition, "show", answer);
    if (show !== undefined) return gateFailed("withheld", "show", show);

    if (output.band === "between" && definition.primitive === "noul") {
        const bands = definition.output?.bands;
        const status = bands?.between === "withhold" ? "withheld" : "review";
        return {
            status,
            reason: {
                code: "band",
                actual: (answer as NoulAnswer).noul,
                message: `${status}: noul ${(answer as NoulAnswer).noul} is between ${bands?.falseAtOrBelow} and ${bands?.trueAtOrAbove}`,
            },
        };
    }

    const ready = checkGate(definition, "ready", answer);
    if (ready !== undefined) return gateFailed("review", "ready", ready);

    if (definition.policy?.autoApply === undefined) return suggested("passed", "every configured gate passed");
    const autoApply = checkGate(definition, "autoApply", answer);
    if (autoApply !== undefined) {
        return mode === "apply"
            ? gateFailed("suggested", "autoApply", autoApply)
            : suggested("passed", "every configured gate passed");
    }
    return applyCandidate(mode, output, {
        code: "passed",
        gate: "autoApply",
        message: "apply-candidate: passed autoApply",
    });
}

/**
 * Decides one validated answer (steps 4–6 of the result precedence). It maps
 * the answer with `mapAIOutput`, then:
 *
 * 5. `show` fails → `withheld`; a Noul in the middle band of a `boolean` or
 *    `label` mapping → `review` (or `withheld` with `between: "withhold"`);
 *    `ready` fails → `review`; otherwise `suggested`. A suggested result that
 *    passes `autoApply` is an `apply-candidate`, but only in `"apply"` mode and
 *    only when there is a value to write.
 * 6. `decide`, when configured, receives the full answer, the cell context,
 *    the candidate and the declarative decision. It may return `withheld`,
 *    `review`, `suggested` or `apply`, or `undefined` to keep the decision. It
 *    can't create a value. `apply` counts only when the column configures
 *    `autoApply` (otherwise the result is `suggested` and `configurationError`
 *    is set). A throw or an invalid return is a `policy-callback` error.
 *
 * Every comparison is exact: a `min` passes at `value >= min`, a `max` at
 * `value <= max`, on the raw doubles, with no epsilon or rounding. A gate reads
 * only the measure it names, so confidence never stands in for probability.
 *
 * It makes no request and has no side effects beyond the configured callbacks,
 * so re-running it on a stored answer after a policy change is free.
 */
export function evaluateAIPolicy(input: EvaluateAIPolicyInput): AIPolicyEvaluation {
    const { definition, answer, context } = input;
    const mode = input.mode ?? "suggest";
    const cells = [[context.rowId, context.columnId] as const];

    const mapped = mapAIOutput(definition, answer, context);
    if (!mapped.ok) {
        return {
            status: "error",
            error: { kind: mapped.error.kind, message: mapped.error.message, retryable: false, cells },
        };
    }
    const output = mapped.output;
    const decision = declarativeDecision(definition, output, mode);

    const decide = definition.policy?.decide as ((ctx: AIDecideContext) => AIDecideResult) | undefined;
    if (decide === undefined) return { status: decision.status, decision, output };

    let result: AIDecideResult;
    try {
        const view = callbackView(output);
        result = decide({
            ...context,
            ...view,
            definition,
            decision: Object.freeze({ ...decision, reason: Object.freeze({ ...decision.reason }) }),
            mode,
        });
    } catch (error) {
        return {
            status: "error",
            error: {
                kind: "policy-callback",
                message: `decide threw: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
                cells,
            },
            output,
        };
    }
    if (result === undefined) return { status: decision.status, decision, output };
    if (
        typeof result !== "object" ||
        result === null ||
        !decideStatuses.has(result.status) ||
        (result.reason !== undefined && typeof result.reason !== "string")
    ) {
        return {
            status: "error",
            error: {
                kind: "policy-callback",
                message: "decide returned an invalid result; expected undefined or { status, reason? }",
                retryable: false,
                cells,
            },
            output,
        };
    }

    const detail = result.reason ?? "set by decide";
    if (result.status === "apply") {
        if (definition.policy?.autoApply === undefined) {
            const fallback = suggested(
                "decide",
                `decide returned apply, but the column has no autoApply gate (${detail})`
            );
            return {
                status: fallback.status,
                decision: fallback,
                output,
                configurationError: {
                    kind: "configuration",
                    message: `decide returned "apply" for column "${context.columnId}", which has no policy.autoApply; treated as suggested`,
                    retryable: false,
                    columnId: context.columnId,
                },
            };
        }
        const applied = applyCandidate(mode, output, { code: "decide", message: `apply-candidate: ${detail}` });
        return { status: applied.status, decision: applied, output };
    }
    const decided: AIPolicyDecision = {
        status: result.status,
        reason: { code: "decide", message: `${result.status}: ${detail}` },
    };
    return { status: decided.status, decision: decided, output };
}
