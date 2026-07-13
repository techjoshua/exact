import ts from "typescript";
import type { BoundModule, ExpressionScope, NodeRef, Variable } from "@exact/expressions";
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

/** Builds the compiler semantic IR from canonical expression bindings. */
export function buildExpressionSemanticGraph(module: BoundModule): ExactSemanticGraphIR {
  const scopeNodes = new Map<string, NodeRef>();
  const expressionScopes = new Map<string, ExpressionScope>();
  for (const reference of module.walk()) {
    let scope: ExpressionScope | undefined = reference.node.scope;
    while (scope) {
      expressionScopes.set(scope.id, scope);
      if (!scopeNodes.has(scope.id)) scopeNodes.set(scope.id, reference);
      scope = scope.parent;
    }
  }
  const scopes = [...expressionScopes.values()].map(scope => ({
    id: scope.id,
    ...(scope.parent ? { parentId: scope.parent.id } : {}),
    kind: semanticScopeKind(scope.kind),
    nodeKind: scopeNodes.get(scope.id)?.node.kind ?? "Unknown"
  } satisfies ExactSemanticScopeIR));

  const declarations: ExactSemanticDeclarationIR[] = [];
  const declarationByVariable = new Map<string, ExactSemanticDeclarationIR>();
  for (const reference of module.walk().where(candidate => candidate.node.kind === "Identifier")) {
    const variable = reference.variable;
    if (!variable || declarationByVariable.has(variable.id) || !isDeclarationReference(reference)) continue;
    const kind = semanticDeclarationKind(variable.declarationKind);
    if (!kind || !reference.node.span) continue;
    const declaration: ExactSemanticDeclarationIR = {
      id: variable.id,
      name: variable.name,
      scopeId: variable.scope.id,
      kind,
      nodeStart: reference.node.span.start,
      nodeEnd: reference.node.span.end,
      ...(variable.importedFrom ? { moduleSpecifier: variable.importedFrom, importedName: importedName(reference) } : {}),
      ...(variable.typeOnly || isTypeOnly(reference) ? { typeOnly: true } : {}),
      ...(exportedName(reference) ? { exportedName: exportedName(reference) } : {})
    };
    declarations.push(declaration);
    declarationByVariable.set(variable.id, declaration);
  }

  const references: ExactSemanticReferenceIR[] = [];
  for (const reference of module.walk().where(candidate => candidate.node.kind === "Identifier")) {
    if (!reference.node.span || isDeclarationReference(reference) || isNonReference(reference)) continue;
    const variable = reference.variable;
    const declaration = variable ? declarationByVariable.get(variable.id) : undefined;
    const source = variable?.importedFrom ? "import" : declaration ? "local" : browserGlobals.has(reference.name ?? "") ? "global" : "unresolved";
    references.push({
      name: reference.name!,
      scopeId: reference.node.scope.id,
      source,
      nodeStart: reference.node.span.start,
      nodeEnd: reference.node.span.end,
      ...(declaration ? { declarationId: declaration.id, declarationKind: declaration.kind } : {}),
      ...(variable?.importedFrom ? { moduleSpecifier: variable.importedFrom, importedName: declaration?.importedName ?? variable.name } : {}),
      ...(variable?.typeOnly || isTypeOnly(reference) || declaration?.typeOnly ? { typeOnly: true } : {}),
      ...(exportSpecifierName(reference) ? { exportedName: exportSpecifierName(reference) } : {})
    });
  }

  const exports: ExactSemanticExportIR[] = [];
  for (const declaration of declarations) {
    if (declaration.exportedName) exports.push({ exportedName: declaration.exportedName, localName: declaration.name, ...(declaration.typeOnly ? { typeOnly: true } : {}) });
  }
  for (const specifier of module.walk().ofKind("ExportSpecifier")) {
    const identifiers = specifier.children().where(child => child.node.kind === "Identifier").toArray();
    const exported = identifiers.at(-1)?.name;
    const local = identifiers.at(-2)?.name ?? exported;
    if (!exported) continue;
    const declaration = identifiers.at(-2)?.variable ? declarationByVariable.get(identifiers.at(-2)!.variable!.id) : undefined;
    const exportDeclaration = specifier.ancestors().first(ancestor => ancestor.node.kind === "ExportDeclaration");
    const moduleSpecifier = exportDeclaration?.node.text?.match(/\bfrom\s*["']([^"']+)["']/)?.[1];
    exports.push({
      exportedName: exported,
      ...(moduleSpecifier ? { importedName: local, moduleSpecifier } : local ? { localName: local } : {}),
      ...(declaration?.typeOnly || /\btype\b/.test(specifier.node.text ?? "") ? { typeOnly: true } : {})
    });
  }

  return {
    scopes: scopes.sort((left, right) => left.id.localeCompare(right.id)),
    declarations: declarations.sort((left, right) => left.nodeStart - right.nodeStart || left.name.localeCompare(right.name)),
    references: references.sort((left, right) => left.nodeStart - right.nodeStart || left.name.localeCompare(right.name)),
    exports: dedupeExports(exports).sort((left, right) => left.exportedName.localeCompare(right.exportedName))
  };
}

