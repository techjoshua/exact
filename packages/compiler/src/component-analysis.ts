import ts from "typescript";
import {
  isFunctionLikeExpression,
  isThisTaskCall,
  taskRequestedPlacement
} from "./calls.js";
import { isComponentLikeFunction } from "./exports.js";
import { stableId } from "./ids.js";
import {
  collectImportedComponents,
  isServerOnlyReference
} from "./imports.js";
import {
  clientComponentHasServerSlotChildren,
  jsxElementIsClientIsland,
  jsxTagCanReferenceComponent,
  jsxTagIsClientComponent,
  jsxTagIsIntrinsicElement
} from "./jsx-inspect.js";
import {
  clientComponentBoundaryId,
  generatedComponentName,
  serverSlotBoundaryId
} from "./names.js";
import {
  buildSemanticGraph,
  createSemanticDeclarationIndex,
  createSemanticReferenceIndex,
  isBrowserGlobalReference,
  semanticDeclarationForIdentifier,
  semanticReferenceForIdentifier
} from "./semantic.js";
import {
  collectStateAliases,
  contextEffectForCall,
  isAssignmentOperator,
  isThisStateAccess,
  stateEffectPath,
  uniqueContextEffects,
  uniqueDiagnostics,
  uniqueEffects
} from "./state-analysis.js";
import type {
  ExactBoundaryIR,
  ExactCompilerManifest,
  ExactComponentIR,
  ExactComponentRenderEdgeIR,
  ExactContextEffect,
  ExactImportedComponentIR,
  ExactPlacement,
  ExactSemanticGraphIR,
  ExactStateEffect,
  ExactTaskIR,
  SemanticDeclarationIndex,
  SemanticReferenceIndex
} from "./types.js";

