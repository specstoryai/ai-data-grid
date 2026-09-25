import type { EditableGridCell } from "@specstory/ai-data-grid";
import type { ChoiceAnswer, NoulAnswer, ParsedAnswer, ScoreAnswer } from "../contract/types.js";
import type {
    AICellContext,
    AIColumnDefinition,
    ChoiceColumnDefinition,
    NoulColumnDefinition,
    ScoreColumnDefinition,
    ScoreLevel,
} from "../config/types.js";
import type { MappedOutput, SemanticOutcome } from "../config/results.js";
import { defaultToCell } from "./cells.js";

/** The default number of decimals for Score `score` and Noul `probability` values. */
export const defaultPrecision = 2;

/** The default Noul labels. */
export const defaultNoulLabels = { true: "Yes", false: "No", uncertain: "Uncertain" } as const;

/** Why an answer couldn't be mapped. */
export interface MapOutputError {
    /** `type-mismatch` when the value can't be produced or doesn't fit the destination; `configuration` when the mapping itself is incomplete. */
    readonly kind: "type-mismatch" | "configuration";
    readonly message: string;
}

/** The result of {@link mapOutput}. */
export type MapOutputResult =
    { readonly ok: true; readonly output: MappedOutput } | { readonly ok: false; readonly error: MapOutputError };

interface Mapping {
    readonly value: unknown;
    readonly hasValue: boolean;
    readonly display: string;
    readonly outcome: SemanticOutcome;
    readonly level?: number;
    readonly band?: "false" | "true" | "between";
}

function roundTo(value: number, precision: number): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

function mapChoice(definition: ChoiceColumnDefinition, answer: ChoiceAnswer): Mapping | MapOutputError {
    if (!Object.prototype.hasOwnProperty.call(definition.options, answer.choice)) {
        return { kind: "type-mismatch", message: `choice "${answer.choice}" is not one of the column's options` };
    }
    const option = definition.options[answer.choice];
    const label = option.label ?? answer.choice;
    const outcome = option.outcome ?? "value";
    if (outcome === "value") {
        return { value: option.value !== undefined ? option.value : label, hasValue: true, display: label, outcome };
    }
    return { value: option.value, hasValue: option.value !== undefined, display: label, outcome };
}

/** The label of a Score level: its `label`, else its description when that is a string, else `Level <i>`. */
export function scoreLevelLabel(level: ScoreLevel, index: number): string {
    if (typeof level === "string") return level;
    if (level.label !== undefined) return level.label;
    return typeof level.description === "string" ? level.description : `Level ${index}`;
}

/**
 * The rubric level a Score answer maps to. `nearest` rounds the score half up;
 * `most-probable` takes the level with the highest probability, ties going to the lower level.
 */
export function scoreLevel(answer: ScoreAnswer, levels: number, levelFrom: "nearest" | "most-probable"): number {
    if (levelFrom === "nearest") return Math.min(levels - 1, Math.floor(answer.score + 0.5));
    let best = 0;
    for (let i = 1; i < levels; i++) {
        if (answer.probabilities[String(i)] > answer.probabilities[String(best)]) best = i;
    }
    return best;
}

function mapScore(definition: ScoreColumnDefinition, answer: ScoreAnswer): Mapping | MapOutputError {
    const output = definition.output ?? {};
    const levels = definition.levels;
    if (answer.score > levels.length - 1) {
        return {
            kind: "type-mismatch",
            message: `score ${answer.score} is outside the column's ${levels.length}-level rubric`,
        };
    }
    const level = scoreLevel(answer, levels.length, output.levelFrom ?? "nearest");
    const label = scoreLevelLabel(levels[level], level);
    const store = output.store ?? "score";
    const base = { hasValue: true, outcome: "value", level } as const;
    if (typeof store === "function") {
        let value: unknown;
        try {
            value = store(answer);
        } catch (e) {
            return { kind: "type-mismatch", message: `output.store threw: ${errorMessage(e)}` };
        }
        return { ...base, value, display: String(value) };
    }
    switch (store) {
        case "score": {
            const precision = output.precision ?? defaultPrecision;
            const value = roundTo(answer.score, precision);
            return { ...base, value, display: value.toFixed(precision) };
        }
        case "level":
            return { ...base, value: level, display: label };
        case "level-label":
            return { ...base, value: label, display: label };
        case "level-value": {
            const definitionLevel = levels[level];
            if (typeof definitionLevel === "string" || definitionLevel.value === undefined) {
                return {
                    kind: "configuration",
                    message: `output.store is "level-value" but level ${level} has no value`,
                };
            }
            return { ...base, value: definitionLevel.value, display: label };
        }
    }
}

