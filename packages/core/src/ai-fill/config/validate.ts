import type { GridColumn } from "../../internal/data-grid/data-grid-types.js";
import type { AIFillConfig } from "./types.js";
import type { AIGateName } from "./results.js";

/** One problem found by {@link validateAIFillConfig}. */
export interface AIFillConfigIssue {
    /** Where the problem is, for example `columns.persona.policy.show.minProbability`. */
    readonly path: string;
    readonly message: string;
    /** The AI column the problem disables. Without it, the problem disables AI Fill for the whole grid. */
    readonly columnId?: string;
}

/** Options for {@link validateAIFillConfig}. */
export interface ValidateAIFillConfigOptions {
    /** The grid's columns. When given, every AI column and source must be a column `id`. */
    readonly columns?: readonly GridColumn[];
    /** Whether the code runs in a browser, where direct mode needs `dangerouslyAllowBrowser`. Default: detected (a window with a document, or a web worker). */
    readonly isBrowser?: boolean;
}

type Rec = Record<string, unknown>;

const gateNames: readonly AIGateName[] = ["show", "ready", "autoApply"];
const fillScopes = ["selection", "selection-empty", "column-empty", "column"];
const defaultFillScopes = ["selection", "selection-empty", "column-empty"];
const identifier = /^[$A-Z_a-z][\w$]*$/;

const mustBeNonEmptyString = "must be a non-empty string";
const mustBeUnit = "must be a finite number in [0, 1]";
const mustBeBoolean = "must be a boolean";

function quoted(value: string): string {
    return `"${value}"`;
}

