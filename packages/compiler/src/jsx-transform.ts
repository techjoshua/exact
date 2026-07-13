import ts from "typescript";
import {
  isIdentifierDeclarationName,
  isPropertyAccessName,
  nodeNameText
} from "./ast.js";
import {
  isFunctionLikeExpression,
  isThisMethodAccess,
  isThisMethodCall,
  isThisTaskCall
} from "./calls.js";
import {
  analyzeTask,
  clientIslandHasServerSlotChildren,
  collectComponentInfo,
  componentPlacementsFromInfo
} from "./component-analysis.js";
import { collectExports, isComponentLikeFunction } from "./exports.js";
import { stableId } from "./ids.js";
import {
  collectServerOnlyImports,
  isServerOnlyImportDeclaration,
  isServerOnlyModule
} from "./imports.js";
import {
  clientComponentChildrenProp,
  componentBoundaryName,
  exactElementId,
  jsxElementHasNoMeaningfulChildren,
  jsxElementIsClientIsland,
  jsxTagIsClientComponent
} from "./jsx-inspect.js";
import {
  clientComponentBoundaryId,
  generatedComponentName
} from "./names.js";
import { pruneUnusedImports } from "./prune-imports.js";
import type { ExactProvenanceGraph } from "./provenance.js";
import {
  buildSemanticGraph,
  createSemanticDeclarationIndex,
  createSemanticReferenceIndex,
  semanticDeclarationForIdentifier,
  semanticReferenceForIdentifier
} from "./semantic.js";
import {
  collectDerivedReactiveLocals,
  collectStateAliases,
  isAssignmentOperator,
  isAnalyzableFunctionLike,
  isStatePathExpression,
  stateEffectPath,
  statePath
} from "./state-analysis.js";
import type {
  ClientIslandCaptures,
  ClientIslandElementNode,
  ComponentLocalInfo,
  DerivedReactiveIndex,
  ExactCompilerManifest,
  ExactImportedComponentIR,
  ExactPlacement,
  ExactSemanticGraphIR,
  HelperNames,
  SemanticDeclarationIndex,
  SemanticReferenceIndex,
  StateSnapshotTree,
  TransformTarget
} from "./types.js";