/** The band a Noul probability falls in: at or below `falseAtOrBelow` is false, at or above `trueAtOrAbove` is true. */
export function noulBand(
    noul: number,
    bands: { falseAtOrBelow: number; trueAtOrAbove: number }
): "false" | "true" | "between" {
    if (noul <= bands.falseAtOrBelow) return "false";
    if (noul >= bands.trueAtOrAbove) return "true";
    return "between";
}

function mapNoul(definition: NoulColumnDefinition, answer: NoulAnswer): Mapping | MapOutputError {
    const output = definition.output ?? {};
    const store = output.store ?? "probability";
    if (store === "probability") {
        const precision = output.precision ?? defaultPrecision;
        const value = roundTo(answer.noul, precision);
        return { value, hasValue: true, display: value.toFixed(precision), outcome: "value" };
    }
    if (output.bands === undefined) {
        return { kind: "configuration", message: `output.store is "${store}" but output.bands is not set` };
    }
    const labels = { ...defaultNoulLabels, ...output.labels };
    const band = noulBand(answer.noul, output.bands);
    if (band === "between") {
        return { value: undefined, hasValue: false, display: labels.uncertain, outcome: "uncertain", band };
    }
    const yes = band === "true";
    const display = yes ? labels.true : labels.false;
    return { value: store === "boolean" ? yes : display, hasValue: true, display, outcome: "value", band };
}

function isMappingError(m: Mapping | MapOutputError): m is MapOutputError {
    return "kind" in m;
}

/**
 * Maps a validated answer to the grid (step 4 of the result precedence). It
 * returns three separate things: the raw `answer`, the `display` text and the
 * `value` to commit (with `hasValue`), plus the semantic outcome. When
 * `ctx.destination` is given and there is a value, it also builds the
 * destination `cell` with `output.toCell` (default {@link defaultToCell}).
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
export function mapOutput(definition: AIColumnDefinition, answer: ParsedAnswer, ctx?: AICellContext): MapOutputResult {
    if (definition.primitive !== answer.type) {
        return {
            ok: false,
            error: {
                kind: "type-mismatch",
                message: `a ${answer.type} answer can't be mapped to a ${definition.primitive} column`,
            },
        };
    }
    let mapping: Mapping | MapOutputError;
    switch (definition.primitive) {
        case "choice":
            mapping = mapChoice(definition, answer as ChoiceAnswer);
            break;
        case "score":
            mapping = mapScore(definition, answer as ScoreAnswer);
            break;
        case "noul":
            mapping = mapNoul(definition, answer as NoulAnswer);
            break;
    }
    if (isMappingError(mapping)) return { ok: false, error: mapping };

    const format = definition.output?.format as ((value: unknown, answer: ParsedAnswer) => string) | undefined;
    let display = mapping.display;
    if (format !== undefined) {
        try {
            display = format(mapping.hasValue ? mapping.value : undefined, answer);
        } catch (e) {
            return { ok: false, error: { kind: "type-mismatch", message: `output.format threw: ${errorMessage(e)}` } };
        }
    }

    let cell: EditableGridCell | undefined;
    const destination = ctx?.destination;
    if (ctx !== undefined && destination !== undefined && mapping.hasValue) {
        const toCell = definition.output?.toCell;
        try {
            cell =
                toCell === undefined
                    ? defaultToCell(mapping.value, destination)
                    : toCell(mapping.value, destination, ctx);
        } catch (e) {
            return { ok: false, error: { kind: "type-mismatch", message: `output.toCell threw: ${errorMessage(e)}` } };
        }
        if (cell === undefined) {
            return {
                ok: false,
                error: {
                    kind: "type-mismatch",
                    message: `${JSON.stringify(mapping.value) ?? String(mapping.value)} doesn't fit a ${destination.kind} cell; configure output.toCell`,
                },
            };
        }
    }

    const output: MappedOutput = {
        answer,
        display,
        value: mapping.hasValue ? mapping.value : undefined,
        hasValue: mapping.hasValue,
        outcome: mapping.outcome,
        ...(cell === undefined ? {} : { cell }),
        ...(mapping.level === undefined ? {} : { level: mapping.level }),
        ...(mapping.band === undefined ? {} : { band: mapping.band }),
    };
    return { ok: true, output };
}
