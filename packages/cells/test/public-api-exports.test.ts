import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Guards the public API against accidental drift: the sorted export names of
 * `src/index.ts` must match the 6.0.4-alpha25 (last upstream release) list
 * exactly. Adding or removing an export is a breaking-change signal and must
 * be deliberate — update this list only when the API change is intended.
 */
const expectedExports = [
    "ArticleCell",
    "ArticleCellType",
    "ButtonCell",
    "ButtonCellType",
    "DatePickerCell",
    "DatePickerType",
    "DropdownCell",
    "DropdownCellType",
    "LinksCell",
    "LinksCellType",
    "MultiSelectCell",
    "MultiSelectCellType",
    "RangeCell",
    "RangeCellType",
    "SparklineCell",
    "SparklineCellType",
    "SpinnerCell",
    "SpinnerCellType",
    "StarCell",
    "StarCellType",
    "TagsCell",
    "TagsCellType",
    "TreeViewCell",
    "TreeViewCellType",
    "UserProfileCell",
    "UserProfileCellType",
    "allCells",
];

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
    it("match the 6.0.4-alpha25 export list", () => {
        const entry = path.resolve("src/index.ts");
        expect(getExportedNames(entry)).toEqual(expectedExports);
    });
});
