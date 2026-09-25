import { type GridCell, GridCellKind, type TextCell } from "@specstory/ai-data-grid";
import { describe, expect, it } from "vitest";
import {
    defaultIsEmpty,
    defaultToCell,
    mapOutput,
    type MapOutputResult,
    type NoulColumnDefinition,
    type ScoreColumnDefinition,
} from "../src/index.js";
import { noulAnswer, ownsBudget, persona, personaAnswer, seniority, seniorityAnswer } from "./fixtures/definitions.js";

const text = (data: string): GridCell => ({ kind: GridCellKind.Text, data, displayData: data, allowOverlay: true });
const num = (data: number | undefined): GridCell => ({
    kind: GridCellKind.Number,
    data,
    displayData: String(data),
    allowOverlay: true,
});
const bool = (data: boolean | null | undefined): GridCell => ({
    kind: GridCellKind.Boolean,
    data,
    allowOverlay: false,
});
const dropdown = (value: string | null): GridCell => ({
    kind: GridCellKind.Custom,
    data: { kind: "dropdown-cell", value, allowedValues: ["ic", { value: "exec", label: "Executive" }] },
    copyData: value ?? "",
    allowOverlay: true,
});

function ok(result: MapOutputResult) {
    if (!result.ok) throw new Error(`expected a mapping, got ${result.error.message}`);
    return result.output;
}

const ctx = { rowId: "r1", columnId: "c1" };

describe("defaultIsEmpty", () => {
    it("treats 0 and false as values, not empty", () => {
        expect(defaultIsEmpty(num(0))).toBe(false);
        expect(defaultIsEmpty(bool(false))).toBe(false);
    });

    it("treats missing values as empty", () => {
        expect(defaultIsEmpty(text(""))).toBe(true);
        expect(defaultIsEmpty({ kind: GridCellKind.Uri, data: undefined as never, allowOverlay: true })).toBe(true);
        expect(defaultIsEmpty({ kind: GridCellKind.Markdown, data: null as never, allowOverlay: true })).toBe(true);
        expect(defaultIsEmpty(num(undefined))).toBe(true);
        expect(defaultIsEmpty(num(NaN))).toBe(true);
        expect(defaultIsEmpty(bool(null))).toBe(true);
        expect(defaultIsEmpty(bool(undefined))).toBe(true);
    });

    it("treats present values as not empty", () => {
        expect(defaultIsEmpty(text(" "))).toBe(false);
        expect(defaultIsEmpty(num(-1))).toBe(false);
        expect(defaultIsEmpty(bool(true))).toBe(false);
    });

    it("reads the dropdown cell's value, and other custom cells' data", () => {
        expect(defaultIsEmpty(dropdown(null))).toBe(true);
        expect(defaultIsEmpty(dropdown(""))).toBe(true);
        expect(defaultIsEmpty(dropdown("ic"))).toBe(false);
        expect(
            defaultIsEmpty({ kind: GridCellKind.Custom, data: null as never, copyData: "", allowOverlay: true })
        ).toBe(true);
        expect(
            defaultIsEmpty({ kind: GridCellKind.Custom, data: { stars: 0 }, copyData: "", allowOverlay: true })
        ).toBe(false);
    });

    it("never treats loading or protected cells as empty", () => {
        expect(defaultIsEmpty({ kind: GridCellKind.Loading, allowOverlay: false })).toBe(false);
        expect(defaultIsEmpty({ kind: GridCellKind.Protected, allowOverlay: false })).toBe(false);
        expect(defaultIsEmpty({ kind: GridCellKind.Bubble, data: [], allowOverlay: false })).toBe(true);
    });
});

