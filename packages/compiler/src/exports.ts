import ts from "typescript";
import {
  hasDefaultModifier,
  hasExportModifier
} from "./ast.js";
import { buildSemanticGraph } from "./semantic.js";
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
export function collectExports(sourceFile: ts.SourceFile, semanticGraph?: ExactSemanticGraphIR): Set<string> {
  return new Set([...collectExportBindings(sourceFile, semanticGraph ?? buildSemanticGraph(sourceFile)).keys()]);
}

/** Collects exported-to-local binding names from semantic export declarations. */
export function collectExportBindings(sourceFile: ts.SourceFile, semanticGraph: ExactSemanticGraphIR): Map<string, ExportBinding> {
  const exports = new Map<string, ExportBinding>();

  for (const exported of semanticGraph.exports) {
    if (!exported.localName || exported.moduleSpecifier) continue;
    exports.set(exported.exportedName, {
      exportedName: exported.exportedName,
      localName: exported.localName
    });
  }

  if (exports.size) return exports;

  // Keep a syntax fallback for older/simple test cases where semantic export
  // capture is unavailable or intentionally bypassed.
  for (const statement of sourceFile.statements) {
    if (hasExportModifier(statement)) {
      const hasDefault = hasDefaultModifier(statement);
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        if (hasDefault) {
          exports.set("default", {
            exportedName: "default",
            localName: statement.name.text
          });
        } else {
          exports.set(statement.name.text, {
            exportedName: statement.name.text,
            localName: statement.name.text
          });
        }
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            exports.set(declaration.name.text, {
              exportedName: declaration.name.text,
              localName: declaration.name.text
            });
          }
        }
      }
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        exports.set(element.name.text, {
          exportedName: element.name.text,
          localName: element.propertyName?.text ?? element.name.text
        });
      }
    }
  }

  return exports;
}
