function serialize(input: unknown, ancestors: Set<object>): string | undefined {
    let value = input;
    if (typeof value === "object" && value !== null && typeof (value as { toJSON?: unknown }).toJSON === "function") {
        value = (value as { toJSON: () => unknown }).toJSON();
    }
    switch (typeof value) {
        case "string":
            return JSON.stringify(value);
        case "number":
            return Number.isFinite(value) ? JSON.stringify(value) : "null";
        case "boolean":
            return value ? "true" : "false";
        case "bigint":
            throw new TypeError("canonicalJson can't serialize a BigInt");
        case "undefined":
        case "function":
        case "symbol":
            return undefined;
    }
    if (value === null) return "null";
    const object = value as object;
    if (ancestors.has(object)) throw new TypeError("canonicalJson can't serialize a circular structure");
    ancestors.add(object);
    let result: string;
    if (Array.isArray(object)) {
        result = `[${object.map(item => serialize(item, ancestors) ?? "null").join(",")}]`;
    } else {
        const record = object as Record<string, unknown>;
        const members: string[] = [];
        for (const key of Object.keys(record).sort()) {
            const member = serialize(record[key], ancestors);
            if (member !== undefined) members.push(`${JSON.stringify(key)}:${member}`);
        }
        result = `{${members.join(",")}}`;
    }
    ancestors.delete(object);
    return result;
}

/**
 * Serializes a value as canonical JSON: object keys sorted, no whitespace, and
 * otherwise the same rules as `JSON.stringify` (`toJSON` is honored, `undefined`,
 * functions and symbols are dropped from objects and become `null` in arrays,
 * and non-finite numbers become `null`). Two values that `JSON.stringify` would
 * send identically, whatever their key order, give the same string.
 *
 * @throws TypeError for a BigInt, a circular structure, or a top-level value with no JSON form.
 */
export function canonicalJson(value: unknown): string {
    const result = serialize(value, new Set());
    if (result === undefined) throw new TypeError(`canonicalJson can't serialize a value of type ${typeof value}`);
    return result;
}
