/**
 * AI Fill: developer-configured AI Fill for AI Data Grid, powered by Jev.
 *
 * This is the internal barrel that `src/index.ts` re-exports. It lists only
 * the public names; every other helper stays internal and is imported from
 * the module that defines it.
 */

import * as parseAnswer from "./contract/parse-answer.js";
import * as validate from "./config/validate.js";
import * as cells from "./policy/cells.js";
import * as mapOutput from "./policy/map-output.js";
import * as evaluatePolicy from "./policy/evaluate-policy.js";

export type {
    AIJsonObject,
    AIJsonValue,
    ChoiceAnswer,
    JevAnswer,
    JevAnswerFor,
    JevChoiceAnswer,
    JevChoiceQuestion,
    JevInstructions,
    JevNoulAnswer,
    JevNoulQuestion,
    JevPrimitive,
    JevQuestion,
    JevRequest,
    JevResponse,
    JevScoreAnswer,
    JevScoreQuestion,
    JevState,
    NoulAnswer,
    ParsedJevAnswer,
    ScoreAnswer,
} from "./contract/types.js";
export type { ParseJevAnswerResult } from "./contract/parse-answer.js";
export type { JevEndpointErrorBody } from "./contract/endpoint.js";

export type * from "./config/types.js";
export type * from "./config/results.js";
export type { AIFillApi, AIFillTarget, AICellState, AIRunState } from "./config/api.js";
export type { AIFillConfigIssue, ValidateAIFillConfigOptions } from "./config/validate.js";

export type { MapAIOutputError, MapAIOutputResult } from "./policy/map-output.js";
export type { EvaluateAIPolicyInput, AIPolicyEvaluation } from "./policy/evaluate-policy.js";

// The public functions are constants read from module namespaces rather than
// `export { … } from` re-exports. With a re-export, esbuild's code splitting
// loads the modules in a grid's initial chunk once the lazy AI chunk also
// imports them, even when the app never calls them (SPST-17 A7).

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
export const parseJevAnswer: typeof parseAnswer.parseJevAnswer = parseAnswer.parseJevAnswer;

/**
 * Checks an AI Fill configuration and returns every problem found, each with a
 * path and a message. An empty list means the configuration is valid. An issue
 * with a `columnId` disables that column; one without disables AI Fill for the
 * grid.
 *
 * It checks the structure (connection shape, direct mode's
 * `dangerouslyAllowBrowser` in browsers, `model`, `rows.getRowId`, AI columns
 * matching grid column ids, sources, 2–255 Choice options, 2–10 Score levels,
 * Noul bands for `boolean` and `label`) and the policies: thresholds finite and
 * in [0, 1] (Score `score` bounds in [0, levels − 1]), `min <= max`, Noul
 * `falseAtOrBelow < trueAtOrAbove`, referenced option and level ids exist, no
 * confidence measure on a Noul, gates monotonic (`show` ≤ `ready` ≤ `autoApply`
 * for every shared `min`, the reverse for every `max`), and no `autoApply` with
 * `overwrite: "never"` alongside the `column` scope. Messages never include the
 * API key.
 */
export const validateAIFillConfig: typeof validate.validateAIFillConfig = validate.validateAIFillConfig;

/**
 * The default empty-destination test:
 * - Text, Uri, Markdown and row-id cells: `""`, `null` or `undefined`
 * - Number: `undefined`, `null` or `NaN`
 * - Boolean: `null` (`BooleanEmpty`) or `undefined`
 * - the cells package's dropdown cell: a `value` of `""`, `null` or `undefined`
 * - other custom cells: `data` is `null` or `undefined`
 * - Image, Bubble and Drilldown: no items
 * - Loading and Protected: never empty (they are skipped for their own reasons)
 *
 * **`0` and `false` are values, not empty.**
 */
export const isAIDestinationEmpty: typeof cells.isAIDestinationEmpty = cells.isAIDestinationEmpty;

/**
 * Maps a validated answer to the grid (step 4 of the result precedence). It
 * returns three separate things: the raw `answer`, the `display` text and the
 * `value` to commit (with `hasValue`), plus the semantic outcome. When
 * `ctx.destination` is given and there is a value, it also builds the
 * destination `cell` with `output.toCell` (by default, the built-in mapping for Text, Number, Boolean and the cells package's dropdown).
 *
 * Fails with `type-mismatch` when the value can't be produced or doesn't fit
 * the destination (including when `output.store`, `output.format` or
 * `output.toCell` throws), and with `configuration` when the mapping is
 * incomplete. The function is pure as long as those callbacks are.
 *
 * - **Choice:** the selected option's `value`, else its `label`, else its id. A
 *   semantic outcome (`none` / `unknown`) has a value only when the option sets one.
 * - **Score:** by `output.store` (default `"score"` rounded to `precision`, default 2).
 * - **Noul:** by `output.store`: the probability rounded to `precision`, or
 *   `true` / `false` (`boolean`) or the labels (`label`) by the bands. The middle
 *   band has no value and displays `labels.uncertain` ("Uncertain"), never "No".
 */
export const mapAIOutput: typeof mapOutput.mapAIOutput = mapOutput.mapAIOutput;

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
export const evaluateAIPolicy: typeof evaluatePolicy.evaluateAIPolicy = evaluatePolicy.evaluateAIPolicy;