const helperModule = "@exact/core";
const elementHelper = "__exactVNode";
const fragmentHelper = "__exactFragment";
const expressionHelper = "__exactExpression";
const dynamicHelper = "__exactDynamic";
const boundaryHelper = "__exactBoundary";
/** Creates the TypeScript transformer that lowers eXact JSX into runtime helper calls. */
export function exactJsxTransformer(
  target: TransformTarget,
  importedManifests: readonly ExactCompilerManifest[] = [],
  serverComponents = false,
  providedSemanticGraph?: ExactSemanticGraphIR,
  provenance?: ExactProvenanceGraph
): ts.TransformerFactory<ts.SourceFile> {
  return context => sourceFile => {
    const factory = context.factory;
    const helpers = allocateHelperNames(sourceFile);
    const semanticGraph = providedSemanticGraph ?? buildSemanticGraph(sourceFile);
    const semanticReferences = createSemanticReferenceIndex(sourceFile, semanticGraph);
    const semanticDeclarations = createSemanticDeclarationIndex(sourceFile, semanticGraph);
    const serverOnlyImports = collectServerOnlyImports(sourceFile, semanticGraph);
    const componentInfo = collectComponentInfo(sourceFile, serverOnlyImports, importedManifests, semanticGraph);
    const componentPlacements = componentPlacementsFromInfo(componentInfo);
    const expressionDerived = new Set(provenance?.entries.filter(entry => entry.provenance === "derived").map(entry => entry.variable.id));
    let sawJsx = false;
    let sawBoundary = false;
    let sawStateWrite = false;
    const componentStack: string[] = [];
    const componentLocalStack: ComponentLocalInfo[] = [];
    const componentStateAliasStack: Map<string, string>[] = [];
    const componentDerivedStack: DerivedReactiveIndex[] = [];
    const islandCounts = new Map<string, number>();
    const clientIslandDefinitions: ts.FunctionDeclaration[] = [];
    let clientIslandDepth = 0;

    const visitor: ts.Visitor = node => {
      if (ts.isFunctionDeclaration(node) && node.name && isComponentLikeFunction(node)) {
        const componentPlacement = componentPlacements.get(node.name.text);
        if (target === "server" && componentPlacements.get(node.name.text) === "client") {
          sawBoundary = true;
          return createClientComponentServerStub(sourceFile, context, helpers, node);
        }
        if (target === "client" && serverComponents && componentPlacement !== "client") {
          // In server-component mode, non-client components are removed from the
          // client artifact after their nested client islands have been collected.
          componentStack.push(node.name.text);
          componentLocalStack.push(collectComponentLocalInfo(node, sourceFile, semanticDeclarations));
          componentStateAliasStack.push(collectStateAliases(node, sourceFile, semanticReferences, semanticDeclarations, { skipNestedFunctions: false }));
          componentDerivedStack.push(collectDerivedReactiveLocals(node, sourceFile, semanticReferences, semanticDeclarations, new Map(), expressionDerived));
          ts.visitEachChild(node, visitor, context);
          componentDerivedStack.pop();
          componentStateAliasStack.pop();
          componentLocalStack.pop();
          componentStack.pop();
          return factory.createEmptyStatement();
        }
        componentStack.push(node.name.text);
        componentLocalStack.push(collectComponentLocalInfo(node, sourceFile, semanticDeclarations));
        componentStateAliasStack.push(collectStateAliases(node, sourceFile, semanticReferences, semanticDeclarations, { skipNestedFunctions: false }));
        componentDerivedStack.push(collectDerivedReactiveLocals(node, sourceFile, semanticReferences, semanticDeclarations, new Map(), expressionDerived));
        const visited = ts.visitEachChild(node, visitor, context);
        componentDerivedStack.pop();
        componentStateAliasStack.pop();
        componentLocalStack.pop();
        componentStack.pop();
        return visited;
      }
      if (componentDerivedStack.length && isAnalyzableFunctionLike(node)) {
        componentDerivedStack.push(collectDerivedReactiveLocals(node, sourceFile, semanticReferences, semanticDeclarations, componentDerivedStack[componentDerivedStack.length - 1], expressionDerived));
        const visited = ts.visitEachChild(node, visitor, context);
        componentDerivedStack.pop();
        return visited;
      }
      if (componentStack.length && ts.isDeleteExpression(node)) {
        const path = exactStateWritePath(node.expression, sourceFile, semanticReferences, componentStateAliasStack[componentStateAliasStack.length - 1]);
        if (path) {
          sawStateWrite = true;
          return context.factory.createCallExpression(context.factory.createIdentifier(helpers.remove), undefined, [
            stateRoot(context), pathLiteral(context, path)
          ]);
        }
      }
      if (componentStack.length && ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
        const path = exactStateWritePath(node.left, sourceFile, semanticReferences, componentStateAliasStack[componentStateAliasStack.length - 1]);
        if (path) {
          sawStateWrite = true;
          return transformStateAssignment(context, node, path, visitor, helpers);
        }
      }
      if (componentStack.length && (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))) {
        const path = exactStateWritePath(node.operand, sourceFile, semanticReferences, componentStateAliasStack[componentStateAliasStack.length - 1]);
        if (path && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
          sawStateWrite = true;
          return transformStateUpdate(context, node, path, helpers);
        }
      }
      if (componentStack.length && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const path = exactStateWritePath(node.expression.expression, sourceFile, semanticReferences, componentStateAliasStack[componentStateAliasStack.length - 1]);
        if (path && isArrayMutator(method)) {
          sawStateWrite = true;
          return context.factory.createCallExpression(context.factory.createIdentifier(helpers.arrayMutation), undefined, [
            stateRoot(context), pathLiteral(context, path), context.factory.createStringLiteral(method),
            context.factory.createArrayLiteralExpression(node.arguments.map(argument => ts.visitNode(argument, visitor) as ts.Expression))
          ]);
        }
      }
      if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && isThisTaskCall(node.expression)) {
        const task = analyzeTask("target-task", node.expression, sourceFile, serverOnlyImports, semanticReferences, semanticDeclarations);
        if (shouldOmitPlacement(task.placement, target)) {
          return factory.createEmptyStatement();
        }
      }
      if (ts.isJsxElement(node)) {
        sawJsx = true;
        if (
          target === "server"
          && jsxTagIsClientComponent(node.openingElement.tagName, componentPlacements, sourceFile, semanticReferences)
        ) {
          const childrenProp = clientComponentChildrenProp(context, node);
          const serverChildren = !jsxElementHasNoMeaningfulChildren(node) && childrenProp === undefined
            ? node.children
            : undefined;
          sawBoundary = true;
          return createComponentIslandBoundaryCall(sourceFile, context, visitor, helpers, componentInfo, node, node.openingElement.tagName, node.openingElement.attributes, childrenProp, serverChildren);
        }
        if (target === "server" && jsxElementIsClientIsland(node.openingElement.attributes)) {
          const serverChildren = clientIslandHasServerSlotChildren(node, serverOnlyImports, semanticReferences, sourceFile, componentPlacements)
            ? node.children
            : undefined;
          sawBoundary = true;
          return createClientIslandBoundaryCall(sourceFile, context, visitor, helpers, componentStack[componentStack.length - 1], islandCounts, node.openingElement.attributes, serverChildren ? undefined : node.children, {
            ...clientIslandCaptures(node, componentLocalStack[componentLocalStack.length - 1], semanticReferences, sourceFile),
            serverSlotChildren: !!serverChildren
          }, semanticReferences, componentStateAliasStack[componentStateAliasStack.length - 1], componentDerivedStack[componentDerivedStack.length - 1], serverChildren);
        }
        if (target === "client" && jsxElementIsClientIsland(node.openingElement.attributes)) {
          const owner = componentStack[componentStack.length - 1];
          if (clientIslandDepth === 0 && (!owner || componentPlacements.get(owner) !== "client")) {
            const serverSlotChildren = clientIslandHasServerSlotChildren(node, serverOnlyImports, semanticReferences, sourceFile, componentPlacements);
            clientIslandDepth++;
            recordClientIslandDefinition(sourceFile, context, visitor, helpers, owner, islandCounts, node, clientIslandDefinitions, {
              ...clientIslandCaptures(node, componentLocalStack[componentLocalStack.length - 1], semanticReferences, sourceFile),
              serverSlotChildren
            });
            clientIslandDepth--;
          }
          clientIslandDepth++;
          const transformed = transformJsxElement(sourceFile, node, context, visitor, helpers, semanticReferences, componentDerivedStack[componentDerivedStack.length - 1]);
          clientIslandDepth--;
          return transformed;
        }
        return transformJsxElement(sourceFile, node, context, visitor, helpers, semanticReferences, componentDerivedStack[componentDerivedStack.length - 1]);
      }
      if (ts.isJsxSelfClosingElement(node)) {
        sawJsx = true;
        if (target === "client" && jsxElementIsClientIsland(node.attributes)) {
          const owner = componentStack[componentStack.length - 1];
          if (clientIslandDepth === 0 && (!owner || componentPlacements.get(owner) !== "client")) {
            recordClientIslandDefinition(sourceFile, context, visitor, helpers, owner, islandCounts, node, clientIslandDefinitions, clientIslandCaptures(node, componentLocalStack[componentLocalStack.length - 1], semanticReferences, sourceFile));
          }
        }
        if (target === "server" && jsxTagIsClientComponent(node.tagName, componentPlacements, sourceFile, semanticReferences)) {
          sawBoundary = true;
          return createComponentIslandBoundaryCall(sourceFile, context, visitor, helpers, componentInfo, node, node.tagName, node.attributes);
        }
        if (target === "server" && jsxElementIsClientIsland(node.attributes)) {
          sawBoundary = true;
          return createClientIslandBoundaryCall(sourceFile, context, visitor, helpers, componentStack[componentStack.length - 1], islandCounts, node.attributes, undefined, clientIslandCaptures(node, componentLocalStack[componentLocalStack.length - 1], semanticReferences, sourceFile), semanticReferences, componentStateAliasStack[componentStateAliasStack.length - 1], componentDerivedStack[componentDerivedStack.length - 1]);
        }
        return transformJsxSelfClosingElement(sourceFile, node, context, visitor, helpers, semanticReferences, componentDerivedStack[componentDerivedStack.length - 1]);
      }
      if (ts.isJsxFragment(node)) {
        sawJsx = true;
        return transformJsxFragment(node, context, visitor, helpers, sourceFile, semanticReferences, componentDerivedStack[componentDerivedStack.length - 1]);
      }
      if (ts.isCallExpression(node)) {
        if (isThisTaskCall(node)) {
          const task = analyzeTask("target-task", node, sourceFile, serverOnlyImports, semanticReferences, semanticDeclarations);
          if (shouldOmitPlacement(task.placement, target)) {
            return factory.createVoidExpression(factory.createNumericLiteral(0));
          }
        }
        return transformCapturedCall(sourceFile, node, context, visitor, semanticReferences, componentDerivedStack[componentDerivedStack.length - 1]);
      }
      if (ts.isTaggedTemplateExpression(node)) {
        return transformReactiveTaggedTemplate(node, context, visitor);
      }
      return ts.visitEachChild(node, visitor, context);
    };

    const transformInput = target === "client"
      ? factory.updateSourceFile(sourceFile, sourceFile.statements.filter(statement => !isServerOnlyImportDeclaration(statement)))
      : sourceFile;
    const transformed = ts.visitEachChild(transformInput, visitor, context);
    const withIslands = target === "client" && clientIslandDefinitions.length
      ? factory.updateSourceFile(transformed, [...transformed.statements, ...clientIslandDefinitions])
      : transformed;
    const withServerParts = target === "server"
      ? appendServerPartExportAliases(sourceFile, withIslands, factory, islandCounts, componentPlacements)
      : withIslands;
    const visited = target === "default" ? withServerParts : pruneUnusedImports(withServerParts, factory);
    if (!sawJsx && !sawBoundary && !sawStateWrite) return visited;

    const importDeclaration = factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        false,
        undefined,
        factory.createNamedImports([
          factory.createImportSpecifier(false, factory.createIdentifier("createCompiledVNode"), factory.createIdentifier(helpers.element)),
          factory.createImportSpecifier(false, factory.createIdentifier("createCompiledFragment"), factory.createIdentifier(helpers.fragment)),
          factory.createImportSpecifier(false, factory.createIdentifier("createExpression"), factory.createIdentifier(helpers.expression)),
          factory.createImportSpecifier(false, factory.createIdentifier("createDynamicChild"), factory.createIdentifier(helpers.dynamic)),
          ...(sawStateWrite
            ? [
              factory.createImportSpecifier(false, factory.createIdentifier("writeReactive"), factory.createIdentifier(helpers.write)),
              factory.createImportSpecifier(false, factory.createIdentifier("updateReactiveValue"), factory.createIdentifier(helpers.update)),
              factory.createImportSpecifier(false, factory.createIdentifier("deleteReactiveValue"), factory.createIdentifier(helpers.remove)),
              factory.createImportSpecifier(false, factory.createIdentifier("mutateReactiveArray"), factory.createIdentifier(helpers.arrayMutation))
            ]
            : []),
          ...(sawBoundary
            ? [factory.createImportSpecifier(false, factory.createIdentifier("createServerBoundary"), factory.createIdentifier(helpers.boundary))]
            : [])
        ])
      ),
      factory.createStringLiteral(helperModule)
    );

    return factory.updateSourceFile(visited, insertAfterDirectivePrologue(visited.statements, importDeclaration));
  };
}