/** Analyzes one component function into placement, task, context, and split-boundary IR. */
export function analyzeComponent(
  name: string,
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  serverOnlyImports: Set<string>,
  semanticReferences: SemanticReferenceIndex,
  semanticDeclarations: SemanticDeclarationIndex
): ExactComponentIR {
  const tasks: ExactTaskIR[] = [];
  const contexts: ExactContextEffect[] = [];
  const splitBoundaries = new Set<string>();
  const diagnostics: string[] = [];
  const browserGlobalsOutsideClientBoundary = new Set<string>();
  let hasClientEffect = false;
  let hasServerEffect = false;
  let clientIslandCount = 0;
  let taskIndex = 0;
  const setupStateAliases = new Set<string>();

  function collectSetupStateAliases(current: ts.Node): void {
    if (current !== node && (ts.isFunctionExpression(current) || ts.isArrowFunction(current) || ts.isFunctionDeclaration(current))) return;
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.initializer
      && isSetupReactiveSnapshot(current.initializer, node, sourceFile, semanticReferences)) {
      const declaration = semanticDeclarationForIdentifier(current.name, semanticDeclarations, sourceFile);
      if (declaration) setupStateAliases.add(declaration.id);
    }
    ts.forEachChild(current, collectSetupStateAliases);
  }
  collectSetupStateAliases(node);

  function visit(current: ts.Node, islandDepth = 0, taskDepth = 0): void {
    if (ts.isCallExpression(current) && isThisTaskCall(current)) {
      const task = analyzeTask(`${name}:task:${taskIndex++}`, current, sourceFile, serverOnlyImports, semanticReferences, semanticDeclarations);
      tasks.push(task);
      contexts.push(...task.contexts);
      if (task.placement === "client") hasClientEffect = true;
      if (task.placement === "server") hasServerEffect = true;
      if (task.placement === "isomorphic") {
        hasClientEffect = true;
        hasServerEffect = true;
      }
      diagnostics.push(...task.diagnostics);
      ts.forEachChild(current, child => visit(child, islandDepth, taskDepth + 1));
      return;
    }

    if (isUnmanagedBrowserListener(current, islandDepth, taskDepth)) {
      diagnostics.push("error: browser-global addEventListener() must be registered in a client task or client island; use JSX events or an abort-scoped task");
    }
    if (isAsyncSnapshotCapture(current, setupStateAliases, semanticReferences, sourceFile)) {
      diagnostics.push("error: setup-time state snapshot captured by async callback; read state in the callback or wrap the snapshot in peek(() => ...)");
    }

    const contextEffect = contextEffectForCall(current, sourceFile);
    if (contextEffect) contexts.push(contextEffect);

    const isIslandElement = ts.isJsxElement(current) && jsxElementIsClientIsland(current.openingElement.attributes);
    const isIslandNode = isIslandElement || (ts.isJsxSelfClosingElement(current) && jsxElementIsClientIsland(current.attributes));
    if (ts.isJsxElement(current)) {
      addJsxTagSemanticDiagnostics(current.openingElement.tagName, diagnostics, semanticReferences, sourceFile);
    } else if (ts.isJsxSelfClosingElement(current)) {
      addJsxTagSemanticDiagnostics(current.tagName, diagnostics, semanticReferences, sourceFile);
    }
    const serverSlotChildren = ts.isJsxElement(current) && isIslandNode
      ? clientIslandHasServerSlotChildren(current, serverOnlyImports, semanticReferences, sourceFile)
      : false;
    if (islandDepth === 0 && isIslandNode) {
      clientIslandCount++;
      const serverOnlyCheckNode = serverSlotChildren && ts.isJsxElement(current)
        ? current.openingElement
        : current;
      if (containsServerOnlyIdentifier(serverOnlyCheckNode, serverOnlyImports, semanticReferences, sourceFile)) {
        diagnostics.push("error: client island cannot reference server-only imports");
      }
    }

    if (ts.isJsxAttribute(current)) {
      const propName = current.name.getText(sourceFile);
      if (/^on[A-Z]/.test(propName) || propName === "ref") {
        hasClientEffect = true;
        splitBoundaries.add(propName === "ref" ? "ref" : "event-handler");
      }
    }

    if (ts.isIdentifier(current)) {
      const reference = semanticReferenceForIdentifier(current, semanticReferences, sourceFile);
      if (isBrowserGlobalReference(current, reference)) {
        hasClientEffect = true;
        splitBoundaries.add(`browser:${current.text}`);
        if (islandDepth === 0 && taskDepth === 0) {
          browserGlobalsOutsideClientBoundary.add(current.text);
        }
      }
      if (isServerOnlyReference(current, reference, serverOnlyImports)) {
        hasServerEffect = true;
        splitBoundaries.add(`server-import:${current.text}`);
      }
    }

    ts.forEachChild(current, child => visit(child, isIslandNode ? islandDepth + 1 : islandDepth, taskDepth));
  }

  visit(node);

  const placement: ExactPlacement = hasClientEffect && hasServerEffect
    ? "isomorphic"
    : hasServerEffect
      ? "server"
      : hasClientEffect
        ? "client"
      : "server";

  if (hasServerEffect) {
    // Browser globals outside an explicit client boundary would end up in server
    // artifacts, so report them as compile errors instead of guessing.
    for (const global of [...browserGlobalsOutsideClientBoundary].sort()) {
      diagnostics.push(`error: browser-only global ${global} cannot be used in server-rendered component code; move it into a client island or client task`);
    }
  }

  return {
    id: stableId(sourceFile.fileName, name),
    name,
    exported: false,
    placement,
    subgraphPlacement: placement,
    renderEdges: [],
    clientIslandCount,
    tasks,
    contexts: uniqueContextEffects(contexts),
    splitBoundaries: [...splitBoundaries].sort(),
    diagnostics: uniqueDiagnostics(diagnostics)
  };
}

