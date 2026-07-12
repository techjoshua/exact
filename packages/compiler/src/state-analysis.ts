import ts from "typescript";
import {
  semanticDeclarationForIdentifier,
  semanticReferenceForIdentifier
} from "./semantic.js";
import type {
  DerivedReactiveIndex,
  ExactContextEffect,
  ExactStateEffect,
  ReactiveSourceIndex,
  SemanticDeclarationIndex,
  SemanticReferenceIndex
} from "./types.js";

export function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

export function isThisStateAccess(expression: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === "state"
    && expression.expression.kind === ts.SyntaxKind.ThisKeyword;
}

export function isAnalyzableFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

export function collectDerivedReactiveLocals(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
  semanticReferences: SemanticReferenceIndex,
  semanticDeclarations: SemanticDeclarationIndex,
  baseDerived: DerivedReactiveIndex = new Map()
): DerivedReactiveIndex {
  const derived = new Map(baseDerived);
  const reactiveSources = collectFunctionReactiveSources(node, sourceFile, semanticDeclarations);

  function visit(current: ts.Node): void {
    if (current !== node && (ts.isFunctionLike(current) || ts.isClassLike(current))) return;
    if (ts.isVariableDeclaration(current)
      && ts.isIdentifier(current.name)
      && current.initializer
      && isConstVariableDeclaration(current)
      && isSafeDerivedReactiveInitializer(current.initializer)
      && expressionReadsReactiveInput(current.initializer, sourceFile, semanticReferences, derived, reactiveSources)) {
      const declaration = semanticDeclarationForIdentifier(current.name, semanticDeclarations, sourceFile);
      if (declaration) derived.set(declaration.id, current.initializer);
    }
    ts.forEachChild(current, visit);
  }

  if (node.body) visit(node.body);
  return derived;
}

function collectFunctionReactiveSources(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
  semanticDeclarations: SemanticDeclarationIndex
): ReactiveSourceIndex {
  const reactiveSources = new Set<string>();
  for (const parameter of node.parameters) {
    collectReactiveBindingSources(parameter.name, sourceFile, semanticDeclarations, reactiveSources);
  }
  return reactiveSources;
}

function collectReactiveBindingSources(
  name: ts.BindingName,
  sourceFile: ts.SourceFile,
  semanticDeclarations: SemanticDeclarationIndex,
  reactiveSources: ReactiveSourceIndex
): void {
  if (ts.isIdentifier(name)) {
    if (name.text === "this") return;
    const declaration = semanticDeclarationForIdentifier(name, semanticDeclarations, sourceFile);
    if (declaration) reactiveSources.add(declaration.id);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectReactiveBindingSources(element.name, sourceFile, semanticDeclarations, reactiveSources);
    }
  }
}

function isConstVariableDeclaration(node: ts.VariableDeclaration): boolean {
  return ts.isVariableDeclarationList(node.parent)
    && (node.parent.flags & ts.NodeFlags.Const) !== 0;
}