/** Builds a lexical semantic graph of declarations, references, exports, and scopes. */
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
    // Resolve references by walking lexical parents, not by relying on raw text
    // matching. This is what lets later passes distinguish shadowed names.
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

/** Creates a fast lookup index for semantic references keyed by source span. */
export function createSemanticReferenceIndex(sourceFile: ts.SourceFile, graph: ExactSemanticGraphIR): SemanticReferenceIndex {
  return new Map(graph.references.map(reference => [semanticReferenceKey(sourceFile, reference.name, reference.nodeStart, reference.nodeEnd), reference]));
}

/** Creates a fast lookup index for semantic declarations keyed by source span. */
export function createSemanticDeclarationIndex(sourceFile: ts.SourceFile, graph: ExactSemanticGraphIR): SemanticDeclarationIndex {
  return new Map(graph.declarations.map(declaration => [semanticReferenceKey(sourceFile, declaration.name, declaration.nodeStart, declaration.nodeEnd), declaration]));
}

/** Returns the semantic reference associated with an identifier node. */
export function semanticReferenceForIdentifier(
  node: ts.Identifier,
  references: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): ExactSemanticReferenceIR | undefined {
  return references.get(semanticReferenceKey(sourceFile, node.text, node.getStart(sourceFile), node.getEnd()));
}

/** Returns the semantic declaration associated with an identifier node. */
export function semanticDeclarationForIdentifier(
  node: ts.Identifier,
  declarations: SemanticDeclarationIndex,
  sourceFile: ts.SourceFile
): ExactSemanticDeclarationIR | undefined {
  return declarations.get(semanticReferenceKey(sourceFile, node.text, node.getStart(sourceFile), node.getEnd()));
}

/** Returns whether an identifier resolves to a known browser global. */
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

function semanticScopeKind(kind: ExpressionScope["kind"]): ExactSemanticScopeIR["kind"] {
  if (kind === "module") return "module";
  if (kind === "function") return "function";
  return "block";
}

function semanticDeclarationKind(kind: string): ExactSemanticDeclarationIR["kind"] | undefined {
  if (kind === "ImportSpecifier" || kind === "ImportClause" || kind === "NamespaceImport") return "import";
  if (kind === "FunctionDeclaration" || kind === "FunctionExpression") return "function";
  if (kind === "ClassDeclaration" || kind === "ClassExpression") return "class";
  if (kind === "VariableDeclaration" || kind === "BindingElement") return "variable";
  if (kind === "Parameter") return "parameter";
  if (kind === "TypeAliasDeclaration" || kind === "TypeParameter") return "type";
  if (kind === "InterfaceDeclaration") return "interface";
  return undefined;
}