function isSetupReactiveSnapshot(
  expression: ts.Expression,
  component: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  semanticReferences: SemanticReferenceIndex
): boolean {
  if (stateEffectPath(expression, sourceFile, semanticReferences, new Map()) !== undefined) return true;
  if (ts.isCallExpression(expression)
    && ts.isPropertyAccessExpression(expression.expression)
    && expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword
    && expression.expression.name.text === "getContext") return true;
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression)) return false;
  const propsParameter = component.parameters.find(parameter => ts.isIdentifier(parameter.name) && parameter.name.text !== "this");
  if (!propsParameter || !ts.isIdentifier(propsParameter.name)) return false;
  const reference = semanticReferenceForIdentifier(expression.expression, semanticReferences, sourceFile);
  // The component analysis only needs a direct binding match; a parameter
  // reference is unambiguous even when a nested callback shadows `props`.
  return expression.expression.text === propsParameter.name.text && reference?.declarationKind === "parameter";
}

function isUnmanagedBrowserListener(node: ts.Node, islandDepth: number, taskDepth: number): boolean {
  if (islandDepth > 0 || taskDepth > 0 || !ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "addEventListener") return false;
  const target = node.expression.expression;
  return ts.isIdentifier(target) && (target.text === "window" || target.text === "document" || target.text === "globalThis");
}

function isAsyncSnapshotCapture(
  node: ts.Node,
  aliases: ReadonlySet<string>,
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): boolean {
  const asyncCall = ts.isCallExpression(node) && (
    ts.isIdentifier(node.expression) && ["setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame"].includes(node.expression.text)
    || ts.isPropertyAccessExpression(node.expression) && ["then", "catch", "finally"].includes(node.expression.name.text)
  ) || ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ["MutationObserver", "ResizeObserver", "IntersectionObserver"].includes(node.expression.text);
  if (!asyncCall) return false;
  const callback = node.arguments?.[0];
  if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return false;
  let captured = false;
  function visit(current: ts.Node): void {
    if (captured) return;
    if (ts.isIdentifier(current)) {
      const declarationId = semanticReferenceForIdentifier(current, semanticReferences, sourceFile)?.declarationId;
      if (declarationId && aliases.has(declarationId)) captured = true;
    }
    ts.forEachChild(current, visit);
  }
  visit(callback.body);
  return captured;
}