describe("defaultToCell", () => {
    it("writes strings, finite numbers and booleans into matching kinds", () => {
        expect(defaultToCell("VP", text(""))).toMatchObject({ kind: GridCellKind.Text, data: "VP", displayData: "VP" });
        expect(defaultToCell(0, num(undefined))).toMatchObject({
            kind: GridCellKind.Number,
            data: 0,
            displayData: "0",
        });
        expect(defaultToCell(false, bool(null))).toMatchObject({ kind: GridCellKind.Boolean, data: false });
        expect(
            defaultToCell("https://x.test", {
                kind: GridCellKind.Uri,
                data: "",
                displayData: "old",
                allowOverlay: true,
            })
        ).toEqual({
            kind: GridCellKind.Uri,
            data: "https://x.test",
            allowOverlay: true,
        });
    });

    it("writes an allowed value into the cells package's dropdown cell", () => {
        expect(defaultToCell("exec", dropdown(null))).toMatchObject({
            data: { kind: "dropdown-cell", value: "exec" },
            copyData: "exec",
        });
        expect(defaultToCell("director", dropdown(null))).toBeUndefined();
    });

    it("refuses values that don't fit", () => {
        expect(defaultToCell(3, text(""))).toBeUndefined();
        expect(defaultToCell("3", num(undefined))).toBeUndefined();
        expect(defaultToCell(Infinity, num(undefined))).toBeUndefined();
        expect(defaultToCell("true", bool(null))).toBeUndefined();
        expect(
            defaultToCell("x", { kind: GridCellKind.Custom, data: {}, copyData: "", allowOverlay: true })
        ).toBeUndefined();
        expect(defaultToCell("x", { kind: GridCellKind.Image, data: [], allowOverlay: true })).toBeUndefined();
    });

    it("doesn't mutate the current cell", () => {
        const current = Object.freeze(text("old"));
        defaultToCell("new", current);
        expect(current).toEqual(text("old"));
    });
});

describe("mapOutput: Choice", () => {
    it("keeps the raw answer, the display text and the committed value separate", () => {
        const answer = personaAnswer(0.9, 0.8, "economic");
        const output = ok(mapOutput(persona, answer, { ...ctx, destination: text("") }));
        expect(output.answer).toBe(answer);
        expect(output.display).toBe("Economic buyer");
        expect(output.value).toBe("ECON");
        expect(output.cell).toMatchObject({ data: "ECON" });
        expect(output.outcome).toBe("value");
    });

    it("stores the label by default, else the option id", () => {
        expect(ok(mapOutput(persona, personaAnswer(0.9, 0.8))).value).toBe("Champion");
        expect(ok(mapOutput(persona, personaAnswer(0.9, 0.8, "user")))).toMatchObject({
            value: "user",
            display: "user",
        });
    });

    it("gives semantic outcomes no value unless the option configures one", () => {
        expect(ok(mapOutput(persona, personaAnswer(0.9, 0.8, "none_of_the_above")))).toMatchObject({
            outcome: "none",
            hasValue: false,
            value: undefined,
            display: "None of the above",
        });
        const withValue = {
            ...persona,
            options: {
                ...persona.options,
                insufficient: { description: null, outcome: "unknown" as const, value: "N/A" },
            },
        };
        expect(ok(mapOutput(withValue, personaAnswer(0.9, 0.8, "insufficient")))).toMatchObject({
            outcome: "unknown",
            hasValue: true,
            value: "N/A",
            display: "insufficient",
        });
    });

    it("reports a choice that is no longer an option as a type mismatch", () => {
        const { user: _user, ...options } = persona.options;
        const result = mapOutput({ ...persona, options }, personaAnswer(0.9, 0.8, "user"));
        expect(result).toEqual({
            ok: false,
            error: { kind: "type-mismatch", message: `choice "user" is not one of the column's options` },
        });
    });

    it("builds no cell for a valueless outcome", () => {
        expect(
            ok(mapOutput(persona, personaAnswer(0.9, 0.8, "none_of_the_above"), { ...ctx, destination: num(1) })).cell
        ).toBeUndefined();
    });
});