function isRecord(value: unknown): value is Rec {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnit(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value !== "";
}

function isInteger(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function join(base: string, key: string): string {
    const part = identifier.test(key) ? key : `[${JSON.stringify(key)}]`;
    if (base === "") return part;
    return part.startsWith("[") ? `${base}${part}` : `${base}.${part}`;
}

function detectBrowser(): boolean {
    const inWindow = typeof window !== "undefined" && typeof document !== "undefined";
    const inWorker = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "undefined";
    return inWindow || inWorker;
}

/** A numeric bound declared by a gate, used for the monotonicity check. */
interface Bound {
    readonly measure: string;
    readonly kind: "min" | "max";
    readonly value: number;
}

class Collector {
    constructor(
        readonly issues: AIFillConfigIssue[] = [],
        private readonly columnId?: string
    ) {}

    add(path: string, message: string): void {
        this.issues.push(this.columnId === undefined ? { path, message } : { path, message, columnId: this.columnId });
    }

    /** A collector that tags its issues with a column id, sharing this one's list. */
    forColumn(columnId: string): Collector {
        return new Collector(this.issues, columnId);
    }

    optionalFunction(owner: Rec, key: string, path: string): void {
        if (owner[key] !== undefined && typeof owner[key] !== "function")
            this.add(join(path, key), "must be a function");
    }

    optionalEnum(owner: Rec, key: string, path: string, values: readonly string[]): void {
        const value = owner[key];
        if (value !== undefined && (typeof value !== "string" || !values.includes(value))) {
            this.add(join(path, key), `must be one of ${values.map(quoted).join(", ")}`);
        }
    }

    optionalString(owner: Rec, key: string, path: string): void {
        if (owner[key] !== undefined && !isNonEmptyString(owner[key])) this.add(join(path, key), mustBeNonEmptyString);
    }

    optionalRecord(owner: Rec, key: string, path: string): Rec | undefined {
        const value = owner[key];
        if (value === undefined) return undefined;
        if (!isRecord(value)) {
            this.add(join(path, key), "must be an object");
            return undefined;
        }
        return value;
    }

    /** Checks a `{ min?, max? }` range within [lo, hi] and returns its valid bounds. */
    range(value: unknown, path: string, lo: number, hi: number, measure: string, bounds: Bound[]): void {
        if (!isRecord(value)) {
            this.add(path, "must be an object with min and/or max");
            return;
        }
        for (const key of Object.keys(value)) {
            if (key !== "min" && key !== "max") this.add(join(path, key), `unknown key; a range has only min and max`);
        }
        const valid: Partial<Record<"min" | "max", number>> = {};
        for (const key of ["min", "max"] as const) {
            const bound = value[key];
            if (bound === undefined) continue;
            if (typeof bound !== "number" || !Number.isFinite(bound) || bound < lo || bound > hi) {
                this.add(join(path, key), `must be a finite number in [${lo}, ${hi}]`);
            } else {
                valid[key] = bound;
                bounds.push({ measure: `${measure}.${key}`, kind: key, value: bound });
            }
        }
        if (valid.min !== undefined && valid.max !== undefined && valid.min > valid.max) {
            this.add(path, `min (${valid.min}) must be <= max (${valid.max})`);
        }
    }

    unitMin(gate: Rec, key: string, path: string, bounds: Bound[]): void {
        const value = gate[key];
        if (value === undefined) return;
        if (!isUnit(value)) this.add(join(path, key), mustBeUnit);
        else bounds.push({ measure: key, kind: "min", value });
    }
}

function checkConnection(c: Collector, connection: unknown, isBrowser: boolean): void {
    if (!isRecord(connection)) {
        c.add(
            "connection",
            'is required: { mode: "endpoint", url }, { mode: "direct", apiKey } or { mode: "custom", send }'
        );
        return;
    }
    switch (connection.mode) {
        case "endpoint":
            if (!isNonEmptyString(connection.url)) c.add("connection.url", mustBeNonEmptyString);
            c.optionalFunction(connection, "headers", "connection");
            c.optionalFunction(connection, "fetch", "connection");
            break;
        case "direct":
            // Never echo the key's value in a message.
            if (!isNonEmptyString(connection.apiKey)) c.add("connection.apiKey", mustBeNonEmptyString);
            if (
                connection.dangerouslyAllowBrowser !== undefined &&
                typeof connection.dangerouslyAllowBrowser !== "boolean"
            ) {
                c.add("connection.dangerouslyAllowBrowser", mustBeBoolean);
            } else if (isBrowser && connection.dangerouslyAllowBrowser !== true) {
                c.add(
                    "connection.dangerouslyAllowBrowser",
                    "direct mode in a browser exposes the API key to anyone using that browser; set dangerouslyAllowBrowser: true for local demos, or use endpoint mode"
                );
            }
            c.optionalString(connection, "baseURL", "connection");
            c.optionalFunction(connection, "fetch", "connection");
            break;
        case "custom":
            if (typeof connection.send !== "function") c.add("connection.send", "must be a function");
            break;
        default:
            c.add("connection.mode", 'must be "endpoint", "direct" or "custom"');
    }
}

function checkExecution(c: Collector, execution: Rec): void {
    const path = "execution";
    const integers: [string, number][] = [
        ["concurrency", 1],
        ["maxRetries", 0],
        ["maxCellsPerRun", 1],
        ["confirmAbove", 0],
        ["maxQuestionsPerRequest", 1],
        ["maxStateChars", 1],
        ["cacheSize", 0],
    ];
    for (const [key, min] of integers) {
        if (execution[key] !== undefined && !isInteger(execution[key], min))
            c.add(join(path, key), `must be an integer >= ${min}`);
    }
    for (const key of ["maxRequestsPerMinute", "timeoutMs"]) {
        const value = execution[key];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
            c.add(join(path, key), "must be a positive finite number");
        }
    }
    const backoff = c.optionalRecord(execution, "backoff", path);
    if (backoff === undefined) return;
    for (const key of ["initialMs", "maxMs"]) {
        const value = backoff[key];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
            c.add(join("execution.backoff", key), "must be a finite number >= 0");
        }
    }
    if (backoff.jitter !== undefined && !isUnit(backoff.jitter)) c.add("execution.backoff.jitter", mustBeUnit);
    if (
        typeof backoff.initialMs === "number" &&
        typeof backoff.maxMs === "number" &&
        backoff.initialMs > backoff.maxMs
    ) {
        c.add("execution.backoff", "initialMs must be <= maxMs");
    }
}

function checkUnknownMeasures(
    c: Collector,
    gate: Rec,
    path: string,
    allowed: readonly string[],
    primitive: string
): void {
    for (const key of Object.keys(gate)) {
        if (allowed.includes(key)) continue;
        if (primitive === "noul" && (key === "minConfidence" || key === "minProbability")) {
            c.add(
                join(path, key),
                `a Noul answer has no ${key === "minConfidence" ? "confidence" : "separate probability"}; use noul: { min, max } or output.bands`
            );
        } else {
            c.add(join(path, key), `unknown ${primitive} gate measure; expected one of ${allowed.join(", ")}`);
        }
    }
}