function expressionReadsReactiveInput(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  semanticReferences: SemanticReferenceIndex,
  derivedReactiveLocals: DerivedReactiveIndex,
  reactiveSources: ReactiveSourceIndex = new Set()
): boolean {
  let found = false;
  function visit(current: ts.Node): void {
    if (found) return;
    if (current !== node && (ts.isFunctionLike(current) || ts.isClassLike(current))) return;
    if (ts.isExpression(current) && stateEffectPath(current, sourceFile, semanticReferences, new Map()) !== undefined) {
      found = true;
      return;
    }
    if (ts.isIdentifier(current)) {
      const reference = semanticReferenceForIdentifier(current, semanticReferences, sourceFile);
      if (reference?.declarationId && derivedReactiveLocals.has(reference.declarationId)) {
        found = true;
        return;
      }
      if (reference?.declarationId && reactiveSources.has(reference.declarationId)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function isSafeDerivedReactiveInitializer(expression: ts.Expression): boolean {
  let safe = true;
  function visit(current: ts.Node): void {
    if (!safe) return;
    if (current !== expression && (ts.isFunctionLike(current) || ts.isClassLike(current))) {
      safe = false;
      return;
    }
    if (ts.isCallExpression(current)
      || ts.isNewExpression(current)
      || ts.isAwaitExpression(current)
      || ts.isYieldExpression(current)
      || ts.isDeleteExpression(current)
      || ts.isPostfixUnaryExpression(current)
      || ts.isPrefixUnaryExpression(current) && (current.operator === ts.SyntaxKind.PlusPlusToken || current.operator === ts.SyntaxKind.MinusMinusToken)
      || ts.isBinaryExpression(current) && isAssignmentOperator(current.operatorToken.kind)) {
      safe = false;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(expression);
  return safe;
}

export function collectStateAliases(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  semanticReferences: SemanticReferenceIndex,
  semanticDeclarations: SemanticDeclarationIndex,
  options: { skipNestedFunctions?: boolean } = { skipNestedFunctions: true }
): Map<string, string> {
  const aliases = new Map<string, string>();

  function visit(current: ts.Node): void {
    if (options.skipNestedFunctions !== false && current !== node && isTaskNestedFunction(current)) return;
    if (ts.isVariableDeclaration(current) && current.initializer) {
      const path = stateEffectPath(current.initializer, sourceFile, semanticReferences, aliases);
      if (path !== undefined) {
        collectStateBindingAliases(current.name, path, sourceFile, semanticDeclarations, aliases);
      }
    }
    ts.forEachChild(current, visit);
  }

  visit(node);
  return aliases;
}

function collectStateBindingAliases(
  name: ts.BindingName,
  basePath: string,
  sourceFile: ts.SourceFile,
  semanticDeclarations: SemanticDeclarationIndex,
  aliases: Map<string, string>
): void {
  if (ts.isIdentifier(name)) {
    const declaration = semanticDeclarationForIdentifier(name, semanticDeclarations, sourceFile);
    if (declaration) aliases.set(declaration.id, basePath);
    return;
  }

  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (element.dotDotDotToken) continue;
      const segment = bindingPropertySegment(element.propertyName ?? element.name, sourceFile);
      const childPath = appendStatePath(basePath, segment);
      collectStateBindingAliases(element.name, childPath, sourceFile, semanticDeclarations, aliases);
    }
    return;
  }

  name.elements.forEach((element, index) => {
    if (ts.isOmittedExpression(element) || element.dotDotDotToken) return;
    collectStateBindingAliases(element.name, appendStatePath(basePath, String(index)), sourceFile, semanticDeclarations, aliases);
  });
}

function bindingPropertySegment(name: ts.PropertyName | ts.BindingName, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return "*";
}

function appendStatePath(basePath: string, segment: string): string {
  return basePath === "*" ? segment : `${basePath}.${segment}`;
}

function isTaskNestedFunction(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node);
}

export function stateEffectPath(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  semanticReferences: SemanticReferenceIndex,
  aliases: Map<string, string>
): string | undefined {
  if (isThisStateAccess(expression)) return "*";
  if (ts.isIdentifier(expression)) {
    const reference = semanticReferenceForIdentifier(expression, semanticReferences, sourceFile);
    return reference?.declarationId ? aliases.get(reference.declarationId) : undefined;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = stateEffectPath(expression.expression, sourceFile, semanticReferences, aliases);
    if (parent === undefined) return undefined;
    return parent === "*" ? expression.name.text : `${parent}.${expression.name.text}`;
  }
  if (ts.isElementAccessExpression(expression)) {
    const parent = stateEffectPath(expression.expression, sourceFile, semanticReferences, aliases);
    if (parent === undefined) return undefined;
    const argument = expression.argumentExpression;
    const segment = argument && ts.isStringLiteralLike(argument) ? argument.text : "*";
    return parent === "*" ? segment : `${parent}.${segment}`;
  }
  return undefined;
}

export function contextEffectForCall(node: ts.Node, sourceFile: ts.SourceFile): ExactContextEffect | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  if (node.expression.expression.kind !== ts.SyntaxKind.ThisKeyword) return undefined;
  const method = node.expression.name.text;
  if (method !== "getContext" && method !== "setContext") return undefined;
  const token = node.arguments[0];
  return {
    token: token ? contextTokenName(token, sourceFile) : "unknown",
    kind: method === "getContext" ? "read" : "write",
    confidence: token && (ts.isIdentifier(token) || ts.isPropertyAccessExpression(token)) ? "exact" : "unknown"
  };
}

function contextTokenName(node: ts.Expression, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) return node.getText(sourceFile);
  return "unknown";
}

export function isStatePathExpression(expression: ts.Expression): boolean {
  if (isThisStateAccess(expression)) return true;
  if (ts.isPropertyAccessExpression(expression)) return isStatePathExpression(expression.expression);
  if (ts.isElementAccessExpression(expression)) return isStatePathExpression(expression.expression);
  return false;
}

export function statePath(expression: ts.Expression): string {
  if (isThisStateAccess(expression)) return "*";
  if (ts.isPropertyAccessExpression(expression) && isStatePathExpression(expression.expression)) {
    const parent = statePath(expression.expression);
    return parent === "*" ? expression.name.text : `${parent}.${expression.name.text}`;
  }
  if (ts.isElementAccessExpression(expression) && isStatePathExpression(expression.expression)) {
    const parent = statePath(expression.expression);
    const argument = expression.argumentExpression;
    const segment = argument && ts.isStringLiteralLike(argument) ? argument.text : "*";
    return parent === "*" ? segment : `${parent}.${segment}`;
  }
  return "*";
}

export function uniqueEffects(effects: ExactStateEffect[]): ExactStateEffect[] {
  const seen = new Set<string>();
  const output: ExactStateEffect[] = [];
  for (const effect of effects) {
    const key = `${effect.kind}:${effect.path}:${effect.confidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(effect);
  }
  return output.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

export function uniqueContextEffects(effects: ExactContextEffect[]): ExactContextEffect[] {
  const seen = new Set<string>();
  const output: ExactContextEffect[] = [];
  for (const effect of effects) {
    const key = `${effect.kind}:${effect.token}:${effect.confidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(effect);
  }
  return output.sort((left, right) => `${left.kind}:${left.token}`.localeCompare(`${right.kind}:${right.token}`));
}

export function uniqueDiagnostics(diagnostics: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const diagnostic of diagnostics) {
    if (seen.has(diagnostic)) continue;
    seen.add(diagnostic);
    output.push(diagnostic);
  }
  return output;
}