function isDeclarationReference(reference: NodeRef): boolean {
  const parent = reference.parent;
  if (!parent) return false;
  if ([
    "VariableDeclaration", "Parameter", "FunctionDeclaration", "FunctionExpression", "ClassDeclaration", "ClassExpression",
    "ImportSpecifier", "ImportClause", "NamespaceImport", "BindingElement", "TypeAliasDeclaration", "TypeParameter", "InterfaceDeclaration"
  ].includes(parent.node.kind)) {
    const identifiers = parent.node.children.filter(child => child.kind === "Identifier");
    if (parent.node.kind === "ImportSpecifier" || parent.node.kind === "BindingElement") return identifiers.at(-1) === reference.node;
    if (parent.node.kind === "VariableDeclaration" || parent.node.kind === "Parameter") return parent.node.children[0] === reference.node;
    return identifiers[0] === reference.node;
  }
  return false;
}

function isNonReference(reference: NodeRef): boolean {
  const parent = reference.parent;
  if (!parent) return false;
  if (parent.node.kind === "ImportSpecifier") {
    const identifiers = parent.children().where(child => child.node.kind === "Identifier").toArray();
    return identifiers.length > 1 && identifiers.at(-1)?.node !== reference.node;
  }
  if (parent.node.kind === "BindingElement") {
    const identifiers = parent.children().where(child => child.node.kind === "Identifier").toArray();
    return identifiers.length > 1 && identifiers.at(-1)?.node !== reference.node;
  }
  if (parent.node.kind === "ExportSpecifier") {
    if (parent.ancestors().first(ancestor => ancestor.node.kind === "ExportDeclaration")?.node.text?.match(/\bfrom\s*["']/)) return true;
    const identifiers = parent.children().where(child => child.node.kind === "Identifier").toArray();
    return identifiers.length > 1 && identifiers.at(-1)?.node === reference.node;
  }
  if (parent.node.kind === "PropertyAccessExpression" && parent.node.children.at(-1) === reference.node) return true;
  if (["PropertyAssignment", "PropertyDeclaration", "MethodDeclaration", "PropertySignature", "MethodSignature"].includes(parent.node.kind)
    && parent.node.children.find(child => child.kind === "Identifier") === reference.node) return true;
  if (parent.node.kind === "JsxAttribute") return true;
  if (["JsxOpeningElement", "JsxClosingElement", "JsxSelfClosingElement"].includes(parent.node.kind) && /^[a-z]/.test(reference.name ?? "")) return true;
  return false;
}

function isTypeOnly(reference: NodeRef): boolean {
  if (reference.node.category === "type" || reference.ancestors().any(ancestor => ancestor.node.category === "type")) return true;
  const importDeclaration = reference.ancestors().first(ancestor => ancestor.node.kind === "ImportDeclaration");
  return !!importDeclaration && /\bimport\s+type\b/.test(importDeclaration.node.text ?? "");
}

function importedName(reference: NodeRef): string {
  const parent = reference.parent;
  if (parent?.node.kind === "ImportClause") return "default";
  if (parent?.node.kind === "NamespaceImport") return "*";
  if (parent?.node.kind === "ImportSpecifier") {
    const identifiers = parent.children().where(child => child.node.kind === "Identifier").toArray();
    return identifiers.length > 1 ? identifiers[0]!.name! : reference.name!;
  }
  return reference.name!;
}

function exportedName(reference: NodeRef): string | undefined {
  const declaration = reference.parent;
  if (!declaration || !/^export\b/.test(declaration.node.text?.trimStart() ?? "")) return undefined;
  return /\bdefault\b/.test(declaration.node.text ?? "") ? "default" : reference.name;
}

function exportSpecifierName(reference: NodeRef): string | undefined {
  const parent = reference.parent;
  if (parent?.node.kind !== "ExportSpecifier") return undefined;
  const identifiers = parent.children().where(child => child.node.kind === "Identifier").toArray();
  if (identifiers.length === 1 && identifiers[0]?.node === reference.node) return reference.name;
  return identifiers[0]?.node === reference.node ? identifiers.at(-1)?.name : undefined;
}

function dedupeExports(values: readonly ExactSemanticExportIR[]): ExactSemanticExportIR[] {
  const result = new Map<string, ExactSemanticExportIR>();
  for (const value of values) result.set(`${value.exportedName}:${value.localName ?? ""}:${value.moduleSpecifier ?? ""}`, value);
  return [...result.values()];
}
