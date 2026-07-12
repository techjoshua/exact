import ts from "typescript";
import {
  hasDefaultModifier,
  hasExportModifier,
  isIdentifierDeclarationName,
  isPropertyAccessName,
  nodeNameText
} from "./ast.js";
import { stableId } from "./ids.js";
import type {
  ExactSemanticDeclarationIR,
  ExactSemanticExportIR,
  ExactSemanticGraphIR,
  ExactSemanticReferenceIR,
  ExactSemanticScopeIR,
  SemanticDeclarationIndex,
  SemanticReferenceIndex
} from "./types.js";

export const browserGlobals = new Set(["window", "document", "localStorage", "sessionStorage", "navigator", "HTMLElement", "Node"]);

export function buildSemanticGraph(sourceFile: ts.SourceFile): ExactSemanticGraphIR {
  const scopes: ExactSemanticScopeIR[] = [];
  const declarations: ExactSemanticDeclarationIR[] = [];
  const references: ExactSemanticReferenceIR[] = [];
  const exports: ExactSemanticExportIR[] = [];
  const declarationsByScope = new Map<string, Map<string, ExactSemanticDeclarationIR>>();
  const scopeParents = new Map<string, string | undefined>();
  const scopeStack: ExactSemanticScopeIR[] = [];
  let scopeIndex = 0;

  const pushScope = (kind: ExactSemanticScopeIR["kind"], node: ts.Node): ExactSemanticScopeIR => {
    const parent = scopeStack[scopeStack.length - 1];
    const scope: ExactSemanticScopeIR = {
      id: stableId(sourceFile.fileName, "scope", String(scopeIndex++), String(node.getStart(sourceFile)), String(node.getEnd())),
      ...(parent ? { parentId: parent.id } : {}),
      kind,
      nodeKind: ts.SyntaxKind[node.kind]
    };
    scopes.push(scope);
    declarationsByScope.set(scope.id, new Map());
    scopeParents.set(scope.id, scope.parentId);
    scopeStack.push(scope);
    return scope;
  };

  const popScope = (): void => {
    scopeStack.pop();
  };

  const currentScope = (): ExactSemanticScopeIR => scopeStack[scopeStack.length - 1]!;

  const declare = (
    name: string,
    kind: ExactSemanticDeclarationIR["kind"],
    node: ts.Node,
    metadata: Pick<ExactSemanticDeclarationIR, "moduleSpecifier" | "importedName" | "typeOnly" | "exportedName"> = {}
  ): ExactSemanticDeclarationIR => {
    const declaration: ExactSemanticDeclarationIR = {
      id: stableId(sourceFile.fileName, "decl", kind, name, String(node.getStart(sourceFile)), String(node.getEnd())),
      name,
      scopeId: currentScope().id,
      kind,
      nodeStart: node.getStart(sourceFile),
      nodeEnd: node.getEnd(),
      ...metadata
    };
    declarations.push(declaration);
    if (declaration.exportedName) {
      exports.push({
        exportedName: declaration.exportedName,
        localName: declaration.name,
        ...(declaration.typeOnly ? { typeOnly: true } : {})
      });
    }
    declarationsByScope.get(declaration.scopeId)!.set(name, declaration);
    return declaration;
  };

  const lookup = (name: string, scopeId: string): ExactSemanticDeclarationIR | undefined => {
    let cursor: string | undefined = scopeId;
    while (cursor) {
      const declaration = declarationsByScope.get(cursor)?.get(name);
      if (declaration) return declaration;
      cursor = scopeParents.get(cursor);
    }
    return undefined;
  };

  const addReference = (node: ts.Identifier): void => {
    if (isIdentifierDeclarationName(node) || isPropertyAccessName(node) || isNonReferenceIdentifier(node)) return;
    addSemanticReference(node);
  };

  const addSemanticReference = (
    node: ts.Identifier,
    metadata: Pick<ExactSemanticReferenceIR, "typeOnly" | "exportedName"> = {}
  ): void => {
    const scope = currentScope();
    references.push({
      name: node.text,
      scopeId: scope.id,
      source: "unresolved",
      nodeStart: node.getStart(sourceFile),
      nodeEnd: node.getEnd(),
      ...metadata
    });
  };

  const resolveReference = (reference: ExactSemanticReferenceIR): ExactSemanticReferenceIR => {
    const declaration = lookup(reference.name, reference.scopeId);
    return {
      ...reference,
      source: declaration?.kind === "import" ? "import" : declaration ? "local" : browserGlobals.has(reference.name) ? "global" : "unresolved",
      ...(declaration ? { declarationId: declaration.id } : {}),
      ...(declaration ? { declarationKind: declaration.kind } : {}),
      ...(declaration?.moduleSpecifier ? { moduleSpecifier: declaration.moduleSpecifier } : {}),
      ...(declaration?.importedName ? { importedName: declaration.importedName } : {}),
      ...(reference.typeOnly || declaration?.typeOnly ? { typeOnly: true } : {}),
      ...(reference.exportedName ?? declaration?.exportedName ? { exportedName: reference.exportedName ?? declaration?.exportedName } : {})
    };
  };

  const declareBinding = (name: ts.BindingName, kind: "variable" | "parameter"): void => {
    if (ts.isIdentifier(name)) {
      declare(name.text, kind, name);
      return;
    }
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) declareBinding(element.name, kind);
    }
  };

  const declareImportClause = (statement: ts.ImportDeclaration): void => {
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return;
    const moduleSpecifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) return;
    if (clause.name) {
      declare(clause.name.text, "import", clause.name, { moduleSpecifier, importedName: "default", typeOnly: clause.isTypeOnly });
    }
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      declare(clause.namedBindings.name.text, "import", clause.namedBindings.name, { moduleSpecifier, importedName: "*", typeOnly: clause.isTypeOnly });
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        declare(element.name.text, "import", element.name, {
          moduleSpecifier,
          importedName: element.propertyName?.text ?? element.name.text,
          typeOnly: clause.isTypeOnly || element.isTypeOnly
        });
      }
    }
  };

  const visitFunctionLike = (node: ts.FunctionLikeDeclarationBase): void => {
    pushScope("function", node);
    for (const parameter of node.parameters) declareBinding(parameter.name, "parameter");
    if (node.type) visit(node.type);
    if (node.body) visit(node.body);
    popScope();
  };

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      declareImportClause(node);
      return;
    }

    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const exportedName = element.name.text;
          const importedName = element.propertyName?.text ?? element.name.text;
          if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
            exports.push({
              exportedName,
              importedName,
              moduleSpecifier: node.moduleSpecifier.text,
              typeOnly: node.isTypeOnly || element.isTypeOnly
            });
          } else {
            const localName = element.propertyName ?? element.name;
            if (ts.isIdentifier(localName)) {
              exports.push({
                exportedName,
                localName: localName.text,
                typeOnly: node.isTypeOnly || element.isTypeOnly
              });
              addSemanticReference(localName, { exportedName });
            }
          }
        }
      }
      return;
    }

    if (ts.isTypeReferenceNode(node)) {
      addTypeReference(node.typeName);
      for (const argument of node.typeArguments ?? []) visit(argument);
      return;
    }

    if (ts.isExpressionWithTypeArguments(node)) {
      if (ts.isIdentifier(node.expression)) addSemanticReference(node.expression, { typeOnly: true });
      for (const argument of node.typeArguments ?? []) visit(argument);
      return;
    }

    if (ts.isFunctionDeclaration(node)) {
      if (node.name) declare(node.name.text, "function", node.name, exportDeclarationMetadata(node));
      visitFunctionLike(node);
      return;
    }

    if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
      if (ts.isFunctionExpression(node) && node.name) declare(node.name.text, "function", node.name);
      visitFunctionLike(node);
      return;
    }

    if (ts.isClassDeclaration(node)) {
      if (node.name) declare(node.name.text, "class", node.name, exportDeclarationMetadata(node));
      pushScope("block", node);
      for (const member of node.members) visit(member);
      popScope();
      return;
    }

    if (ts.isTypeAliasDeclaration(node)) {
      declare(node.name.text, "type", node.name, exportDeclarationMetadata(node));
      visit(node.type);
      return;
    }

    if (ts.isInterfaceDeclaration(node)) {
      declare(node.name.text, "interface", node.name, exportDeclarationMetadata(node));
      for (const heritage of node.heritageClauses ?? []) visit(heritage);
      for (const member of node.members) visit(member);
      return;
    }

    if (ts.isBlock(node) || ts.isModuleBlock(node)) {
      pushScope("block", node);
      ts.forEachChild(node, visit);
      popScope();
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      declareBinding(node.name, "variable");
      if (node.type) visit(node.type);
      if (node.initializer) visit(node.initializer);
      return;
    }

    if (ts.isParameter(node)) {
      declareBinding(node.name, "parameter");
      if (node.type) visit(node.type);
      if (node.initializer) visit(node.initializer);
      return;
    }

    if (ts.isIdentifier(node)) {
      addReference(node);
      return;
    }

    ts.forEachChild(node, visit);
  }

  function addTypeReference(name: ts.EntityName): void {
    if (ts.isIdentifier(name)) {
      addSemanticReference(name, { typeOnly: true });
      return;
    }
    addTypeReference(name.left);
  }

  function exportDeclarationMetadata(node: ts.Node): Pick<ExactSemanticDeclarationIR, "exportedName"> {
    if (!hasExportModifier(node)) return {};
    return { exportedName: hasDefaultModifier(node) ? "default" : nodeNameText(node) };
  }

  pushScope("module", sourceFile);
  ts.forEachChild(sourceFile, visit);
  popScope();

  return {
    scopes,
    declarations: declarations.sort((left, right) => left.nodeStart - right.nodeStart || left.name.localeCompare(right.name)),
    references: references.map(resolveReference).sort((left, right) => left.nodeStart - right.nodeStart || left.name.localeCompare(right.name)),
    exports: exports.sort((left, right) => left.exportedName.localeCompare(right.exportedName))
  };
}