function checkChoiceGate(c: Collector, gate: Rec, path: string, optionIds: readonly string[], bounds: Bound[]): void {
    checkUnknownMeasures(
        c,
        gate,
        path,
        ["minProbability", "minConfidence", "minMargin", "options", "optionProbability"],
        "choice"
    );
    c.unitMin(gate, "minProbability", path, bounds);
    c.unitMin(gate, "minConfidence", path, bounds);
    c.unitMin(gate, "minMargin", path, bounds);
    const options = c.optionalRecord(gate, "options", path);
    if (options !== undefined) {
        for (const key of Object.keys(options)) {
            if (key !== "in" && key !== "notIn") {
                c.add(join(join(path, "options"), key), "unknown key; expected in or notIn");
                continue;
            }
            const list = options[key];
            const listPath = join(join(path, "options"), key);
            if (!Array.isArray(list)) {
                c.add(listPath, "must be an array of option ids");
                continue;
            }
            for (const [i, id] of (list as unknown[]).entries()) {
                if (typeof id !== "string" || !optionIds.includes(id))
                    c.add(`${listPath}[${i}]`, `${JSON.stringify(id)} is not an option id`);
            }
        }
    }
    const optionProbability = c.optionalRecord(gate, "optionProbability", path);
    if (optionProbability !== undefined) {
        for (const [id, range] of Object.entries(optionProbability)) {
            const rangePath = join(join(path, "optionProbability"), id);
            if (!optionIds.includes(id)) c.add(rangePath, `"${id}" is not an option id`);
            else c.range(range, rangePath, 0, 1, `optionProbability.${id}`, bounds);
        }
    }
}

function checkScoreGate(c: Collector, gate: Rec, path: string, levels: number, bounds: Bound[]): void {
    checkUnknownMeasures(c, gate, path, ["minConfidence", "score", "levelProbability"], "score");
    c.unitMin(gate, "minConfidence", path, bounds);
    if (gate.score !== undefined) c.range(gate.score, join(path, "score"), 0, Math.max(0, levels - 1), "score", bounds);
    const levelProbability = c.optionalRecord(gate, "levelProbability", path);
    if (levelProbability !== undefined) {
        for (const [level, range] of Object.entries(levelProbability)) {
            const rangePath = `${join(path, "levelProbability")}[${level}]`;
            if (!isInteger(Number(level), 0, levels - 1) || String(Number(level)) !== level)
                c.add(rangePath, `level ${level} doesn't exist (levels are 0 to ${levels - 1})`);
            else c.range(range, rangePath, 0, 1, `levelProbability.${level}`, bounds);
        }
    }
}

function checkNoulGate(c: Collector, gate: Rec, path: string, bounds: Bound[]): void {
    checkUnknownMeasures(c, gate, path, ["noul"], "noul");
    if (gate.noul !== undefined) c.range(gate.noul, join(path, "noul"), 0, 1, "noul", bounds);
}

/** Later gates must be at least as strict as earlier ones, measure by measure. */
function checkMonotonic(c: Collector, policyPath: string, boundsByGate: Map<AIGateName, Bound[]>): void {
    for (let i = 0; i < gateNames.length; i++) {
        for (let j = i + 1; j < gateNames.length; j++) {
            const earlier = boundsByGate.get(gateNames[i]) ?? [];
            const later = boundsByGate.get(gateNames[j]) ?? [];
            for (const bound of later) {
                const match = earlier.find(b => b.measure === bound.measure);
                if (match === undefined) continue;
                const looser = bound.kind === "min" ? bound.value < match.value : bound.value > match.value;
                if (looser) {
                    c.add(
                        `${policyPath}.${gateNames[j]}.${bound.measure}`,
                        `overlapping gates: ${gateNames[j]}.${bound.measure} (${bound.value}) is looser than ${gateNames[i]}.${bound.measure} (${match.value}); each later gate (show, then ready, then autoApply) must be at least as strict`
                    );
                }
            }
        }
    }
}

function checkPolicy(
    c: Collector,
    policy: Rec,
    path: string,
    checkGate: (gate: Rec, gatePath: string, bounds: Bound[]) => void
): void {
    for (const key of Object.keys(policy)) {
        if (!(gateNames as readonly string[]).includes(key) && key !== "decide") {
            c.add(join(path, key), "unknown policy key; expected show, ready, autoApply or decide");
        }
    }
    c.optionalFunction(policy, "decide", path);
    const boundsByGate = new Map<AIGateName, Bound[]>();
    for (const name of gateNames) {
        const gate = c.optionalRecord(policy, name, path);
        if (gate === undefined) continue;
        const bounds: Bound[] = [];
        checkGate(gate, join(path, name), bounds);
        boundsByGate.set(name, bounds);
    }
    checkMonotonic(c, path, boundsByGate);
}

