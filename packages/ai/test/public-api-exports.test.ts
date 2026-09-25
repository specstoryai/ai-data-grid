import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Guards the public API against accidental drift: the sorted export names of
 * each entry point must match these lists exactly. Adding or removing an
 * export must be deliberate — update the list in the same change and say why
 * in the PR description.
 *
 * `/server` and `/testing` are empty until the execution work package (WP-AI2)
 * adds `createJevHandler`, `toNodeListener` and `createMockJev`.
 */
const expectedExports: Record<string, readonly string[]> = {
    "src/index.ts": [
        "AICellContext",
        "AICellStatus",
        "AIColumnDefinition",
        "AIColumnDefinitionBase",
        "AIColumnDefinitionFor",
        "AICommitEdit",
        "AICommitEvent",
        "AIFillConfig",
        "AIFillConfigIssue",
        "AIFillConnection",
        "AIFillCustomConnection",
        "AIFillDirectConnection",
        "AIFillEndpointConnection",
        "AIFillError",
        "AIFillErrorKind",
        "AIFillExecutionOptions",
        "AIFillMode",
        "AIFillRows",
        "AIFillScope",
        "AIOutputBase",
        "AIOverwritePolicy",
        "AIPolicy",
        "AIRange",
        "AIRejectEvent",
        "AIResultEvent",
        "AIResultMetadata",
        "AIRowContext",
        "AIRowScope",
        "AIRunProgressEvent",
        "AIRunStartEvent",
        "AIRunSummary",
        "AISkipReason",
        "AnswerFor",
        "CacheKeyParts",
        "ChoiceAnswer",
        "ChoiceColumnDefinition",
        "ChoiceGate",
        "ChoiceOption",
        "ChoicePolicy",
        "ChoicePresentation",
        "ColumnId",
        "CommitBlockReason",
        "CommitGuardInput",
        "CommitGuardResult",
        "CommitSource",
        "DecideContext",
        "DecideResult",
        "DecideStatus",
        "DecisionReason",
        "EvaluatePolicyInput",
        "GateName",
        "JevAnswer",
        "JevChoiceAnswer",
        "JevChoiceQuestion",
        "JevInstructions",
        "JevNoulAnswer",
        "JevNoulQuestion",
        "JevPrimitive",
        "JevQuestion",
        "JevRequest",
        "JevResponse",
        "JevScoreAnswer",
        "JevScoreQuestion",
        "JevState",
        "JsonObject",
        "JsonValue",
        "MapOutputError",
        "MapOutputResult",
        "MappedOutput",
        "NoulAnswer",
        "NoulBands",
        "NoulColumnDefinition",
        "NoulGate",
        "NoulLabels",
        "NoulOutput",
        "NoulPolicy",
        "NoulPresentation",
        "OverwriteCheck",
        "ParseAnswerResult",
        "ParsedAnswer",
        "PolicyDecision",
        "PolicyEvaluation",
        "PolicyStatus",
        "ResultIdentity",
        "RowId",
        "ScoreAnswer",
        "ScoreColumnDefinition",
        "ScoreGate",
        "ScoreLevel",
        "ScoreOutput",
        "ScorePolicy",
        "ScorePresentation",
        "SemanticOutcome",
        "ValidateAIFillConfigOptions",
        "applyValidation",
        "buildQuestion",
        "cacheKey",
        "canonicalJson",
        "cellData",
        "checkCommitGuards",
        "choiceMargin",
        "defaultIsEmpty",
        "defaultNoulLabels",
        "defaultPrecision",
        "defaultToCell",
        "destinationUnchanged",
        "evaluatePolicy",
        "identityMatches",
        "inputFingerprint",
        "isWritableCell",
        "mapOutput",
        "noulBand",
        "overwriteAllows",
        "parseAnswer",
        "questionFingerprint",
        "resolveModel",
        "sameCellData",
        "scoreLevel",
        "scoreLevelLabel",
        "shortHash",
        "validateAIFillConfig",
    ],
    "src/server/index.ts": [],
    "src/testing/index.ts": [],
};

function getExportedNames(entry: string): string[] {
    const program = ts.createProgram([entry], {
        allowJs: true,
        skipLibCheck: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(entry);
    if (sourceFile === undefined) throw new Error(`Could not load ${entry}`);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol === undefined) throw new Error(`No module symbol for ${entry}`);
    return checker
        .getExportsOfModule(moduleSymbol)
        .map(symbol => symbol.name)
        .sort();
}

describe("public API exports", () => {
    for (const [entry, expected] of Object.entries(expectedExports)) {
        it(`match the export list of ${entry}`, () => {
            expect(getExportedNames(path.resolve(entry))).toEqual(expected);
        });
    }
});