export function createSemanticReferenceIndex(sourceFile: ts.SourceFile, graph: ExactSemanticGraphIR): SemanticReferenceIndex {
  return new Map(graph.references.map(reference => [semanticReferenceKey(sourceFile, reference.name, reference.nodeStart, reference.nodeEnd), reference]));
}

export function createSemanticDeclarationIndex(sourceFile: ts.SourceFile, graph: ExactSemanticGraphIR): SemanticDeclarationIndex {
  return new Map(graph.declarations.map(declaration => [semanticReferenceKey(sourceFile, declaration.name, declaration.nodeStart, declaration.nodeEnd), declaration]));
}

export function semanticReferenceForIdentifier(
  node: ts.Identifier,
  references: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): ExactSemanticReferenceIR | undefined {
  return references.get(semanticReferenceKey(sourceFile, node.text, node.getStart(sourceFile), node.getEnd()));
}

export function semanticDeclarationForIdentifier(
  node: ts.Identifier,
  declarations: SemanticDeclarationIndex,
  sourceFile: ts.SourceFile
): ExactSemanticDeclarationIR | undefined {
  return declarations.get(semanticReferenceKey(sourceFile, node.text, node.getStart(sourceFile), node.getEnd()));
}

export function isBrowserGlobalReference(node: ts.Identifier, reference: ExactSemanticReferenceIR | undefined): boolean {
  return browserGlobals.has(node.text) && reference?.source === "global";
}

function semanticReferenceKey(_sourceFile: ts.SourceFile, name: string, start: number, end: number): string {
  return `${name}:${start}:${end}`;
}

function isNonReferenceIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return true;
  if (ts.isExportSpecifier(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
  if (ts.isPropertySignature(parent) && parent.name === node) return true;
  if (ts.isMethodSignature(parent) && parent.name === node) return true;
  if (ts.isJsxAttribute(parent) && parent.name === node) return true;
  if (isLowercaseJsxTagIdentifier(node)) return true;
  return false;
}

function isLowercaseJsxTagIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  const isTagName = !!parent && (
    (ts.isJsxOpeningElement(parent) && parent.tagName === node)
    || (ts.isJsxClosingElement(parent) && parent.tagName === node)
    || (ts.isJsxSelfClosingElement(parent) && parent.tagName === node)
  );
  return isTagName && node.text[0] === node.text[0]?.toLowerCase();
}