function shouldOmitPlacement(placement: ExactPlacement, target: TransformTarget): boolean {
  if (target === "default") return false;
  if (target === "client") return placement === "server";
  return placement === "client";
}

function transformJsxElement(
  sourceFile: ts.SourceFile,
  node: ts.JsxElement,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  const opening = node.openingElement;
  const tagName = opening.tagName.getText();
  if (tagName === "_") {
    return callFragment(context, opening.attributes, node.children, visitor, helpers, sourceFile, semanticReferences, derivedReactiveLocals);
  }

  return callElement(context, tagExpression(opening.tagName), opening.attributes, node.children, visitor, helpers, exactElementId(sourceFile, opening.tagName, node), sourceFile, semanticReferences, derivedReactiveLocals);
}

function transformJsxSelfClosingElement(
  sourceFile: ts.SourceFile,
  node: ts.JsxSelfClosingElement,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  const tagName = node.tagName.getText();
  if (tagName === "_") {
    return callFragment(context, node.attributes, [], visitor, helpers, sourceFile, semanticReferences, derivedReactiveLocals);
  }

  return callElement(context, tagExpression(node.tagName), node.attributes, [], visitor, helpers, exactElementId(sourceFile, node.tagName, node), sourceFile, semanticReferences, derivedReactiveLocals);
}

function transformJsxFragment(
  node: ts.JsxFragment,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  return callFragment(context, undefined, node.children, visitor, helpers, sourceFile, semanticReferences, derivedReactiveLocals);
}

function collectComponentLocalInfo(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  semanticDeclarations: SemanticDeclarationIndex
): ComponentLocalInfo {
  const names = new Set<string>();
  const functions = new Map<string, ts.Statement>();
  const declarationIds = new Map<string, Set<string>>();
  function addLocal(name: ts.Identifier): void {
    names.add(name.text);
    const declaration = semanticDeclarationForIdentifier(name, semanticDeclarations, sourceFile);
    if (!declaration) return;
    let ids = declarationIds.get(name.text);
    if (!ids) {
      ids = new Set<string>();
      declarationIds.set(name.text, ids);
    }
    ids.add(declaration.id);
  }
  function visit(current: ts.Node): void {
    if (current !== node && ts.isFunctionDeclaration(current) && current.name) {
      addLocal(current.name);
      functions.set(current.name.text, current);
      return;
    }
    if (current !== node && (ts.isFunctionLike(current) || ts.isClassLike(current))) return;
    if (ts.isVariableDeclaration(current)) {
      collectBindingIdentifiers(current.name, addLocal);
      if (ts.isIdentifier(current.name) && current.initializer && isFunctionLikeExpression(current.initializer)) {
        functions.set(current.name.text, cloneableFunctionVariable(current.name, current.initializer));
      }
    }
    ts.forEachChild(current, visit);
  }
  if (node.body) visit(node.body);
  return { names, functions, declarationIds };
}

function cloneableFunctionVariable(name: ts.Identifier, initializer: ts.Expression): ts.VariableStatement {
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList([
      ts.factory.createVariableDeclaration(name, undefined, undefined, initializer)
    ], ts.NodeFlags.Const)
  );
}

function collectBindingNames(name: ts.BindingName, output: Set<string>): void {
  if (ts.isIdentifier(name)) {
    output.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingNames(element.name, output);
  }
}

function collectBindingIdentifiers(name: ts.BindingName, visit: (name: ts.Identifier) => void): void {
  if (ts.isIdentifier(name)) {
    visit(name);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingIdentifiers(element.name, visit);
  }
}

function clientIslandCaptures(
  node: ClientIslandElementNode,
  locals: ComponentLocalInfo | undefined,
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): ClientIslandCaptures {
  if (!locals?.names.size) return { values: [], functions: [] };
  const captures = new Set<string>();
  collectCapturedIdentifiers(node, locals, captures, semanticReferences, sourceFile);
  const values: string[] = [];
  const functions: ts.Statement[] = [];
  for (const name of [...captures].sort()) {
    const declaration = locals.functions.get(name);
    if (declaration) functions.push(declaration);
    else values.push(name);
  }
  return { values, functions };
}

