import { type GridCell, GridCellKind, type TextCell } from "../../src/internal/data-grid/data-grid-types.js";
import { describe, expect, it, vi } from "vitest";
import type { AIFillScope, AIOverwritePolicy } from "../../src/ai-fill/index.js";
import {
    applyValidation,
    cellData,
    checkCommitGuards,
    type CommitGuardInput,
    type CommitSource,
    destinationUnchanged,
    identityMatches,
    isWritableCell,
    overwriteAllows,
    sameCellData,
} from "../../src/ai-fill/policy/commit-guards.js";

const text = (data: string, readonly?: boolean): TextCell => ({
    kind: GridCellKind.Text,
    data,
    displayData: data,
    allowOverlay: true,
    readonly,
});

describe("isWritableCell", () => {
    it("allows editable kinds that aren't read-only", () => {
        expect(isWritableCell(text(""))).toBe(true);
        expect(isWritableCell({ kind: GridCellKind.Boolean, data: false, allowOverlay: false })).toBe(true);
        expect(isWritableCell({ kind: GridCellKind.Custom, data: {}, copyData: "", allowOverlay: true })).toBe(true);
    });

    it("refuses read-only cells and kinds AI Fill can't write", () => {
        expect(isWritableCell(text("", true))).toBe(false);
        expect(
            isWritableCell({ kind: GridCellKind.Number, data: 1, displayData: "1", allowOverlay: true, readonly: true })
        ).toBe(false);
        expect(isWritableCell({ kind: GridCellKind.Loading, allowOverlay: false })).toBe(false);
        expect(isWritableCell({ kind: GridCellKind.Protected, allowOverlay: false })).toBe(false);
        expect(isWritableCell({ kind: GridCellKind.Image, data: [], allowOverlay: true })).toBe(false);
        expect(isWritableCell({ kind: GridCellKind.RowID, data: "1", allowOverlay: false })).toBe(false);
    });
});

describe("overwriteAllows", () => {
    const check = (overwrite: AIOverwritePolicy, source: CommitSource, scope: AIFillScope, destinationEmpty = false) =>
        overwriteAllows({ overwrite, source, scope, destinationEmpty });

    it("always allows empty destinations", () => {
        for (const overwrite of ["never", "suggest", "apply"] as const) {
            expect(check(overwrite, "auto-apply", "column-empty", true)).toBe(true);
        }
    });

    it("never replaces a value under never, or in an empty-only scope", () => {
        expect(check("never", "accept", "selection")).toBe(false);
        expect(check("apply", "accept", "selection-empty")).toBe(false);
        expect(check("apply", "accept", "column-empty")).toBe(false);
    });

    it("replaces a value under suggest only by a user action in a selection", () => {
        expect(check("suggest", "accept", "selection")).toBe(true);
        expect(check("suggest", "choose", "selection")).toBe(true);
        expect(check("suggest", "auto-apply", "selection")).toBe(false);
        expect(check("suggest", "accept", "column")).toBe(false);
    });

    it("replaces a value under apply in the selection and column scopes", () => {
        expect(check("apply", "auto-apply", "selection")).toBe(true);
        expect(check("apply", "accept", "column")).toBe(true);
    });
});

describe("sameCellData and destinationUnchanged", () => {
    it("compares structurally, keeping 0, false, empty string and NaN distinct from each other", () => {
        expect(sameCellData(0, 0)).toBe(true);
        expect(sameCellData(NaN, NaN)).toBe(true);
        expect(sameCellData(0, false)).toBe(false);
        expect(sameCellData("", undefined)).toBe(false);
        expect(sameCellData(null, undefined)).toBe(false);
        expect(sameCellData({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
        expect(sameCellData({ a: 1 }, { a: 1, b: undefined })).toBe(false);
        expect(sameCellData([1], { 0: 1 })).toBe(false);
        expect(sameCellData(new Date(5), new Date(5))).toBe(true);
        expect(sameCellData(new Date(5), new Date(6))).toBe(false);
        expect(sameCellData(new Date(5), {})).toBe(false);
    });

    it("compares a snapshot with the cell's current data", () => {
        expect(cellData(text("a"))).toBe("a");
        expect(cellData({ kind: GridCellKind.Loading, allowOverlay: false })).toBeUndefined();
        expect(destinationUnchanged("a", text("a"))).toBe(true);
        expect(destinationUnchanged("", text("a"))).toBe(false);
    });
});

describe("identityMatches", () => {
    const id = { questionFingerprint: "q", inputFingerprint: "i", model: "jev-latest" };
    it("requires the question, input and model to match exactly", () => {
        expect(identityMatches(id, { ...id })).toBe(true);
        expect(identityMatches(id, { ...id, questionFingerprint: "q2" })).toBe(false);
        expect(identityMatches(id, { ...id, inputFingerprint: "i2" })).toBe(false);
        expect(identityMatches(id, { ...id, model: "jev-preview" })).toBe(false);
    });
});

describe("applyValidation", () => {
    it("accepts on true, blocks on false, and uses a coerced cell", () => {
        const cell = text("x");
        expect(applyValidation(cell, true)).toEqual({ ok: true, cell });
        expect(applyValidation(cell, false)).toEqual({ ok: false });
        const coerced = text("X");
        expect(applyValidation(cell, coerced)).toEqual({ ok: true, cell: coerced });
    });
});

describe("checkCommitGuards", () => {
    const identity = { questionFingerprint: "q", inputFingerprint: "i", model: "jev-latest" };
    const current: GridCell = text("");
    const next = text("Champion");
    const input = (overrides: Partial<CommitGuardInput> = {}): CommitGuardInput => ({
        alreadyCommitted: false,
        location: [3, 7],
        current,
        next,
        expected: identity,
        actual: identity,
        destinationSnapshot: "",
        overwrite: { overwrite: "never", destinationEmpty: true, source: "accept", scope: "selection" },
        ...overrides,
    });

    it("passes when every guard holds", () => {
        expect(checkCommitGuards(input())).toEqual({ ok: true, location: [3, 7], cell: next });
    });

    it("blocks each failing guard with its reason", () => {
        const reason = (overrides: Partial<CommitGuardInput>) => {
            const result = checkCommitGuards(input(overrides));
            return result.ok ? "ok" : result.reason;
        };
        expect(reason({ alreadyCommitted: true })).toBe("already-committed");
        expect(reason({ location: undefined })).toBe("row-missing");
        expect(reason({ actual: { ...identity, inputFingerprint: "edited" } })).toBe("stale");
        expect(reason({ destinationSnapshot: "typed by hand" })).toBe("destination-changed");
        expect(reason({ current: text("", true) })).toBe("read-only");
        expect(
            reason({
                current: text("VP"),
                destinationSnapshot: "VP",
                overwrite: { overwrite: "never", destinationEmpty: false, source: "accept", scope: "selection" },
            })
        ).toBe("overwrite");
        expect(reason({ validateCell: () => false })).toBe("validation");
    });

    it("checks the cheap guards before calling validateCell", () => {
        const validateCell = vi.fn(() => true);
        checkCommitGuards(input({ alreadyCommitted: true, validateCell }));
        checkCommitGuards(input({ location: undefined, validateCell }));
        expect(validateCell).not.toHaveBeenCalled();
    });

    it("passes the location, new value and previous value to validateCell, and uses a coerced cell", () => {
        const coerced = text("CHAMPION");
        const validateCell = vi.fn(() => coerced);
        expect(checkCommitGuards(input({ validateCell }))).toEqual({ ok: true, location: [3, 7], cell: coerced });
        expect(validateCell).toHaveBeenCalledWith([3, 7], next, current);
    });
});