describe("mapOutput: Score", () => {
    const answer = seniorityAnswer(2.456, 0.6);
    const withOutput = (output: ScoreColumnDefinition["output"]): ScoreColumnDefinition => ({ ...seniority, output });

    it("stores the score rounded to precision by default (2), keeping the raw score", () => {
        const output = ok(mapOutput(seniority, answer, { ...ctx, destination: num(undefined) }));
        expect(output).toMatchObject({ value: 2.46, display: "2.46", level: 2 });
        expect(output.answer.type === "score" && output.answer.score).toBe(2.456);
        expect(output.cell).toMatchObject({ data: 2.46 });
        expect(ok(mapOutput(withOutput({ precision: 0 }), answer)).value).toBe(2);
    });

    it("displays exactly the rounded value it stores", () => {
        expect(ok(mapOutput(seniority, seniorityAnswer(2.675, 0.6)))).toMatchObject({ value: 2.68, display: "2.68" });
        expect(ok(mapOutput(seniority, seniorityAnswer(1.045, 0.6)))).toMatchObject({ value: 1.05, display: "1.05" });
    });

    it("reports a score outside the column's rubric as a type mismatch", () => {
        const threeLevels: ScoreColumnDefinition = { ...seniority, levels: ["a", "b", "c"] };
        const result = mapOutput(threeLevels, seniorityAnswer(2.9, 0.6));
        expect(!result.ok && result.error.kind).toBe("type-mismatch");
    });

    it("stores the level, its label or its value", () => {
        expect(ok(mapOutput(withOutput({ store: "level" }), answer))).toMatchObject({ value: 2, display: "Director" });
        expect(ok(mapOutput(withOutput({ store: "level-label" }), answer)).value).toBe("Director");
        expect(ok(mapOutput(withOutput({ store: "level-value" }), answer)).value).toBe("dir");
    });

    it("picks the nearest level, rounding half up", () => {
        const at = (score: number) => ok(mapOutput(withOutput({ store: "level" }), seniorityAnswer(score, 0.5))).value;
        expect(at(2.5)).toBe(3);
        expect(at(2.4999)).toBe(2);
        expect(at(0)).toBe(0);
        expect(at(3)).toBe(3);
    });

    it("picks the most probable level, ties going to the lower level", () => {
        const def = withOutput({ store: "level", levelFrom: "most-probable" });
        expect(ok(mapOutput(def, seniorityAnswer(1.5, 0.5, { "0": 0.1, "1": 0.4, "2": 0.4, "3": 0.1 }))).value).toBe(1);
        expect(ok(mapOutput(def, seniorityAnswer(2.4, 0.5, { "0": 0, "1": 0.2, "2": 0.2, "3": 0.6 }))).value).toBe(3);
    });

    it("labels levels by label, then string description, then index", () => {
        const def: ScoreColumnDefinition = {
            ...seniority,
            levels: ["low", { description: "mid" }, { description: { what: "high" } }],
            output: { store: "level-label" },
        };
        const answer3 = (score: number) => ({
            ...seniorityAnswer(score, 0.5, { "0": 0.2, "1": 0.3, "2": 0.5 }),
            legend: {},
        });
        expect(ok(mapOutput(def, answer3(0))).value).toBe("low");
        expect(ok(mapOutput(def, answer3(1))).value).toBe("mid");
        expect(ok(mapOutput(def, answer3(2))).value).toBe("Level 2");
    });

    it("reports a level without a value as a configuration error", () => {
        const def: ScoreColumnDefinition = {
            ...seniority,
            levels: ["a", "b", "c", "d"],
            output: { store: "level-value" },
        };
        const result = mapOutput(def, answer);
        expect(!result.ok && result.error.kind).toBe("configuration");
    });

    it("stores a function's result, and reports a throw as a type mismatch", () => {
        expect(ok(mapOutput(withOutput({ store: a => (a.score >= 2 ? "senior" : "junior") }), answer))).toMatchObject({
            value: "senior",
            display: "senior",
        });
        const throwing = mapOutput(
            withOutput({
                store: () => {
                    throw new Error("nope");
                },
            }),
            answer
        );
        expect(throwing).toEqual({ ok: false, error: { kind: "type-mismatch", message: "output.store threw: nope" } });
    });
});