function containsServerOnlyIdentifier(
  node: ts.Node,
  serverOnlyImports: Set<string>,
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): boolean {
  if (!serverOnlyImports.size) return false;
  let found = false;
  function visit(current: ts.Node): void {
    if (found) return;
    if (ts.isIdentifier(current) && isServerOnlyReference(current, semanticReferenceForIdentifier(current, semanticReferences, sourceFile), serverOnlyImports)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

/** Returns whether a client island contains children that must remain server-rendered. */
export function clientIslandHasServerSlotChildren(
  node: ts.JsxElement,
  serverOnlyImports: Set<string>,
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile,
  componentPlacements: Map<string, ExactPlacement> = new Map()
): boolean {
  return node.children.some(child => containsServerOwnedSubgraph(child, serverOnlyImports, semanticReferences, sourceFile, componentPlacements));
}

function containsServerOwnedSubgraph(
  node: ts.Node,
  serverOnlyImports: Set<string>,
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile,
  componentPlacements: Map<string, ExactPlacement>
): boolean {
  if (ts.isJsxText(node)) return false;
  if (ts.isJsxExpression(node)) {
    return !!node.expression && containsServerOwnedSubgraph(node.expression, serverOnlyImports, semanticReferences, sourceFile, componentPlacements);
  }
  if (ts.isJsxElement(node) && jsxTagPlacement(node.openingElement.tagName, componentPlacements) === "server") return true;
  if (ts.isJsxSelfClosingElement(node) && jsxTagPlacement(node.tagName, componentPlacements) === "server") return true;
  if (containsServerOnlyIdentifier(node, serverOnlyImports, semanticReferences, sourceFile)) return true;
  let found = false;
  ts.forEachChild(node, child => {
    if (!found && containsServerOwnedSubgraph(child, serverOnlyImports, semanticReferences, sourceFile, componentPlacements)) {
      found = true;
    }
  });
  return found;
}

function jsxTagPlacement(tagName: ts.JsxTagNameExpression, componentPlacements: Map<string, ExactPlacement>): ExactPlacement | undefined {
  return ts.isIdentifier(tagName) ? componentPlacements.get(tagName.text) : undefined;
}

function addJsxTagSemanticDiagnostics(
  tagName: ts.JsxTagNameExpression,
  diagnostics: string[],
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): void {
  if (!ts.isIdentifier(tagName) || jsxTagIsIntrinsicElement(tagName)) return;
  const reference = semanticReferenceForIdentifier(tagName, semanticReferences, sourceFile);
  if (reference?.typeOnly) {
    diagnostics.push(`error: JSX tag ${tagName.text} resolves to a type-only import and cannot be rendered at runtime`);
    return;
  }
  if (reference?.source === "unresolved") {
    diagnostics.push(`error: JSX tag ${tagName.text} is not defined as a runtime component`);
    return;
  }
  if (reference && reference.declarationKind !== "import" && reference.declarationKind !== "function") {
    diagnostics.push(`error: JSX tag ${tagName.text} resolves to ${reference.declarationKind ?? reference.source}, not a runtime component`);
  }
}

/** Collects local and imported component placement info for a source file. */
export function collectComponentInfo(
  sourceFile: ts.SourceFile,
  serverOnlyImports: Set<string>,
  importedManifests: readonly ExactCompilerManifest[] = [],
  semanticGraph = buildSemanticGraph(sourceFile)
): Map<string, ExactImportedComponentIR> {
  const semanticReferences = createSemanticReferenceIndex(sourceFile, semanticGraph);
  const semanticDeclarations = createSemanticDeclarationIndex(sourceFile, semanticGraph);
  const components = new Map<string, ExactImportedComponentIR>();
  for (const component of collectImportedComponents(sourceFile, importedManifests, semanticGraph)) {
    components.set(component.name, component);
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && isComponentLikeFunction(node)) {
      const component = analyzeComponent(node.name.text, node, sourceFile, serverOnlyImports, semanticReferences, semanticDeclarations);
      components.set(node.name.text, {
        name: node.name.text,
        boundaryName: node.name.text,
        placement: component.placement,
        componentId: component.id
      });
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return components;
}

/** Collects JSX component render edges from one component function. */
export function collectComponentRenderEdges(
  root: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  componentInfo: Map<string, ExactImportedComponentIR>,
  semanticReferences: SemanticReferenceIndex
): ExactComponentRenderEdgeIR[] {
  const edges: ExactComponentRenderEdgeIR[] = [];

  function visit(node: ts.Node, path: number[] = []): void {
    if (node !== root && isFunctionLikeNode(node)) return;

    if (ts.isJsxElement(node)) {
      addEdge(node.openingElement.tagName, path);
    } else if (ts.isJsxSelfClosingElement(node)) {
      addEdge(node.tagName, path);
    }

    let childIndex = 0;
    ts.forEachChild(node, child => {
      visit(child, [...path, childIndex++]);
    });
  }

  function addEdge(tagName: ts.JsxTagNameExpression, path: readonly number[]): void {
    if (jsxTagIsIntrinsicElement(tagName)) return;
    if (!jsxTagCanReferenceComponent(tagName, semanticReferences, sourceFile)) return;
    const tag = tagName.getText(sourceFile);
    const component = componentInfo.get(tag);
    if (!component) return;
    const index = edges.length + 1;
    const pathText = path.join(".");
    edges.push({
      id: stableId(sourceFile.fileName, root.name?.text ?? "Anonymous", "render-edge", String(index), pathText, tag, component.componentId ?? component.name),
      tag,
      name: component.boundaryName ?? component.name,
      componentId: component.componentId,
      placement: component.placement,
      boundary: component.placement,
      index,
      path: pathText
    });
  }

  visit(root);
  return edges;
}

function isFunctionLikeNode(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isMethodDeclaration(node);
}

/** Combines child placements into the least-restrictive placement for a component graph. */
export function combinePlacements(placements: readonly ExactPlacement[]): ExactPlacement {
  let hasClient = false;
  let hasServer = false;
  let hasUnknown = false;

  for (const placement of placements) {
    if (placement === "isomorphic") {
      hasClient = true;
      hasServer = true;
    } else if (placement === "client") {
      hasClient = true;
    } else if (placement === "server") {
      hasServer = true;
    } else {
      hasUnknown = true;
    }
  }

  if (hasClient && hasServer) return "isomorphic";
  if (hasClient) return "client";
  if (hasServer) return "server";
  return hasUnknown ? "unknown" : "server";
}

/** Collects a component-name to placement map for a source file. */
export function collectComponentPlacements(
  sourceFile: ts.SourceFile,
  serverOnlyImports: Set<string>,
  importedManifests: readonly ExactCompilerManifest[] = []
): Map<string, ExactPlacement> {
  return componentPlacementsFromInfo(collectComponentInfo(sourceFile, serverOnlyImports, importedManifests));
}

/** Converts component info records into a component-name to placement map. */
export function componentPlacementsFromInfo(componentInfo: Map<string, ExactImportedComponentIR>): Map<string, ExactPlacement> {
  return new Map([...componentInfo].map(([name, component]) => [name, component.placement]));
}

/** Analyzes a this.task call into placement, state effects, context effects, and diagnostics. */
export function analyzeTask(
  seed: string,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  serverOnlyImports: Set<string>,
  semanticReferences: SemanticReferenceIndex,
  semanticDeclarations: SemanticDeclarationIndex
): ExactTaskIR {
  const work = node.arguments[node.arguments.length - 1];
  const reads: ExactStateEffect[] = [];
  const writes: ExactStateEffect[] = [];
  const contexts: ExactContextEffect[] = [];
  const diagnostics: string[] = [];
  let browserEffects = false;
  let serverEffects = false;
  let isAsync = false;
  const requestedPlacement = taskRequestedPlacement(node);

  if (!work || !isFunctionLikeExpression(work)) {
    return {
      id: stableId(sourceFile.fileName, seed),
      placement: "unknown",
      requestedPlacement,
      async: false,
      browserEffects: false,
      reads,
      writes,
      contexts,
      diagnostics: ["task work callback could not be analyzed"]
    };
  }

  isAsync = ts.canHaveModifiers(work)
    ? Boolean(ts.getModifiers(work)?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword))
    : false;
  const stateAliases = collectStateAliases(work, sourceFile, semanticReferences, semanticDeclarations);
  const taskSignal = taskSignalParameter(work);

  function visit(current: ts.Node): void {
    if (ts.isIdentifier(current)) {
      const reference = semanticReferenceForIdentifier(current, semanticReferences, sourceFile);
      if (isBrowserGlobalReference(current, reference)) browserEffects = true;
      if (isServerOnlyReference(current, reference, serverOnlyImports)) serverEffects = true;
    }

    if (ts.isPropertyAccessExpression(current)) {
      const path = stateEffectPath(current, sourceFile, semanticReferences, stateAliases);
      if (path !== undefined && path !== "*") {
        reads.push({
          path,
          kind: "read",
          confidence: path.includes("*") ? "broad" : "exact"
        });
      }
    }

    if (ts.isElementAccessExpression(current)) {
      const path = stateEffectPath(current, sourceFile, semanticReferences, stateAliases);
      if (path !== undefined && path !== "*") {
        reads.push({
          path,
          kind: "read",
          confidence: path.includes("*") ? "broad" : "exact"
        });
      }
    }

    if (ts.isIdentifier(current)) {
      const path = stateEffectPath(current, sourceFile, semanticReferences, stateAliases);
      if (path !== undefined && path !== "*") {
        reads.push({
          path,
          kind: "read",
          confidence: path.includes("*") ? "broad" : "exact"
        });
      }
    }

    if (ts.isPropertyAccessExpression(current) && isThisStateAccess(current.expression)) {
      reads.push({
        path: current.name.text,
        kind: "read",
        confidence: "exact"
      });
    }

    if (ts.isBinaryExpression(current) && isAssignmentOperator(current.operatorToken.kind)) {
      const target = current.left;
      const targetPath = stateEffectPath(target, sourceFile, semanticReferences, stateAliases);
      if (targetPath !== undefined) {
        writes.push({
          path: targetPath,
          kind: "write",
          confidence: targetPath.includes("*") ? "broad" : "exact"
        });
      }
      visit(current.right);
      return;
    }

    if (ts.isCallExpression(current)) {
      if (isBrowserGlobalListenerCall(current) && !listenerUsesTaskSignal(current, taskSignal)) {
        diagnostics.push("error: browser-global addEventListener() in a task must use the supplied abort signal ({ signal })");
      }
      const contextEffect = contextEffectForCall(current, sourceFile);
      if (contextEffect) contexts.push(contextEffect);

      const expression = current.expression;
      if (ts.isPropertyAccessExpression(expression)) {
        const receiverPath = stateEffectPath(expression.expression, sourceFile, semanticReferences, stateAliases);
        if (receiverPath !== undefined) {
          const method = expression.name.text;
          if (mutatingStateMethods.has(method)) {
            writes.push({
              path: receiverPath,
              kind: "write",
              confidence: "broad"
            });
          }
        }
        if (expression.name.text === "assign" && isUnshadowedGlobalIdentifier(expression.expression, "Object", semanticReferences, sourceFile)) {
          const target = current.arguments[0];
          const targetPath = target ? stateEffectPath(target, sourceFile, semanticReferences, stateAliases) : undefined;
          if (targetPath !== undefined) {
            writes.push({
              path: targetPath,
              kind: "write",
              confidence: "broad"
            });
          }
        }
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(work);

  if (browserEffects && writes.length) {
    diagnostics.push("task writes component state and references browser-only globals; classify as client and split at this boundary");
  }
  if (!requestedPlacement && !browserEffects && !serverEffects && writes.length) {
    // State-writing environment-neutral tasks can run during SSR to populate state,
    // then be skipped or reconciled by hydration using serialized state.
    diagnostics.push("task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work");
  }
  if (!browserEffects && !serverEffects && !writes.length) {
    diagnostics.push("task has no detected state writes or environment-specific effects; classify as client lifecycle work");
  }

  const inferredPlacement: ExactPlacement = browserEffects
    ? "client"
    : serverEffects
      ? "server"
      : writes.length
        ? "isomorphic"
        : "client";
  if (requestedPlacement === "server" && browserEffects) {
    diagnostics.push("error: this.task.server() cannot reference browser-only globals");
  }
  if (requestedPlacement === "client" && serverEffects) {
    diagnostics.push("error: this.task.client() cannot reference server-only imports");
  }
  if (requestedPlacement) {
    diagnostics.push(`task placement forced by this.task.${requestedPlacement}()`);
  }

  return {
    id: stableId(sourceFile.fileName, seed),
    placement: requestedPlacement ?? inferredPlacement,
    requestedPlacement,
    async: isAsync,
    browserEffects,
    reads: uniqueEffects(reads),
    writes: uniqueEffects(writes),
    contexts: uniqueContextEffects(contexts),
    diagnostics
  };
}

function isBrowserGlobalListenerCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "addEventListener") return false;
  const receiver = node.expression.expression;
  return ts.isIdentifier(receiver) && (receiver.text === "window" || receiver.text === "document" || receiver.text === "globalThis");
}

function taskSignalParameter(work: ts.FunctionLikeDeclarationBase): string | undefined {
  const parameter = work.parameters[work.parameters.length - 1];
  if (!parameter || !ts.isObjectBindingPattern(parameter.name)) return undefined;
  for (const element of parameter.name.elements) {
    if (element.propertyName?.getText() === "signal" || !element.propertyName && element.name.getText() === "signal") {
      return element.name.getText();
    }
  }
  return undefined;
}

function listenerUsesTaskSignal(node: ts.CallExpression, signal: string | undefined): boolean {
  if (!signal) return false;
  const options = node.arguments[2];
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  return options.properties.some(property => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false;
    const name = ts.isPropertyAssignment(property) ? property.name.getText() : property.name.text;
    if (name !== "signal") return false;
    const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
    return ts.isIdentifier(value) && value.text === signal;
  });
}

function isUnshadowedGlobalIdentifier(
  node: ts.Expression,
  name: string,
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): boolean {
  if (!ts.isIdentifier(node) || node.text !== name) return false;
  const reference = semanticReferenceForIdentifier(node, semanticReferences, sourceFile);
  return !reference || reference.source === "unresolved" || reference.source === "global";
}

const mutatingStateMethods = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "set", "delete", "clear"]);

/** Creates server-slot boundaries for generated client islands with server-owned children. */
export function createGeneratedClientIslandServerSlotBoundaries(
  sourceFile: ts.SourceFile,
  components: readonly ExactComponentIR[],
  serverOnlyImports: Set<string>,
  semanticReferences: SemanticReferenceIndex,
  componentPlacements: Map<string, ExactPlacement>
): ExactBoundaryIR[] {
  const boundaries: ExactBoundaryIR[] = [];

  for (const component of components) {
    const counts = new Map<string, number>();
    const node = findComponentDeclaration(sourceFile, component.name);
    if (!node) continue;
    visitComponent(node, node, component, counts);
  }

  function visitComponent(node: ts.Node, root: ts.FunctionDeclaration, owner: ExactComponentIR, counts: Map<string, number>, islandDepth = 0): void {
    if (node !== root && isFunctionLikeNode(node)) return;
    const isIslandElement = ts.isJsxElement(node) && jsxElementIsClientIsland(node.openingElement.attributes);
    const isIslandNode = isIslandElement || (ts.isJsxSelfClosingElement(node) && jsxElementIsClientIsland(node.attributes));
    if (islandDepth === 0 && ts.isJsxElement(node) && isIslandElement) {
      const index = (counts.get(owner.name) ?? 0) + 1;
      counts.set(owner.name, index);
      if (clientIslandHasServerSlotChildren(node, serverOnlyImports, semanticReferences, sourceFile, componentPlacements)) {
        const islandId = stableId(sourceFile.fileName, owner.name, "client-island", String(index));
        boundaries.push({
          id: serverSlotBoundaryId(islandId),
          name: `${generatedComponentName(owner.name, "client-island", index)}:children`,
          componentId: owner.id,
          ownerComponentId: owner.id,
          kind: "server-slot"
        });
      }
    } else if (islandDepth === 0 && ts.isJsxSelfClosingElement(node) && isIslandNode) {
      const index = (counts.get(owner.name) ?? 0) + 1;
      counts.set(owner.name, index);
    }
    ts.forEachChild(node, child => visitComponent(child, root, owner, counts, isIslandNode ? islandDepth + 1 : islandDepth));
  }

  return boundaries;
}

function findComponentDeclaration(sourceFile: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  return sourceFile.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name) as ts.FunctionDeclaration | undefined;
}