function isDescription(value: unknown): boolean {
    return isNonEmptyString(value) || isRecord(value);
}

function checkPrecision(c: Collector, output: Rec, path: string): void {
    if (output.precision !== undefined && !isInteger(output.precision, 0, 15))
        c.add(join(path, "precision"), "must be an integer from 0 to 15");
}

function checkChoice(c: Collector, def: Rec, path: string): void {
    const options = def.options;
    if (!isRecord(options)) {
        c.add(
            join(path, "options"),
            "must be an object mapping option ids to { description, label?, value?, outcome? }"
        );
        return;
    }
    const optionIds = Object.keys(options);
    if (optionIds.length < 2 || optionIds.length > 255) {
        c.add(join(path, "options"), `a Choice needs 2 to 255 options; found ${optionIds.length}`);
    }
    for (const id of optionIds) {
        const optionPath = join(join(path, "options"), id);
        if (id === "") c.add(optionPath, "option ids must be non-empty");
        const option = options[id];
        if (!isRecord(option)) {
            c.add(optionPath, "must be an object with a description");
            continue;
        }
        if (option.description !== null && !isDescription(option.description)) {
            c.add(join(optionPath, "description"), "must be a non-empty string, an object, or null");
        }
        c.optionalString(option, "label", optionPath);
        c.optionalEnum(option, "outcome", optionPath, ["value", "none", "unknown"]);
    }
    const output = c.optionalRecord(def, "output", path);
    if (output !== undefined) {
        c.optionalFunction(output, "format", join(path, "output"));
        c.optionalFunction(output, "toCell", join(path, "output"));
    }
    const presentation = c.optionalRecord(def, "presentation", path);
    for (const key of ["showProbability", "showConfidence"]) {
        if (presentation?.[key] !== undefined && typeof presentation[key] !== "boolean") {
            c.add(join(join(path, "presentation"), key), mustBeBoolean);
        }
    }
    const alternatives =
        presentation === undefined
            ? undefined
            : c.optionalRecord(presentation, "alternatives", join(path, "presentation"));
    if (alternatives !== undefined) {
        const altPath = join(join(path, "presentation"), "alternatives");
        if (!isInteger(alternatives.count, 1)) c.add(join(altPath, "count"), "must be an integer >= 1");
        if (alternatives.minProbability !== undefined && !isUnit(alternatives.minProbability)) {
            c.add(join(altPath, "minProbability"), mustBeUnit);
        }
    }
    const policy = c.optionalRecord(def, "policy", path);
    if (policy !== undefined) {
        checkPolicy(c, policy, join(path, "policy"), (gate, gatePath, bounds) =>
            checkChoiceGate(c, gate, gatePath, optionIds, bounds)
        );
    }
}

function checkScore(c: Collector, def: Rec, path: string): void {
    const levels = def.levels;
    if (!Array.isArray(levels)) {
        c.add(join(path, "levels"), "must be an array of 2 to 10 rubric levels, lowest first");
        return;
    }
    if (levels.length < 2 || levels.length > 10)
        c.add(join(path, "levels"), `a Score needs 2 to 10 levels; found ${levels.length}`);
    for (const [i, level] of (levels as unknown[]).entries()) {
        const levelPath = `${join(path, "levels")}[${i}]`;
        if (typeof level === "string") {
            if (level === "") c.add(levelPath, mustBeNonEmptyString);
        } else if (!isRecord(level) || !isDescription(level.description)) {
            c.add(levelPath, "must be a non-empty string or { description, label?, value? }");
        } else {
            c.optionalString(level, "label", levelPath);
        }
    }
    const output = c.optionalRecord(def, "output", path);
    if (output !== undefined) {
        const outputPath = join(path, "output");
        if (typeof output.store !== "function") {
            c.optionalEnum(output, "store", outputPath, ["score", "level", "level-label", "level-value"]);
        }
        c.optionalEnum(output, "levelFrom", outputPath, ["nearest", "most-probable"]);
        checkPrecision(c, output, outputPath);
        c.optionalFunction(output, "format", outputPath);
        c.optionalFunction(output, "toCell", outputPath);
        if (output.store === "level-value") {
            for (const [i, level] of (levels as unknown[]).entries()) {
                if (!isRecord(level) || level.value === undefined) {
                    c.add(
                        `${join(path, "levels")}[${i}]`,
                        'output.store is "level-value", so every level needs a value'
                    );
                }
            }
        }
    }
    const presentation = c.optionalRecord(def, "presentation", path);
    if (presentation !== undefined) {
        for (const key of ["showConfidence", "rubricBar"]) {
            if (presentation[key] !== undefined && typeof presentation[key] !== "boolean")
                c.add(join(join(path, "presentation"), key), mustBeBoolean);
        }
    }
    const policy = c.optionalRecord(def, "policy", path);
    if (policy !== undefined) {
        checkPolicy(c, policy, join(path, "policy"), (gate, gatePath, bounds) =>
            checkScoreGate(c, gate, gatePath, levels.length, bounds)
        );
    }
}