function collectCapturedIdentifiers(
  node: ts.Node,
  locals: ComponentLocalInfo,
  captures: Set<string>,
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): void {
  if (ts.isIdentifier(node) && locals.names.has(node.text) && !isIdentifierDeclarationName(node) && !isPropertyAccessName(node)) {
    const reference = semanticReferenceForIdentifier(node, semanticReferences, sourceFile);
    if (reference?.declarationId && locals.declarationIds.get(node.text)?.has(reference.declarationId)) {
      captures.add(node.text);
    }
  }
  ts.forEachChild(node, child => collectCapturedIdentifiers(child, locals, captures, semanticReferences, sourceFile));
}

function createClientIslandBoundaryCall(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  componentName: string | undefined,
  islandCounts: Map<string, number>,
  attributes: ts.JsxAttributes,
  children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  captures: ClientIslandCaptures = emptyClientIslandCaptures(),
  semanticReferences?: SemanticReferenceIndex,
  stateAliases?: Map<string, string>,
  derivedReactiveLocals?: DerivedReactiveIndex,
  serverChildren?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[]
): ts.Expression {
  const factory = context.factory;
  const owner = componentName ?? "Anonymous";
  const next = (islandCounts.get(owner) ?? 0) + 1;
  islandCounts.set(owner, next);
  const generatedName = generatedComponentName(owner, "client-island", next);
  const id = stableId(sourceFile.fileName, owner, "client-island", String(next));
  return factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
    factory.createStringLiteral(id),
    factory.createStringLiteral(generatedName),
    islandProps(context, attributes, children, captures.values, sourceFile, semanticReferences, stateAliases, derivedReactiveLocals),
    ...(serverChildren ? childrenExpressions(context, serverChildren, visitor, helpers, sourceFile, semanticReferences, derivedReactiveLocals) : [])
  ]);
}

function recordClientIslandDefinition(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  componentName: string | undefined,
  islandCounts: Map<string, number>,
  node: ClientIslandElementNode,
  definitions: ts.FunctionDeclaration[],
  captures: ClientIslandCaptures = emptyClientIslandCaptures()
): void {
  const owner = componentName ?? "Anonymous";
  const next = (islandCounts.get(owner) ?? 0) + 1;
  islandCounts.set(owner, next);
  definitions.push(createClientIslandDefinition(sourceFile, context, visitor, helpers, owner, next, node, captures));
}

function createClientIslandDefinition(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  owner: string,
  index: number,
  node: ClientIslandElementNode,
  captures: ClientIslandCaptures
): ts.FunctionDeclaration {
  const factory = context.factory;
  const props = factory.createIdentifier("props");
  const generatedName = generatedComponentName(owner, "client-island", index);
  const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
  const children = captures.serverSlotChildren
    ? undefined
    : ts.isJsxElement(node)
      ? node.children
      : [];
  return factory.createFunctionDeclaration(
    [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    undefined,
    factory.createIdentifier(generatedName),
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("this"),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        props,
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        factory.createObjectLiteralExpression([], false)
      )
    ],
    undefined,
    factory.createBlock([
      ...capturedFunctionDeclarations(context, captures.functions, props, captures.values),
      createClientIslandStateInit(factory, props),
      factory.createReturnStatement(factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        factory.createCallExpression(factory.createIdentifier(helpers.element), undefined, [
          tagExpression(tagName),
          clientIslandElementProps(sourceFile, context, tagName, attributes, node, props, captures.values),
          ...clientIslandChildrenExpressions(context, children, visitor, helpers, props, captures.values, captures.serverSlotChildren)
        ])
      ))
    ], true)
  );
}

function createClientIslandStateInit(factory: ts.NodeFactory, props: ts.Identifier): ts.Statement {
  return factory.createIfStatement(
    factory.createPropertyAccessExpression(props, "__exactState"),
    factory.createExpressionStatement(factory.createCallExpression(
      factory.createPropertyAccessExpression(factory.createIdentifier("Object"), "assign"),
      undefined,
      [
        factory.createPropertyAccessExpression(factory.createThis(), "state"),
        factory.createPropertyAccessExpression(props, "__exactState")
      ]
    ))
  );
}

function appendServerPartExportAliases(
  sourceFile: ts.SourceFile,
  transformed: ts.SourceFile,
  factory: ts.NodeFactory,
  islandCounts: Map<string, number>,
  componentPlacements: Map<string, ExactPlacement>
): ts.SourceFile {
  const exportedNames = collectExports(sourceFile);
  const aliases: ts.ExportDeclaration[] = [];
  for (const [name, count] of [...islandCounts].sort(([left], [right]) => left.localeCompare(right))) {
    if (count <= 0) continue;
    if (!exportedNames.has(name)) continue;
    if (componentPlacements.get(name) === "client") continue;
    aliases.push(factory.createExportDeclaration(
      undefined,
      false,
      factory.createNamedExports([
        factory.createExportSpecifier(
          false,
          factory.createIdentifier(name),
          factory.createIdentifier(generatedComponentName(name, "server-part", 1))
        )
      ]),
      undefined
    ));
  }
  return aliases.length
    ? factory.updateSourceFile(transformed, [...transformed.statements, ...aliases])
    : transformed;
}

function clientIslandElementProps(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  tagName: ts.JsxTagNameExpression,
  attributes: ts.JsxAttributes,
  node: ts.Node,
  props: ts.Identifier,
  captures: readonly string[]
): ts.ObjectLiteralExpression {
  const factory = context.factory;
  const properties: ts.ObjectLiteralElementLike[] = [];
  const exactId = exactElementId(sourceFile, tagName, node);
  if (exactId) {
    properties.push(factory.createPropertyAssignment(factory.createStringLiteral("data-exact-id"), factory.createStringLiteral(exactId)));
  }
  for (const attribute of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      properties.push(factory.createSpreadAssignment(props));
      continue;
    }
    const name = attribute.name.getText(sourceFile);
    if (!attribute.initializer) {
      properties.push(factory.createPropertyAssignment(propName(name), factory.createPropertyAccessExpression(props, name)));
      continue;
    }
    if (/^on[A-Z]/.test(name) || name === "ref") {
      if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
        properties.push(factory.createPropertyAssignment(propName(name), rewriteCapturedNode(context, attribute.initializer.expression, props, captures)));
      }
      continue;
    }
    properties.push(factory.createPropertyAssignment(propName(name), factory.createPropertyAccessExpression(props, name)));
  }
  return factory.createObjectLiteralExpression(properties, false);
}

function clientIslandChildrenExpressions(
  context: ts.TransformationContext,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[] | undefined,
  visitor: ts.Visitor,
  helpers: HelperNames,
  props: ts.Identifier,
  captures: readonly string[],
  serverSlotChildren = false
): ts.Expression[] {
  if (serverSlotChildren) {
    return [context.factory.createPropertyAccessExpression(props, "children")];
  }
  const rewritten = (children ?? []).map(child => rewriteCapturedNode(context, child, props, captures));
  return childrenExpressions(context, rewritten, visitor, helpers);
}

