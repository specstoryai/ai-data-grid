import type { JevQuestion, JevState } from "../contract/types.js";
import type { AIColumnDefinition, AIFillConfig } from "../config/types.js";
import type { ColumnId, RowId } from "../config/results.js";
import { canonicalJson } from "./canonical-json.js";

/**
 * Builds the Jev question for a column definition. `context`, when set, is sent
 * with the instructions as `{ instructions, context }`. Choice options become
 * `{ [id]: description }`, Score levels become their descriptions in order, and
 * Noul criteria are sent only when configured.
 */
export function buildQuestion(definition: AIColumnDefinition): JevQuestion {
    const instructions =
        definition.context === undefined
            ? definition.instructions
            : { instructions: definition.instructions, context: definition.context };
    switch (definition.primitive) {
        case "choice":
            return {
                type: "choice",
                instructions,
                criteria: Object.fromEntries(Object.entries(definition.options).map(([id, o]) => [id, o.description])),
            };
        case "score":
            return {
                type: "score",
                instructions,
                criteria: definition.levels.map(level => (typeof level === "string" ? level : level.description)),
            };
        case "noul":
            return definition.criteria === undefined
                ? { type: "noul", instructions }
                : { type: "noul", instructions, criteria: definition.criteria };
    }
}

/** The model a column asks for: its own `model`, or the grid's. */
export function resolveModel(config: Pick<AIFillConfig, "model">, definition: AIColumnDefinition): string {
    return definition.model ?? config.model;
}

/**
 * The question fingerprint: canonical JSON of the question sent to Jev (type,
 * instructions, context and criteria) plus the column's declared `sources`.
 * Changing any of them changes the fingerprint and makes earlier results stale.
 * The policy, output mapping, presentation and `decide` are not part of it, so
 * changing those re-evaluates stored answers without a new request.
 */
export function questionFingerprint(definition: AIColumnDefinition): string {
    const sources = [...new Set(definition.sources ?? [])].sort();
    return canonicalJson({ question: buildQuestion(definition), sources });
}

/** The input fingerprint: canonical JSON of the row state actually sent. */
export function inputFingerprint(state: JevState): string {
    return canonicalJson(state);
}

/** The parts of a {@link cacheKey}. */
export interface CacheKeyParts {
    readonly rowId: RowId;
    readonly columnId: ColumnId;
    readonly questionFingerprint: string;
    readonly inputFingerprint: string;
    /** The requested model, for example `jev-latest`. */
    readonly model: string;
}

/**
 * The cache and dedup key for one cell's answer. It is built from the exact
 * canonical strings, never from hashes, so a collision can't attach a wrong answer.
 */
export function cacheKey(parts: CacheKeyParts): string {
    return canonicalJson([parts.rowId, parts.columnId, parts.questionFingerprint, parts.inputFingerprint, parts.model]);
}

/**
 * A short hash (8 hex digits, 32-bit FNV-1a over UTF-16 code units) for
 * display and metadata only. Never use it as a cache or dedup key.
 */
export function shortHash(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