function checkNoul(c: Collector, def: Rec, path: string): void {
    const criteria = c.optionalRecord(def, "criteria", path);
    if (criteria !== undefined) {
        for (const [key, value] of Object.entries(criteria)) {
            const criteriaPath = join(join(path, "criteria"), key);
            if (key !== "true" && key !== "false")
                c.add(criteriaPath, "unknown key; Noul criteria have only true and false");
            else if (value !== undefined && !isDescription(value))
                c.add(criteriaPath, "must be a non-empty string or an object");
        }
    }
    const output = c.optionalRecord(def, "output", path) ?? {};
    const outputPath = join(path, "output");
    c.optionalEnum(output, "store", outputPath, ["probability", "boolean", "label"]);
    checkPrecision(c, output, outputPath);
    c.optionalFunction(output, "format", outputPath);
    c.optionalFunction(output, "toCell", outputPath);
    const store = output.store ?? "probability";
    const bandsPath = join(outputPath, "bands");
    if (store === "boolean" || store === "label") {
        const bands = output.bands;
        if (!isRecord(bands)) {
            c.add(
                bandsPath,
                `output.store "${store}" needs bands: { falseAtOrBelow, trueAtOrAbove, between }; there are no default bands`
            );
        } else {
            for (const key of ["falseAtOrBelow", "trueAtOrAbove"]) {
                if (!isUnit(bands[key])) c.add(join(bandsPath, key), mustBeUnit);
            }
            if (
                isUnit(bands.falseAtOrBelow) &&
                isUnit(bands.trueAtOrAbove) &&
                bands.falseAtOrBelow >= bands.trueAtOrAbove
            ) {
                c.add(
                    bandsPath,
                    `falseAtOrBelow (${bands.falseAtOrBelow}) must be < trueAtOrAbove (${bands.trueAtOrAbove})`
                );
            }
            if (bands.between !== "review" && bands.between !== "withhold")
                c.add(join(bandsPath, "between"), 'must be "review" or "withhold"');
        }
    } else if (output.bands !== undefined) {
        c.add(bandsPath, 'bands apply only to output.store "boolean" and "label"');
    }
    const labels = c.optionalRecord(output, "labels", outputPath);
    if (labels !== undefined) {
        for (const key of Object.keys(labels)) {
            if (key !== "true" && key !== "false" && key !== "uncertain")
                c.add(join(join(outputPath, "labels"), key), "unknown key; expected true, false or uncertain");
            else c.optionalString(labels, key, join(outputPath, "labels"));
        }
    }
    const presentation = c.optionalRecord(def, "presentation", path);
    if (presentation?.probabilityBar !== undefined && typeof presentation.probabilityBar !== "boolean") {
        c.add(join(join(path, "presentation"), "probabilityBar"), mustBeBoolean);
    }
    const policy = c.optionalRecord(def, "policy", path);
    if (policy !== undefined) {
        checkPolicy(c, policy, join(path, "policy"), (gate, gatePath, bounds) =>
            checkNoulGate(c, gate, gatePath, bounds)
        );
    }
}