/** Creates client-island boundaries for JSX tags that reference client components. */
export function createClientComponentTagBoundaries(
  sourceFile: ts.SourceFile,
  components: readonly ExactComponentIR[],
  componentInfo: Map<string, ExactImportedComponentIR>,
  componentPlacements: Map<string, ExactPlacement>,
  semanticReferences: SemanticReferenceIndex
): ExactBoundaryIR[] {
  const boundaries: ExactBoundaryIR[] = [];
  const seen = new Set<string>();
  const localComponents = new Map(components.map(component => [component.name, component]));
  const ownerStack: (ExactComponentIR | undefined)[] = [];

  function visit(node: ts.Node, path: number[] = []): void {
    if (ts.isFunctionDeclaration(node) && node.name && isComponentLikeFunction(node)) {
      ownerStack.push(localComponents.get(node.name.text));
      let childIndex = 0;
      ts.forEachChild(node, child => {
        visit(child, [childIndex++]);
      });
      ownerStack.pop();
      return;
    }
    if (ts.isJsxElement(node) && jsxTagIsClientComponent(node.openingElement.tagName, componentPlacements, sourceFile, semanticReferences)) {
      addBoundary(node.openingElement.tagName, node, path);
    } else if (ts.isJsxSelfClosingElement(node) && jsxTagIsClientComponent(node.tagName, componentPlacements, sourceFile, semanticReferences)) {
      addBoundary(node.tagName, node, path);
    }
    let childIndex = 0;
    ts.forEachChild(node, child => {
      visit(child, [...path, childIndex++]);
    });
  }

  function addBoundary(tagName: ts.JsxTagNameExpression, node: ts.Node, path: readonly number[]): void {
    const tagKey = tagName.getText(sourceFile);
    const component = componentInfo.get(tagKey);
    const componentName = component?.boundaryName ?? tagKey;
    const owner = ownerStack[ownerStack.length - 1];
    const renderEdge = findRenderEdge(owner, path);
    const id = clientComponentBoundaryId(sourceFile, componentName, node);
    if (seen.has(id)) return;
    seen.add(id);
    boundaries.push({
      id,
      name: componentName,
      componentId: component?.componentId,
      ownerComponentId: owner?.id,
      renderEdgeId: renderEdge?.id,
      renderEdgeIndex: renderEdge?.index,
      renderPath: renderEdge?.path,
      kind: "client-island"
    });
  }

  visit(sourceFile);
  return boundaries;
}

