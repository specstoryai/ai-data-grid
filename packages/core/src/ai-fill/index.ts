/**
 * AI Fill: developer-configured AI Fill for AI Data Grid, powered by Jev.
 *
 * This is the internal barrel that `src/index.ts` re-exports. It lists only
 * the public names; every other helper stays internal and is imported from
 * the module that defines it.
 */

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
export { parseJevAnswer, type ParseJevAnswerResult } from "./contract/parse-answer.js";
export type { JevEndpointErrorBody } from "./contract/endpoint.js";

export type * from "./config/types.js";
export type * from "./config/results.js";
export type * from "./config/api.js";
export { validateAIFillConfig, type AIFillConfigIssue, type ValidateAIFillConfigOptions } from "./config/validate.js";

export { isAIDestinationEmpty } from "./policy/cells.js";
export { mapAIOutput, type MapAIOutputError, type MapAIOutputResult } from "./policy/map-output.js";
export { evaluateAIPolicy, type EvaluateAIPolicyInput, type AIPolicyEvaluation } from "./policy/evaluate-policy.js";