function checkColumn(
    c: Collector,
    columnId: string,
    def: unknown,
    config: Rec,
    gridColumnIds: ReadonlySet<string> | undefined
): void {
    const path = join("columns", columnId);
    if (!isRecord(def)) {
        c.add(path, "must be an AI column definition object");
        return;
    }
    if (gridColumnIds !== undefined && !gridColumnIds.has(columnId)) {
        c.add(path, `no grid column has id "${columnId}"; AI columns must be grid columns with a matching id`);
    }
    const instructions = def.instructions;
    if (!(isNonEmptyString(instructions) || isRecord(instructions) || Array.isArray(instructions))) {
        c.add(join(path, "instructions"), "is required: a non-empty string, an object or an array");
    }

    const sources = def.sources;
    if (sources !== undefined && !Array.isArray(sources)) {
        c.add(join(path, "sources"), "must be an array of column ids");
    } else {
        for (const [i, source] of ((sources ?? []) as unknown[]).entries()) {
            const sourcePath = `${join(path, "sources")}[${i}]`;
            if (!isNonEmptyString(source)) c.add(sourcePath, "must be a non-empty column id");
            else if (source === columnId) c.add(sourcePath, "a column can't be its own source");
            else if (gridColumnIds !== undefined && !gridColumnIds.has(source))
                c.add(sourcePath, `no grid column has id "${source}"`);
        }
        if ((sources ?? []).length === 0 && def.state === undefined && config.rowState === undefined) {
            c.add(
                join(path, "sources"),
                "a column with no sources needs a state accessor: the column's state or the grid's rowState"
            );
        }
    }

    for (const key of ["state", "applies", "isMissing", "isEmpty"]) c.optionalFunction(def, key, path);
    c.optionalEnum(def, "missingInput", path, ["skip", "evaluate"]);
    c.optionalEnum(def, "overwrite", path, ["never", "suggest", "apply"]);
    c.optionalString(def, "model", path);

    const scopes = def.fillScopes;
    if (scopes !== undefined) {
        if (!Array.isArray(scopes) || scopes.length === 0) {
            c.add(join(path, "fillScopes"), `must be a non-empty array of ${fillScopes.join(", ")}`);
        } else {
            for (const [i, scope] of (scopes as unknown[]).entries()) {
                if (typeof scope !== "string" || !fillScopes.includes(scope)) {
                    c.add(`${join(path, "fillScopes")}[${i}]`, `must be one of ${fillScopes.join(", ")}`);
                }
            }
        }
    }
    const policy = def.policy;
    const effectiveScopes = Array.isArray(scopes) ? (scopes as unknown[]) : defaultFillScopes;
    if (
        isRecord(policy) &&
        policy.autoApply !== undefined &&
        (def.overwrite ?? "never") === "never" &&
        effectiveScopes.includes("column")
    ) {
        c.add(
            join(join(path, "policy"), "autoApply"),
            'autoApply with overwrite "never" conflicts with the "column" fill scope, which includes populated cells; remove "column" or set overwrite'
        );
    }

    switch (def.primitive) {
        case "choice":
            checkChoice(c, def, path);
            break;
        case "score":
            checkScore(c, def, path);
            break;
        case "noul":
            checkNoul(c, def, path);
            break;
        default:
            c.add(join(path, "primitive"), 'must be "choice", "score" or "noul"');
    }
}

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
export function validateAIFillConfig(
    config: AIFillConfig,
    options: ValidateAIFillConfigOptions = {}
): AIFillConfigIssue[] {
    const c = new Collector();
    const raw: unknown = config;
    if (!isRecord(raw)) {
        c.add("", "the AI Fill configuration must be an object");
        return c.issues;
    }
    checkConnection(c, raw.connection, options.isBrowser ?? detectBrowser());
    if (!isNonEmptyString(raw.model)) c.add("model", 'is required, for example "jev-latest"');

    const rows = raw.rows;
    if (!isRecord(rows) || typeof rows.getRowId !== "function") {
        c.add("rows.getRowId", "is required: a function from display row to stable row id");
    } else {
        c.optionalFunction(rows, "getRowIndex", "rows");
    }
    for (const key of [
        "rowState",
        "rowScope",
        "onRunStart",
        "onRunProgress",
        "onRunEnd",
        "onResult",
        "onCommit",
        "onReject",
        "onError",
        "onReady",
    ]) {
        c.optionalFunction(raw, key, "");
    }
    const execution = c.optionalRecord(raw, "execution", "");
    if (execution !== undefined) checkExecution(c, execution);

    let gridColumnIds: Set<string> | undefined;
    if (options.columns !== undefined) {
        gridColumnIds = new Set();
        for (const column of options.columns) {
            if (column.id === undefined) continue;
            if (gridColumnIds.has(column.id)) c.add("columns", `several grid columns have id "${column.id}"`);
            gridColumnIds.add(column.id);
        }
    }

    const columns = raw.columns;
    if (!isRecord(columns)) {
        c.add("columns", "must be an object mapping grid column ids to AI column definitions");
        return c.issues;
    }
    for (const [columnId, def] of Object.entries(columns)) {
        checkColumn(c.forColumn(columnId), columnId, def, raw, gridColumnIds);
    }
    return c.issues;
}