describe("mapOutput: Noul", () => {
    const raw: NoulColumnDefinition = { ...ownsBudget, output: undefined };

    it("stores the raw probability rounded to precision by default", () => {
        expect(ok(mapOutput(raw, noulAnswer(0.02)))).toMatchObject({
            value: 0.02,
            display: "0.02",
            outcome: "value",
            hasValue: true,
        });
        expect(ok(mapOutput({ ...raw, output: { precision: 3 } }, noulAnswer(0.12345))).value).toBe(0.123);
    });

    it("maps bands to booleans", () => {
        expect(ok(mapOutput(ownsBudget, noulAnswer(0.02)))).toMatchObject({
            value: false,
            display: "No",
            band: "false",
        });
        expect(ok(mapOutput(ownsBudget, noulAnswer(0.97)))).toMatchObject({
            value: true,
            display: "Yes",
            band: "true",
        });
        expect(ok(mapOutput(ownsBudget, noulAnswer(0.5)))).toMatchObject({
            hasValue: false,
            display: "Uncertain",
            band: "between",
        });
    });

    it("maps bands to labels, with custom labels", () => {
        const def: NoulColumnDefinition = {
            ...ownsBudget,
            output: {
                store: "label",
                bands: { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" },
                labels: { true: "Budget owner", uncertain: "Unclear" },
            },
        };
        expect(ok(mapOutput(def, noulAnswer(0.9)))).toMatchObject({ value: "Budget owner", display: "Budget owner" });
        expect(ok(mapOutput(def, noulAnswer(0.1)))).toMatchObject({ value: "No", display: "No" });
        expect(ok(mapOutput(def, noulAnswer(0.5))).display).toBe("Unclear");
    });

    it("writes false into a Boolean cell", () => {
        expect(ok(mapOutput(ownsBudget, noulAnswer(0.02), { ...ctx, destination: bool(null) })).cell).toMatchObject({
            data: false,
        });
    });

    it("reports missing bands as a configuration error", () => {
        const result = mapOutput({ ...ownsBudget, output: { store: "boolean" } }, noulAnswer(0.5));
        expect(!result.ok && result.error.kind).toBe("configuration");
    });
});

describe("mapOutput: format and toCell", () => {
    it("uses output.format for the display text only", () => {
        const def = { ...persona, output: { format: (value: unknown) => `→ ${String(value)}` } };
        expect(ok(mapOutput(def, personaAnswer(0.9, 0.8)))).toMatchObject({ value: "Champion", display: "→ Champion" });
    });

    it("passes undefined to format when there is no value", () => {
        const def: NoulColumnDefinition = {
            ...ownsBudget,
            output: { ...ownsBudget.output, format: v => `[${String(v)}]` },
        };
        expect(ok(mapOutput(def, noulAnswer(0.5))).display).toBe("[undefined]");
    });

    it("uses output.toCell when configured", () => {
        const def = {
            ...persona,
            output: {
                toCell: (value: unknown, current: GridCell) => ({
                    ...(current as TextCell),
                    data: `custom:${String(value)}`,
                }),
            },
        };
        expect(ok(mapOutput(def, personaAnswer(0.9, 0.8), { ...ctx, destination: text("") })).cell).toMatchObject({
            data: "custom:Champion",
        });
    });

    it("reports a value that doesn't fit the destination as a type mismatch, and writes nothing", () => {
        const result = mapOutput(seniority, seniorityAnswer(2, 0.5), { ...ctx, destination: text("") });
        expect(result).toEqual({
            ok: false,
            error: { kind: "type-mismatch", message: "2 doesn't fit a text cell; configure output.toCell" },
        });
        const refused = mapOutput({ ...persona, output: { toCell: () => undefined } }, personaAnswer(0.9, 0.8), {
            ...ctx,
            destination: text(""),
        });
        expect(!refused.ok && refused.error.kind).toBe("type-mismatch");
    });

    it("reports throwing callbacks as type mismatches", () => {
        const boom = () => {
            throw new Error("boom");
        };
        expect(mapOutput({ ...persona, output: { format: boom } }, personaAnswer(0.9, 0.8))).toEqual({
            ok: false,
            error: { kind: "type-mismatch", message: "output.format threw: boom" },
        });
        const toCell = mapOutput({ ...persona, output: { toCell: boom } }, personaAnswer(0.9, 0.8), {
            ...ctx,
            destination: text(""),
        });
        expect(!toCell.ok && toCell.error.message).toBe("output.toCell threw: boom");
    });

    it("refuses an answer of another primitive", () => {
        const result = mapOutput(persona, noulAnswer(0.5));
        expect(!result.ok && result.error.kind).toBe("type-mismatch");
    });

    it("is deterministic", () => {
        const answer = seniorityAnswer(1.7, 0.5);
        expect(mapOutput(seniority, answer)).toEqual(mapOutput(seniority, answer));
    });
});