function rewriteCapturedNode<T extends ts.Node>(
  context: ts.TransformationContext,
  node: T,
  props: ts.Identifier,
  captures: readonly string[]
): T {
  if (!captures.length) return node;
  const captureSet = new Set(captures);
  const visitor: ts.Visitor = current => {
    if (ts.isIdentifier(current) && captureSet.has(current.text) && !isIdentifierDeclarationName(current) && !isPropertyAccessName(current)) {
      return context.factory.createPropertyAccessExpression(
        context.factory.createPropertyAccessExpression(props, "__exactCapture"),
        current.text
      );
    }
    return ts.visitEachChild(current, visitor, context);
  };
  return ts.visitNode(node, visitor) as T;
}

function capturedFunctionDeclarations(
  context: ts.TransformationContext,
  functions: readonly ts.Statement[],
  props: ts.Identifier,
  captures: readonly string[]
): ts.Statement[] {
  return functions.map(fn => rewriteCapturedNode(context, fn, props, captures));
}

function emptyClientIslandCaptures(): ClientIslandCaptures {
  return { values: [], functions: [] };
}

function createComponentIslandBoundaryCall(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  helpers: HelperNames,
  componentInfo: Map<string, ExactImportedComponentIR>,
  node: ts.Node,
  tagName: ts.JsxTagNameExpression,
  attributes: ts.JsxAttributes,
  children?: ts.Expression,
  serverChildren?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[]
): ts.Expression {
  const factory = context.factory;
  const componentName = componentBoundaryName(tagName, componentInfo, sourceFile);
  const id = clientComponentBoundaryId(sourceFile, componentName, node);
  const props = islandProps(context, attributes);
  return factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
    factory.createStringLiteral(id),
    factory.createStringLiteral(componentName),
    children === undefined ? props : appendObjectProperty(context, props, "children", children),
    ...(serverChildren ? childrenExpressions(context, serverChildren, visitor, helpers) : [])
  ]);
}

function createClientComponentServerStub(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  helpers: HelperNames,
  node: ts.FunctionDeclaration
): ts.FunctionDeclaration {
  const factory = context.factory;
  const componentName = node.name!.text;
  const props = factory.createIdentifier("props");
  const id = stableId(sourceFile.fileName, componentName, "component-island");
  return factory.updateFunctionDeclaration(
    node,
    node.modifiers,
    node.asteriskToken,
    node.name,
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        props,
        undefined,
        undefined,
        factory.createObjectLiteralExpression([], false)
      )
    ],
    undefined,
    factory.createBlock([
      factory.createReturnStatement(factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
          factory.createStringLiteral(id),
          factory.createStringLiteral(componentName),
          props
        ])
      ))
    ], true)
  );
}

function islandProps(
  context: ts.TransformationContext,
  attributes: ts.JsxAttributes,
  children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  captures: readonly string[] = [],
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  stateAliases?: Map<string, string>,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.ObjectLiteralExpression {
  const props: ts.ObjectLiteralElementLike[] = [];
  const factory = context.factory;
  const stateReads = collectIslandStateReads(attributes, children, sourceFile, semanticReferences, stateAliases, derivedReactiveLocals);
  if (stateReads.length) {
    props.push(factory.createPropertyAssignment(
      factory.createStringLiteral("__exactState"),
      stateSnapshotObject(factory, stateReads)
    ));
  }
  if (captures.length) {
    props.push(factory.createPropertyAssignment(
      factory.createStringLiteral("__exactCapture"),
      factory.createObjectLiteralExpression(captures.map(name => factory.createPropertyAssignment(propName(name), factory.createIdentifier(name))), false)
    ));
  }
  for (const attribute of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      props.push(factory.createSpreadAssignment(attribute.expression));
      continue;
    }
    const name = attribute.name.getText();
    if (/^on[A-Z]/.test(name) || name === "ref") continue;
    if (!attribute.initializer) {
      props.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
      continue;
    }
    if (ts.isStringLiteral(attribute.initializer)) {
      props.push(factory.createPropertyAssignment(propName(name), factory.createStringLiteral(attribute.initializer.text)));
      continue;
    }
    if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      const expression = attribute.initializer.expression;
      props.push(factory.createPropertyAssignment(propName(name), expression));
    }
  }
  return factory.createObjectLiteralExpression(props, false);
}

function collectIslandStateReads(
  attributes: ts.JsxAttributes,
  children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  stateAliases: Map<string, string> = new Map(),
  derivedReactiveLocals: DerivedReactiveIndex = new Map()
): string[] {
  const paths = new Set<string>();
  for (const attribute of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      collectStateReads(attribute.expression, paths, sourceFile, semanticReferences, stateAliases, derivedReactiveLocals);
      continue;
    }
    if (attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      collectStateReads(attribute.initializer.expression, paths, sourceFile, semanticReferences, stateAliases, derivedReactiveLocals);
    }
  }
  for (const child of children ?? []) {
    collectStateReads(child, paths, sourceFile, semanticReferences, stateAliases, derivedReactiveLocals);
  }
  return [...paths].sort();
}

function collectStateReads(
  node: ts.Node,
  paths: Set<string>,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  stateAliases: Map<string, string> = new Map(),
  derivedReactiveLocals: DerivedReactiveIndex = new Map(),
  activeDerived = new Set<string>()
): void {
  if (ts.isExpression(node) && sourceFile && semanticReferences) {
    const path = stateEffectPath(node, sourceFile, semanticReferences, stateAliases);
    if (path !== undefined && path !== "*" && !isNestedStatePathBase(node)) paths.add(path);
  } else if (ts.isPropertyAccessExpression(node) && isStatePathExpression(node)) {
    const path = statePath(node);
    if (path !== "*") paths.add(path);
  }
  if (ts.isIdentifier(node) && sourceFile && semanticReferences && !isNestedStatePathBase(node)) {
    const reference = semanticReferenceForIdentifier(node, semanticReferences, sourceFile);
    if (reference?.declarationId && derivedReactiveLocals.has(reference.declarationId) && !activeDerived.has(reference.declarationId)) {
      activeDerived.add(reference.declarationId);
      collectStateReads(derivedReactiveLocals.get(reference.declarationId)!, paths, sourceFile, semanticReferences, stateAliases, derivedReactiveLocals, activeDerived);
      activeDerived.delete(reference.declarationId);
    }
  }
  ts.forEachChild(node, child => collectStateReads(child, paths, sourceFile, semanticReferences, stateAliases, derivedReactiveLocals, activeDerived));
}

