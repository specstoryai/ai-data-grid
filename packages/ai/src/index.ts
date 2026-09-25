/**
 * `@specstory/ai-data-grid-ai`: developer-configured AI Fill for AI Data Grid,
 * powered by Jev. In development and not published.
 */

export type {
    AnswerFor,
    ChoiceAnswer,
    JevAnswer,
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
    JsonObject,
    JsonValue,
    NoulAnswer,
    ParsedAnswer,
    ScoreAnswer,
} from "./contract/types.js";
export { parseAnswer, type ParseAnswerResult } from "./contract/parse-answer.js";

export type * from "./config/types.js";
export type * from "./config/results.js";
export { validateAIFillConfig, type AIFillConfigIssue, type ValidateAIFillConfigOptions } from "./config/validate.js";

export { canonicalJson } from "./identity/canonical-json.js";
export {
    buildQuestion,
    cacheKey,
    inputFingerprint,
    questionFingerprint,
    resolveModel,
    shortHash,
    type CacheKeyParts,
} from "./identity/fingerprints.js";

export { defaultIsEmpty, defaultToCell } from "./policy/cells.js";
export {
    defaultNoulLabels,
    defaultPrecision,
    mapOutput,
    noulBand,
    scoreLevel,
    scoreLevelLabel,
    type MapOutputError,
    type MapOutputResult,
} from "./policy/map-output.js";
export {
    choiceMargin,
    evaluatePolicy,
    type EvaluatePolicyInput,
    type PolicyEvaluation,
} from "./policy/evaluate-policy.js";
export {
    applyValidation,
    cellData,
    checkCommitGuards,
    destinationUnchanged,
    identityMatches,
    isWritableCell,
    overwriteAllows,
    sameCellData,
    type CommitBlockReason,
    type CommitGuardInput,
    type CommitGuardResult,
    type CommitSource,
    type OverwriteCheck,
    type ResultIdentity,
} from "./policy/commit-guards.js";
