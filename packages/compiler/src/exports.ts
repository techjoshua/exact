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

export function isComponentLikeFunction(node: ts.FunctionDeclaration): boolean {
  const first = node.name?.text[0];
  return !!first && first === first.toUpperCase();
}

export function collectExports(sourceFile: ts.SourceFile): Set<string> {
  return new Set([...collectExportBindings(sourceFile, buildSemanticGraph(sourceFile)).keys()]);
}

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