function isNestedStatePathBase(node: ts.Expression): boolean {
  const parent = node.parent;
  return !!parent && (
    (ts.isPropertyAccessExpression(parent) && parent.expression === node)
    || (ts.isElementAccessExpression(parent) && parent.expression === node)
  );
}

function stateSnapshotObject(factory: ts.NodeFactory, paths: readonly string[]): ts.ObjectLiteralExpression {
  const root: StateSnapshotTree = new Map();
  for (const path of paths) {
    let cursor = root;
    const segments = path.split(".");
    for (const segment of segments.slice(0, -1)) {
      if (!cursor.has(segment)) cursor.set(segment, new Map());
      const next = cursor.get(segment);
      if (!(next instanceof Map)) break;
      cursor = next;
    }
    cursor.set(segments[segments.length - 1]!, stateAccessExpression(factory, segments));
  }
  return mapToObjectLiteral(factory, root);
}

function mapToObjectLiteral(factory: ts.NodeFactory, map: StateSnapshotTree): ts.ObjectLiteralExpression {
  return factory.createObjectLiteralExpression([...map.entries()].map(([name, value]) => factory.createPropertyAssignment(
    propName(name),
    value instanceof Map ? mapToObjectLiteral(factory, value) : value
  )), false);
}

function appendObjectProperty(
  context: ts.TransformationContext,
  object: ts.ObjectLiteralExpression,
  name: string,
  value: ts.Expression
): ts.ObjectLiteralExpression {
  return context.factory.updateObjectLiteralExpression(object, [
    ...object.properties,
    context.factory.createPropertyAssignment(propName(name), value)
  ]);
}

function stateAccessExpression(factory: ts.NodeFactory, segments: readonly string[]): ts.Expression {
  let expression: ts.Expression = factory.createPropertyAccessExpression(factory.createThis(), "state");
  for (const segment of segments) {
    expression = isIdentifierText(segment)
      ? factory.createPropertyAccessExpression(expression, segment)
      : factory.createElementAccessExpression(expression, factory.createStringLiteral(segment));
  }
  return expression;
}

function isIdentifierText(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function callElement(
  context: ts.TransformationContext,
  tag: ts.Expression,
  attributes: ts.JsxAttributes | undefined,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames,
  exactId?: string,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  return context.factory.createCallExpression(context.factory.createIdentifier(helpers.element), undefined, [
    tag,
    propsObject(context, attributes, visitor, helpers, exactId, sourceFile, semanticReferences, derivedReactiveLocals),
    ...childrenExpressions(context, children, visitor, helpers, sourceFile, semanticReferences, derivedReactiveLocals)
  ]);
}

function callFragment(
  context: ts.TransformationContext,
  attributes: ts.JsxAttributes | undefined,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  return context.factory.createCallExpression(context.factory.createIdentifier(helpers.fragment), undefined, [
    propsObject(context, attributes, visitor, helpers, undefined, sourceFile, semanticReferences, derivedReactiveLocals),
    ...childrenExpressions(context, children, visitor, helpers, sourceFile, semanticReferences, derivedReactiveLocals)
  ]);
}

function propsObject(
  context: ts.TransformationContext,
  attributes: ts.JsxAttributes | undefined,
  visitor: ts.Visitor,
  helpers: HelperNames,
  exactId?: string,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  const factory = context.factory;
  const properties: ts.ObjectLiteralElementLike[] = [];
  if (exactId) {
    properties.push(factory.createPropertyAssignment(factory.createStringLiteral("data-exact-id"), factory.createStringLiteral(exactId)));
  }

  for (const property of attributes?.properties ?? []) {
    if (ts.isJsxSpreadAttribute(property)) {
      properties.push(factory.createSpreadAssignment(ts.visitNode(property.expression, visitor) as ts.Expression));
      continue;
    }

    const name = property.name.getText();
    if (!property.initializer) {
      properties.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
      continue;
    }

    if (ts.isStringLiteral(property.initializer)) {
      properties.push(factory.createPropertyAssignment(propName(name), property.initializer));
      continue;
    }

    if (ts.isJsxExpression(property.initializer)) {
      const expression = property.initializer.expression;
      if (!expression) continue;
      properties.push(factory.createPropertyAssignment(propName(name), shouldWrapAttribute(name, expression) ? wrapExpression(context, expression, visitor, helpers, sourceFile, semanticReferences, derivedReactiveLocals) : ts.visitNode(expression, visitor) as ts.Expression));
    }
  }

  return factory.createObjectLiteralExpression(properties, false);
}

function propName(name: string): ts.PropertyName {
  return /^[$A-Z_a-z][$\w]*$/.test(name)
    ? ts.factory.createIdentifier(name)
    : ts.factory.createStringLiteral(name);
}

function childrenExpressions(
  context: ts.TransformationContext,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression[] {
  const output: ts.Expression[] = [];

  for (const child of children) {
    if (ts.isJsxText(child)) {
      const text = child.text.replace(/\s+/g, " ");
      if (text.trim()) output.push(context.factory.createStringLiteral(text));
      continue;
    }

    if (ts.isJsxExpression(child)) {
      if (child.expression) output.push(wrapDynamicChild(context, child.expression, visitor, helpers, sourceFile, semanticReferences, derivedReactiveLocals));
      continue;
    }

    output.push(ts.visitNode(child, visitor) as ts.Expression);
  }

  return output;
}

function shouldWrapAttribute(name: string, expression: ts.Expression): boolean {
  if (name === "key") return false;
  if (name === "ref") return false;
  if (/^on[A-Z]/.test(name)) return false;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return false;
  return true;
}

function wrapDynamicChild(
  context: ts.TransformationContext,
  expression: ts.Expression,
  visitor: ts.Visitor,
  helpers: HelperNames,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  const factory = context.factory;
  return factory.createCallExpression(factory.createIdentifier(helpers.dynamic), undefined, [
    factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      visitReactiveSinkExpression(context, expression, visitor, sourceFile, semanticReferences, derivedReactiveLocals)
    )
  ]);
}

function wrapExpression(
  context: ts.TransformationContext,
  expression: ts.Expression,
  visitor: ts.Visitor,
  helpers: HelperNames,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  const factory = context.factory;
  return factory.createCallExpression(factory.createIdentifier(helpers.expression), undefined, [
    factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      visitReactiveSinkExpression(context, expression, visitor, sourceFile, semanticReferences, derivedReactiveLocals)
    )
  ]);
}

function visitReactiveSinkExpression(
  context: ts.TransformationContext,
  expression: ts.Expression,
  visitor: ts.Visitor,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  const rewritten = sourceFile && semanticReferences && derivedReactiveLocals?.size
    ? rewriteDerivedReactiveExpression(context, expression, sourceFile, semanticReferences, derivedReactiveLocals)
    : expression;
  return ts.visitNode(rewritten, visitor) as ts.Expression;
}

