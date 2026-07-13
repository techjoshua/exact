import ts from "typescript";
import { describe, expect, it } from "vitest";
import { expressionModuleFor, clearExpressionProjectCache } from "./expression-project.js";
import { buildExpressionSemanticGraph, buildSemanticGraph } from "./semantic.js";

describe("expression-backed semantic graph", () => {
  it("matches lexical declaration and reference resolution during cutover", () => {
    clearExpressionProjectCache();
    const filename = "expression-semantic.tsx";
    const source = `
      import type { Model as Data } from "./model.js";
      import { helper as run } from "./helper.js";
      const value = 1;
      export function View(input: Data) {
        const value = run(input);
        return <section>{value}</section>;
      }
      export { value as answer };
    `;
    const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    const legacy = buildSemanticGraph(sourceFile);
    const expression = buildExpressionSemanticGraph(expressionModuleFor(filename, source));

    const declarationKey = (value: (typeof legacy.declarations)[number]) => [value.name, value.kind, value.moduleSpecifier, value.importedName, value.typeOnly ?? false];
    const referenceKey = (value: (typeof legacy.references)[number]) => [value.name, value.source, value.moduleSpecifier, value.typeOnly ?? false];
    const exportKey = (value: (typeof legacy.exports)[number]) => [value.exportedName, value.localName, value.moduleSpecifier, value.typeOnly ?? false];
    expect(expression.declarations.map(declarationKey)).toEqual(legacy.declarations.map(declarationKey));
    expect(expression.references.filter(reference => !reference.typeOnly).map(referenceKey)).toEqual(legacy.references.filter(reference => !reference.typeOnly).map(referenceKey));
    expect(expression.references.some(reference => reference.name === "Data" && reference.typeOnly)).toBe(true);
    expect(expression.exports.map(exportKey)).toEqual(legacy.exports.map(exportKey));
  });
});
