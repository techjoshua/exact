import ts from "typescript";
import type {
  ExactSemanticGraphIR,
  ExportBinding
} from "./types.js";

/** Returns whether a function name follows the component naming convention. */
export function isComponentLikeFunction(node: ts.FunctionDeclaration): boolean {
  const first = node.name?.text[0];
  return !!first && first === first.toUpperCase();
}

/** Collects exported names from a source file. */
export function collectExports(_sourceFile: ts.SourceFile, semanticGraph: ExactSemanticGraphIR): Set<string> {
  return new Set([...collectExpressionExportBindings(semanticGraph).keys()]);
}

/** Collects exported-to-local binding names from semantic export declarations. */
export function collectExportBindings(sourceFile: ts.SourceFile, semanticGraph: ExactSemanticGraphIR): Map<string, ExportBinding> {
  void sourceFile;
  return collectExpressionExportBindings(semanticGraph);
}

/** Collects runtime export bindings without consulting TypeScript syntax nodes. */
export function collectExpressionExportBindings(semanticGraph: ExactSemanticGraphIR): Map<string, ExportBinding> {
  const exports = new Map<string, ExportBinding>();

  for (const exported of semanticGraph.exports) {
    if (!exported.localName || exported.moduleSpecifier || exported.typeOnly) continue;
    exports.set(exported.exportedName, {
      exportedName: exported.exportedName,
      localName: exported.localName
    });
  }

  return exports;
}