function rewriteDerivedReactiveExpression(
  context: ts.TransformationContext,
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  semanticReferences: SemanticReferenceIndex,
  derivedReactiveLocals: DerivedReactiveIndex,
  active = new Set<string>()
): ts.Expression {
  const visitor: ts.Visitor = node => {
    if (ts.isIdentifier(node) && !isIdentifierDeclarationName(node) && !isPropertyAccessName(node)) {
      const reference = semanticReferenceForIdentifier(node, semanticReferences, sourceFile);
      const declarationId = reference?.declarationId;
      const initializer = declarationId ? derivedReactiveLocals.get(declarationId) : undefined;
      if (initializer && declarationId && !active.has(declarationId)) {
        active.add(declarationId);
        const rewritten = rewriteDerivedReactiveExpression(context, initializer, sourceFile, semanticReferences, derivedReactiveLocals, active);
        active.delete(declarationId);
        return context.factory.createParenthesizedExpression(rewritten);
      }
    }
    return ts.visitEachChild(node, visitor, context);
  };
  return ts.visitNode(expression, visitor) as ts.Expression;
}

function tagExpression(tagName: ts.JsxTagNameExpression): ts.Expression {
  if (ts.isIdentifier(tagName)) {
    const text = tagName.text;
    return /^[a-z]/.test(text) ? ts.factory.createStringLiteral(text) : ts.factory.createIdentifier(text);
  }

  if (ts.isPropertyAccessExpression(tagName)) {
    return ts.factory.createPropertyAccessExpression(tagExpression(tagName.expression as ts.JsxTagNameExpression), tagName.name);
  }

  return ts.factory.createStringLiteral(tagName.getText());
}

function transformCapturedCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  if (isThisMethodCall(node, "reactive")) {
    return transformReactiveCall(sourceFile, node, context, visitor, semanticReferences, derivedReactiveLocals);
  }

  if (isThisTaskCall(node)) {
    return transformTaskCall(sourceFile, node, context, visitor, semanticReferences, derivedReactiveLocals);
  }

  if (isThisMethodCall(node, "map")) {
    return transformMapCall(sourceFile, node, context, visitor, semanticReferences, derivedReactiveLocals);
  }

  return ts.visitEachChild(node, visitor, context);
}

function transformReactiveTaggedTemplate(node: ts.TaggedTemplateExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (!isThisMethodAccess(node.tag, "reactive")) {
    return ts.visitEachChild(node, visitor, context);
  }

  return context.factory.createCallExpression(
    ts.visitNode(node.tag, visitor) as ts.Expression,
    node.typeArguments,
    [captureArgument(context, templateToExpression(node.template), visitor)]
  );
}

function transformReactiveCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  if (node.arguments.length !== 1) return ts.visitEachChild(node, visitor, context);
  const [argument] = node.arguments;
  if (!argument || isFunctionLikeExpression(argument)) return ts.visitEachChild(node, visitor, context);

  return context.factory.updateCallExpression(
    node,
    ts.visitNode(node.expression, visitor) as ts.Expression,
    node.typeArguments,
    [captureArgument(context, argument, visitor, sourceFile, semanticReferences, derivedReactiveLocals)]
  );
}

function transformTaskCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  if (node.arguments.length < 2) return ts.visitEachChild(node, visitor, context);
  const work = node.arguments[node.arguments.length - 1]!;
  if (!isFunctionLikeExpression(work)) return ts.visitEachChild(node, visitor, context);

  const nextArguments = node.arguments.map((argument, index) => {
    if (index === node.arguments.length - 1 || isFunctionLikeExpression(argument)) {
      return ts.visitNode(argument, visitor) as ts.Expression;
    }
    return context.factory.createCallExpression(
      context.factory.createPropertyAccessExpression(context.factory.createThis(), "reactive"),
      undefined,
      [captureArgument(context, argument, visitor, sourceFile, semanticReferences, derivedReactiveLocals)]
    );
  });

  return context.factory.updateCallExpression(
    node,
    ts.visitNode(node.expression, visitor) as ts.Expression,
    node.typeArguments,
    nextArguments
  );
}

function transformMapCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  context: ts.TransformationContext,
  visitor: ts.Visitor,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
  if (node.arguments.length !== 3) return ts.visitEachChild(node, visitor, context);
  const id = stableId(sourceFile.fileName, "list", String(node.getStart(sourceFile)), String(node.getEnd()));
  const source = node.arguments[0]!;
  const declarationId = ts.isIdentifier(source) && semanticReferences
    ? semanticReferenceForIdentifier(source, semanticReferences, sourceFile)?.declarationId
    : undefined;
  // Reactive sinks are rewritten before their nested calls are visited.  A
  // derived local therefore reaches this transform either as its identifier
  // (when used directly) or as its already-expanded collection expression.
  // Handle both forms so `const visible = tasks.filter(...); this.map(visible)`
  // remains a live list instead of becoming a one-time array snapshot.
  const initializer = declarationId ? derivedReactiveLocals?.get(declarationId) : undefined;
  const derivedCollection = initializer ?? (isDerivedCollectionExpression(source) ? source : undefined);
  const provenance = derivedCollection ? derivedCollectionSource(derivedCollection) : undefined;
  const collection = derivedCollection
    ? context.factory.createCallExpression(
      context.factory.createPropertyAccessExpression(context.factory.createThis(), "reactive"),
      undefined,
      [captureArgument(context, derivedCollection, visitor, sourceFile, semanticReferences, derivedReactiveLocals)]
    )
    : ts.visitNode(source, visitor) as ts.Expression;
  return context.factory.updateCallExpression(
    node,
    ts.visitNode(node.expression, visitor) as ts.Expression,
    node.typeArguments,
    [
      collection,
      ...node.arguments.slice(1).map(argument => ts.visitNode(argument, visitor) as ts.Expression),
      context.factory.createStringLiteral(id),
      ...(provenance ? [ts.visitNode(provenance, visitor) as ts.Expression] : [])
    ]
  );
}

function isDerivedCollectionExpression(expression: ts.Expression): boolean {
  const current = withoutParentheses(expression);
  return ts.isCallExpression(current)
    && ts.isPropertyAccessExpression(current.expression)
    && ["filter", "map", "flatMap", "slice", "concat", "toSorted", "toReversed", "toSpliced"].includes(current.expression.name.text);
}