/** Creates server-slot boundaries for server children passed into client component tags. */
export function createServerSlotBoundaries(
  sourceFile: ts.SourceFile,
  components: readonly ExactComponentIR[],
  componentInfo: Map<string, ExactImportedComponentIR>,
  componentPlacements: Map<string, ExactPlacement>,
  semanticReferences: SemanticReferenceIndex
): ExactBoundaryIR[] {
  const boundaries: ExactBoundaryIR[] = [];
  const seen = new Set<string>();
  const localComponents = new Map(components.map(component => [component.name, component]));
  const ownerStack: (ExactComponentIR | undefined)[] = [];

  function visit(node: ts.Node, path: number[] = []): void {
    if (ts.isFunctionDeclaration(node) && node.name && isComponentLikeFunction(node)) {
      ownerStack.push(localComponents.get(node.name.text));
      let childIndex = 0;
      ts.forEachChild(node, child => {
        visit(child, [childIndex++]);
      });
      ownerStack.pop();
      return;
    }
    if (ts.isJsxElement(node) && jsxTagIsClientComponent(node.openingElement.tagName, componentPlacements, sourceFile, semanticReferences) && clientComponentHasServerSlotChildren(node)) {
      const tagKey = node.openingElement.tagName.getText(sourceFile);
      const component = componentInfo.get(tagKey);
      const componentName = component?.boundaryName ?? tagKey;
      const owner = ownerStack[ownerStack.length - 1];
      const renderEdge = findRenderEdge(owner, path);
      const islandId = clientComponentBoundaryId(sourceFile, componentName, node);
      const id = serverSlotBoundaryId(islandId);
      if (!seen.has(id)) {
        seen.add(id);
        boundaries.push({
          id,
          name: `${componentName}:children`,
          componentId: component?.componentId,
          ownerComponentId: owner?.id,
          renderEdgeId: renderEdge?.id,
          renderEdgeIndex: renderEdge?.index,
          renderPath: renderEdge?.path,
          kind: "server-slot"
        });
      }
    }
    let childIndex = 0;
    ts.forEachChild(node, child => {
      visit(child, [...path, childIndex++]);
    });
  }

  visit(sourceFile);
  return boundaries;
}

function findRenderEdge(owner: ExactComponentIR | undefined, path: readonly number[]): ExactComponentRenderEdgeIR | undefined {
  if (!owner) return undefined;
  const pathText = path.join(".");
  return owner.renderEdges.find(edge => edge.path === pathText);
}
