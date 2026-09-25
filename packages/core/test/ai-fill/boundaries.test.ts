// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Enforces AI Fill's import boundaries inside core (SPST-17, Amendment 1, A2).
 *
 * 1. `ai-fill/**` imports core types and helpers from the modules that define
 *    them, never from a package entry, `src/index.ts` or `data-editor-all.tsx`.
 * 2. Outside `ai-fill/`, only `src/index.ts` and `src/data-editor-all.tsx`
 *    import from `ai-fill/`. `data-editor/data-editor.tsx` may import types only.
 * 3. The module graph reachable from `ai-fill/server/index.ts` has no
 *    `react`, `react-dom` or `@linaria/*` import, no `.tsx` file, and no
 *    module-level `window` or `document` reference.
 * 4. `ai-fill/testing/**` imports only from `testing/`, `contract/`,
 *    `identity/` and `transport/`, and nothing from `react/`.
 *
 * Core never imports from the cells or source packages, which depend on it.
 */

const srcDir = path.resolve("src");
const aiFillDir = path.join(srcDir, "ai-fill");

interface ImportRecord {
    readonly file: string;
    readonly specifier: string;
    /** The absolute target without its extension, for relative specifiers. */
    readonly target: string | undefined;
    readonly typeOnly: boolean;
}

function listSourceFiles(dir: string): string[] {
    return fs
        .readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter(name => /\.tsx?$/.test(name) && !name.endsWith(".d.ts"))
        .map(name => path.join(dir, name))
        .sort();
}

function withoutExtension(file: string): string {
    return file.replace(/\.(?:[cm]?js|jsx|tsx?)$/, "");
}

function collectImports(file: string): ImportRecord[] {
    const text = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true);
    const records: ImportRecord[] = [];

    const add = (specifier: string, typeOnly: boolean) => {
        const target = specifier.startsWith(".")
            ? withoutExtension(path.resolve(path.dirname(file), specifier))
            : undefined;
        records.push({ file, specifier, target, typeOnly });
    };

    const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const clause = node.importClause;
            const bindings = clause?.namedBindings;
            const typeOnly =
                clause !== undefined &&
                (clause.isTypeOnly ||
                    (clause.name === undefined &&
                        bindings !== undefined &&
                        ts.isNamedImports(bindings) &&
                        bindings.elements.length > 0 &&
                        bindings.elements.every(element => element.isTypeOnly)));
            add(node.moduleSpecifier.text, typeOnly);
        } else if (
            ts.isExportDeclaration(node) &&
            node.moduleSpecifier !== undefined &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            add(node.moduleSpecifier.text, node.isTypeOnly);
        } else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length === 1 &&
            ts.isStringLiteral(node.arguments[0])
        ) {
            add(node.arguments[0].text, false);
        } else if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
        ) {
            add(node.argument.literal.text, true);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return records;
}

/** Resolves a relative import target (without extension) to its source file. */
function resolveSource(target: string): string | undefined {
    return [".ts", ".tsx"].map(extension => target + extension).find(file => fs.existsSync(file));
}

/** Every source file reachable from `entry` through relative imports, including type-only ones. */
function moduleGraph(entry: string): string[] {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.shift() ?? "";
        if (seen.has(file)) continue;
        seen.add(file);
        for (const record of collectImports(file)) {
            const resolved = record.target === undefined ? undefined : resolveSource(record.target);
            if (resolved !== undefined) queue.push(resolved);
        }
    }
    return [...seen].sort();
}

/** `window` and `document` references outside any function body, as `file:line`. */
function moduleLevelDomReferences(file: string): string[] {
    const sourceFile = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
    const found: string[] = [];
    const visit = (node: ts.Node, insideFunction: boolean) => {
        if (
            !insideFunction &&
            ts.isIdentifier(node) &&
            (node.text === "window" || node.text === "document") &&
            !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
        ) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            found.push(`${path.relative(srcDir, file)}:${line + 1}`);
        }
        const entersFunction = ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node);
        ts.forEachChild(node, child => visit(child, insideFunction || entersFunction));
    };
    visit(sourceFile, false);
    return found;
}

function isInside(target: string, dir: string): boolean {
    return target.startsWith(dir + path.sep);
}

function describeRecord(record: ImportRecord): string {
    return `${path.relative(srcDir, record.file)} -> ${record.specifier}`;
}

const allImports = listSourceFiles(srcDir).flatMap(collectImports);
const aiFillImports = allImports.filter(record => isInside(record.file, aiFillDir));

describe("AI Fill import boundaries", () => {
    it("finds the AI Fill sources", () => {
        expect(aiFillImports.length).toBeGreaterThan(0);
    });

    it("rule 1: ai-fill imports core from defining modules, not from entry points", () => {
        const entryPoints = new Set([path.join(srcDir, "index"), path.join(srcDir, "data-editor-all")]);
        const violations = aiFillImports
            .filter(record =>
                record.target === undefined
                    ? record.specifier.startsWith("@specstory/")
                    : entryPoints.has(record.target)
            )
            .map(describeRecord);
        expect(violations).toEqual([]);
    });

    it("rule 2: only src/index.ts and src/data-editor-all.tsx import from ai-fill", () => {
        const allowed = new Set([path.join(srcDir, "index.ts"), path.join(srcDir, "data-editor-all.tsx")]);
        const typeOnlyAllowed = new Set([path.join(srcDir, "data-editor", "data-editor.tsx")]);
        const violations = allImports
            .filter(record => !isInside(record.file, aiFillDir))
            .filter(record => record.target !== undefined && isInside(record.target, aiFillDir))
            .filter(record => !allowed.has(record.file))
            .filter(record => !(record.typeOnly && typeOnlyAllowed.has(record.file)))
            .map(describeRecord);
        expect(violations).toEqual([]);
    });

    describe("rule 3: the /server graph runs without React, the DOM or Linaria", () => {
        const graph = moduleGraph(path.join(aiFillDir, "server", "index.ts"));

        it("walks the /server graph", () => {
            expect(graph).toContain(path.join(aiFillDir, "server", "index.ts"));
            expect(typeof window).toBe("undefined");
        });

        it("has no react, react-dom or @linaria import", () => {
            const violations = graph
                .flatMap(collectImports)
                .filter(record => /^(?:react|react-dom)(?:\/|$)|^@linaria\//.test(record.specifier))
                .map(describeRecord);
            expect(violations).toEqual([]);
        });

        it("has no .tsx file", () => {
            expect(graph.filter(file => file.endsWith(".tsx")).map(file => path.relative(srcDir, file))).toEqual([]);
        });

        it("has no module-level window or document reference", () => {
            expect(graph.flatMap(moduleLevelDomReferences)).toEqual([]);
        });
    });

    it("rule 4: ai-fill/testing imports only testing, contract, identity and transport", () => {
        const testingDir = path.join(aiFillDir, "testing");
        const allowedDirs = ["testing", "contract", "identity", "transport"].map(dir => path.join(aiFillDir, dir));
        const violations = aiFillImports
            .filter(record => isInside(record.file, testingDir))
            .filter(
                record => record.target !== undefined && !allowedDirs.some(dir => isInside(record.target ?? "", dir))
            )
            .map(describeRecord);
        expect(violations).toEqual([]);
    });

    it("core never imports from the cells or source packages", () => {
        const violations = allImports
            .filter(record => /^@specstory\/ai-data-grid-(?:cells|source)(?:\/|$)/.test(record.specifier))
            .map(describeRecord);
        expect(violations).toEqual([]);
    });
});