function derivedCollectionSource(expression: ts.Expression): ts.Expression | undefined {
  let current = withoutParentheses(expression);
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)
    && ["filter", "map", "flatMap", "slice", "concat", "toSorted", "toReversed", "toSpliced"].includes(current.expression.name.text)) {
    current = withoutParentheses(current.expression.expression);
  }
  if (!ts.isPropertyAccessExpression(current)) return undefined;
  if (ts.isPropertyAccessExpression(current.expression)
    && current.expression.expression.kind === ts.SyntaxKind.ThisKeyword
    && current.expression.name.text === "state") return current;
  // Component props preserve the parent collection identity; registering the
  // key against this value reaches the same raw reactive array at runtime.
  return ts.isIdentifier(current.expression) && current.expression.text === "props" ? current : undefined;
}

function withoutParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function captureArgument(
  context: ts.TransformationContext,
  expression: ts.Expression,
  visitor: ts.Visitor,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex,
  derivedReactiveLocals?: DerivedReactiveIndex
): ts.ArrowFunction {
  return context.factory.createArrowFunction(
    undefined,
    undefined,
    [],
    undefined,
    context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    visitReactiveSinkExpression(context, expression, visitor, sourceFile, semanticReferences, derivedReactiveLocals)
  );
}

function templateToExpression(template: ts.TemplateLiteral): ts.Expression {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return ts.factory.createStringLiteral(template.text);
  }

  return ts.factory.createTemplateExpression(
    template.head,
    template.templateSpans.map(span => ts.factory.createTemplateSpan(span.expression, span.literal))
  );
}

function allocateHelperNames(sourceFile: ts.SourceFile): HelperNames {
  const used = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    element: allocateName(elementHelper, used),
    fragment: allocateName(fragmentHelper, used),
    expression: allocateName(expressionHelper, used),
    dynamic: allocateName(dynamicHelper, used),
    boundary: allocateName(boundaryHelper, used),
    write: allocateName("__exactWrite", used),
    update: allocateName("__exactUpdate", used),
    remove: allocateName("__exactDelete", used),
    arrayMutation: allocateName("__exactArrayMutation", used)
  };
}

function exactStateWritePath(
  node: ts.Expression,
  sourceFile: ts.SourceFile,
  references: SemanticReferenceIndex,
  aliases: Map<string, string> | undefined
): string[] | undefined {
  const path = stateEffectPath(node, sourceFile, references, aliases ?? new Map());
  if (!path || path === "*" || path.includes("*")) return undefined;
  return path.split(".");
}

function stateRoot(context: ts.TransformationContext): ts.Expression {
  return context.factory.createPropertyAccessExpression(context.factory.createThis(), "state");
}

function pathLiteral(context: ts.TransformationContext, path: readonly string[]): ts.ArrayLiteralExpression {
  return context.factory.createArrayLiteralExpression(path.map(segment => context.factory.createStringLiteral(segment)));
}

function transformStateAssignment(
  context: ts.TransformationContext,
  node: ts.BinaryExpression,
  path: readonly string[],
  visitor: ts.Visitor,
  helpers: HelperNames
): ts.Expression {
  const value = ts.visitNode(node.right, visitor) as ts.Expression;
  if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return context.factory.createCallExpression(context.factory.createIdentifier(helpers.write), undefined, [
      stateRoot(context), pathLiteral(context, path), value
    ]);
  }
  const operator = compoundOperator(node.operatorToken.kind);
  if (operator === undefined) return node;
  const previous = context.factory.createIdentifier("previous");
  return context.factory.createCallExpression(context.factory.createIdentifier(helpers.update), undefined, [
    stateRoot(context), pathLiteral(context, path),
    context.factory.createArrowFunction(undefined, undefined, [context.factory.createParameterDeclaration(undefined, undefined, previous)], undefined,
      context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      context.factory.createBinaryExpression(previous, operator, value))
  ]);
}

function transformStateUpdate(
  context: ts.TransformationContext,
  node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
  path: readonly string[],
  helpers: HelperNames
): ts.Expression {
  const previous = context.factory.createIdentifier("previous");
  const operator = node.operator === ts.SyntaxKind.PlusPlusToken ? ts.SyntaxKind.PlusToken : ts.SyntaxKind.MinusToken;
  return context.factory.createCallExpression(context.factory.createIdentifier(helpers.update), undefined, [
    stateRoot(context), pathLiteral(context, path),
    context.factory.createArrowFunction(undefined, undefined, [context.factory.createParameterDeclaration(undefined, undefined, previous)], undefined,
      context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      context.factory.createBinaryExpression(previous, operator, context.factory.createNumericLiteral(1))),
    node.kind === ts.SyntaxKind.PostfixUnaryExpression ? context.factory.createTrue() : context.factory.createFalse()
  ]);
}

function compoundOperator(kind: ts.SyntaxKind): ts.BinaryOperator | undefined {
  const operators = new Map<ts.SyntaxKind, ts.BinaryOperator>([
    [ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.PlusToken], [ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.MinusToken],
    [ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.AsteriskToken], [ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.SlashToken],
    [ts.SyntaxKind.PercentEqualsToken, ts.SyntaxKind.PercentToken], [ts.SyntaxKind.AsteriskAsteriskEqualsToken, ts.SyntaxKind.AsteriskAsteriskToken],
    [ts.SyntaxKind.LessThanLessThanEqualsToken, ts.SyntaxKind.LessThanLessThanToken], [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken, ts.SyntaxKind.GreaterThanGreaterThanToken],
    [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken],
    [ts.SyntaxKind.AmpersandEqualsToken, ts.SyntaxKind.AmpersandToken], [ts.SyntaxKind.BarEqualsToken, ts.SyntaxKind.BarToken], [ts.SyntaxKind.CaretEqualsToken, ts.SyntaxKind.CaretToken],
    [ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.AmpersandAmpersandToken], [ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.BarBarToken], [ts.SyntaxKind.QuestionQuestionEqualsToken, ts.SyntaxKind.QuestionQuestionToken]
  ]);
  return operators.get(kind);
}

function isArrayMutator(name: string): name is "copyWithin" | "fill" | "pop" | "push" | "reverse" | "shift" | "sort" | "splice" | "unshift" {
  return ["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"].includes(name);
}

function allocateName(base: string, used: Set<string>): string {
  let name = base;
  let index = 1;
  while (used.has(name)) {
    name = `${base}_${index}`;
    index++;
  }
  used.add(name);
  return name;
}

function insertAfterDirectivePrologue(statements: ts.NodeArray<ts.Statement>, statement: ts.Statement): ts.Statement[] {
  const nextStatements = [...statements];
  let index = 0;
  while (index < nextStatements.length && isDirectivePrologueStatement(nextStatements[index]!)) {
    index++;
  }
  nextStatements.splice(index, 0, statement);
  return nextStatements;
}

function isDirectivePrologueStatement(statement: ts.Statement): boolean {
  return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
}
