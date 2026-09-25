import {
    type EditableGridCell,
    type GridCell,
    type Item,
    type ValidatedGridCell,
    isReadWriteCell,
} from "@specstory/ai-data-grid";
import type { AIFillScope, AIOverwritePolicy } from "../config/types.js";

/** What started a write. */
export type CommitSource = "accept" | "auto-apply" | "choose";

/** Why a commit guard blocked a write. */
export type CommitBlockReason =
    "already-committed" | "row-missing" | "stale" | "destination-changed" | "read-only" | "overwrite" | "validation";

/** The identity a result was computed for, compared again at commit time. */
export interface ResultIdentity {
    readonly questionFingerprint: string;
    readonly inputFingerprint: string;
    /** The requested model. */
    readonly model: string;
}

/** Whether AI Fill may write into this cell: an editable kind that isn't `readonly`. */
export function isWritableCell(cell: GridCell): boolean {
    return isReadWriteCell(cell);
}

/** Input to {@link overwriteAllows}. */
export interface OverwriteCheck {
    readonly overwrite: AIOverwritePolicy;
    /** Whether the destination is empty now, by the column's `isEmpty`. */
    readonly destinationEmpty: boolean;
    readonly source: CommitSource;
    /** The scope of the fill that produced the result. */
    readonly scope: AIFillScope;
}

/**
 * Whether the overwrite policy and fill scope allow a write. Empty destinations
 * are always allowed. Populated ones:
 * - never in the `selection-empty` and `column-empty` scopes
 * - `never`: never
 * - `suggest`: only by a user action (accept or choose) in the `selection` scope, never by auto-apply
 * - `apply`: in the `selection` and `column` scopes
 */
export function overwriteAllows(check: OverwriteCheck): boolean {
    if (check.destinationEmpty) return true;
    if (check.scope === "selection-empty" || check.scope === "column-empty") return false;
    switch (check.overwrite) {
        case "never":
            return false;
        case "suggest":
            return check.source !== "auto-apply" && check.scope === "selection";
        case "apply":
            return true;
    }
}

/** Whether a result's identity still matches the current one. Compares the exact canonical strings. */
export function identityMatches(expected: ResultIdentity, current: ResultIdentity): boolean {
    return (
        expected.questionFingerprint === current.questionFingerprint &&
        expected.inputFingerprint === current.inputFingerprint &&
        expected.model === current.model
    );
}

/**
 * Structural equality for cell data: primitives by `Object.is` (so `NaN`
 * equals `NaN` and `0` doesn't equal `""`), dates by time, and arrays and plain
 * objects member by member.
 */
export function sameCellData(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (a instanceof Date || b instanceof Date) {
        return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        return a.every((item, i) => sameCellData(item, b[i]));
    }
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = Object.keys(aRecord);
    if (keys.length !== Object.keys(bRecord).length) return false;
    return keys.every(
        key => Object.prototype.hasOwnProperty.call(bRecord, key) && sameCellData(aRecord[key], bRecord[key])
    );
}

/** A cell's `data`, the destination snapshot taken at request time. Loading and Protected cells have none (`undefined`). */
export function cellData(cell: GridCell): unknown {
    return "data" in cell ? cell.data : undefined;
}

/** Whether the destination still holds the data captured (with {@link cellData}) when the request was made. */
export function destinationUnchanged(snapshot: unknown, current: GridCell): boolean {
    return sameCellData(snapshot, cellData(current));
}

/**
 * Applies a `validateCell` result the way the grid does: `true` accepts the
 * cell, `false` blocks the write, and a returned cell replaces (coerces) it.
 */
export function applyValidation(
    cell: EditableGridCell,
    result: boolean | ValidatedGridCell
): { readonly ok: true; readonly cell: EditableGridCell } | { readonly ok: false } {
    if (result === true) return { ok: true, cell };
    if (result === false) return { ok: false };
    return { ok: true, cell: result };
}

/** Input to {@link checkCommitGuards}. */
export interface CommitGuardInput {
    /** Whether this result was already committed (it has a commit id). */
    readonly alreadyCommitted: boolean;
    /** The display location, re-resolved from the row id now. `undefined` when the row is gone. */
    readonly location: Item | undefined;
    /** The destination cell now. */
    readonly current: GridCell;
    /** The cell to write. */
    readonly next: EditableGridCell;
    /** The identity the result was computed for. */
    readonly expected: ResultIdentity;
    /** The identity computed from the row now. */
    readonly actual: ResultIdentity;
    /** The destination's `data` when the request was made. */
    readonly destinationSnapshot: unknown;
    readonly overwrite: OverwriteCheck;
    /** The app's `validateCell`, if any. */
    readonly validateCell?: (
        cell: Item,
        newValue: EditableGridCell,
        prevValue: GridCell
    ) => boolean | ValidatedGridCell;
}

/** The result of {@link checkCommitGuards}. */
export type CommitGuardResult =
    | { readonly ok: true; readonly location: Item; readonly cell: EditableGridCell }
    | { readonly ok: false; readonly reason: CommitBlockReason; readonly message: string };

/**
 * Runs every commit guard (step 7 of the result precedence), in this order:
 * not already committed, the row still exists, the fingerprints match, the
 * destination is unchanged, the cell is writable, the overwrite policy and
 * scope allow it, and `validateCell` passes (a coerced cell is used). A
 * blocked result must stay as it was, and nothing is written.
 */
export function checkCommitGuards(input: CommitGuardInput): CommitGuardResult {
    if (input.alreadyCommitted)
        return { ok: false, reason: "already-committed", message: "this result was already committed" };
    const location = input.location;
    if (location === undefined) return { ok: false, reason: "row-missing", message: "the row no longer exists" };
    if (!identityMatches(input.expected, input.actual)) {
        return { ok: false, reason: "stale", message: "the inputs, question or model changed since the request" };
    }
    if (!destinationUnchanged(input.destinationSnapshot, input.current)) {
        return { ok: false, reason: "destination-changed", message: "the destination cell changed since the request" };
    }
    if (!isWritableCell(input.current))
        return { ok: false, reason: "read-only", message: "the destination cell is read-only" };
    if (!overwriteAllows(input.overwrite)) {
        return { ok: false, reason: "overwrite", message: "the overwrite policy doesn't allow replacing this value" };
    }
    if (input.validateCell === undefined) return { ok: true, location, cell: input.next };
    const validated = applyValidation(input.next, input.validateCell(location, input.next, input.current));
    if (!validated.ok) return { ok: false, reason: "validation", message: "validateCell rejected the value" };
    return { ok: true, location, cell: validated.cell };
}
