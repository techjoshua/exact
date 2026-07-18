import path from "node:path";
import type { BoundModule, NodeRef, Variable } from "@exact/expressions";
import { expressionComponentIndex } from "./expression-component-index.js";
import { stableId } from "./ids.js";
import { isServerOnlyModule } from "./imports.js";
import { isUnshadowedPlatformGlobal } from "./platform-effects.js";
import type {
  ExactArtifactTarget,
  ExactCallableSummaryIR,
  ExactCallEdgeIR,
  ExactCompilerManifest,
  ExactEnvironmentEffect,
  ExactEnvironmentEffectSourceIR,
  ExactSemanticGraphIR
} from "./types.js";
import { hasExactDirective, trackedCallbackArguments } from "./annotations.js";
import { expressionStatePath, type ExpressionWritePlan } from "./expression-writes.js";
import type { ExactContextEffect, ExactStateEffect } from "./types.js";
import type { ExactModuleImportPlan } from "./assets.js";

export interface CallableEffectPlan {
  readonly callables: readonly ExactCallableSummaryIR[];
  readonly byNodeId: ReadonlyMap<string, ExactCallableSummaryIR>;
  readonly callEffects: ReadonlyMap<string, Readonly<{ effect: ExactEnvironmentEffect; sources: readonly ExactEnvironmentEffectSourceIR[] }>>;
}

type MutableCallable = {
  id: string;
  nodeId: string;
  name: string;
  kind: ExactCallableSummaryIR["kind"];
  exportNames: string[];
  directSources: ExactEnvironmentEffectSourceIR[];
  sources: ExactEnvironmentEffectSourceIR[];
  calls: ExactCallEdgeIR[];
  directWrites: ExactStateEffect[];
  writes: ExactStateEffect[];
  directReads: ExactStateEffect[];
  reads: ExactStateEffect[];
  directContexts: ExactContextEffect[];
  contexts: ExactContextEffect[];
  seedTargets: ExactArtifactTarget[];
  executable: boolean;
  parameters: readonly Variable[];
};

/** Builds deterministic declaration summaries and resolves their transitive environment effects. */
export function analyzeCallableEffects(
  module: BoundModule,
  graph: ExactSemanticGraphIR,
  importedManifests: readonly ExactCompilerManifest[] = [],
  writePlan?: ExpressionWritePlan,
  moduleImports?: ExactModuleImportPlan,
  knownCallEffects: ReadonlyMap<string, "server" | "client" | "isomorphic"> = new Map()
): CallableEffectPlan {
  const componentIndex = expressionComponentIndex(module);
  const stateAliases = writePlan?.aliases ?? new Map<string, readonly string[]>();
  const localVariables = new Set(module.walk().references().toArray()
    .map(reference => reference.variable)
    .filter((variable): variable is Variable => !!variable && variable.id.startsWith(`${module.filename}:`)));
  const importedNames = new Map(graph.declarations
    .filter(declaration => declaration.kind === "import")
    .map(declaration => [declaration.id, declaration.importedName ?? declaration.name]));
  const exportedNames = exportedNamesByVariable(module, graph);
  const functions = module.walk().functions().where(reference => !!reference.node.span).toArray();
  const callableByVariable = new Map<string, MutableCallable>();
  const initializerByVariable = new Map<string, MutableCallable>();
  const callableByNode = new Map<string, MutableCallable>();
  const callNodeIds = new Map<string, string>();
  const mutable: MutableCallable[] = [];

  for (const fn of functions) {
    const task = taskOwner(fn);
    const component = componentIndex.isComponent(fn);
    const variable = declarationVariable(fn);
    const name = task ? `${componentIndex.owner(fn)?.node.name ?? "component"}.task@${fn.node.span!.start}` : callableName(fn, variable);
    const declaredEnvironment = hasExactDirective(fn.node.directives, "client")
      ? "browser" as const
      : hasExactDirective(fn.node.directives, "server")
        ? "server" as const
        : undefined;
    const summary: MutableCallable = {
      id: stableId(module.filename, "callable", fn.node.id),
      nodeId: fn.node.id,
      name,
      kind: task ? "task" : component ? "component" : fn.node.kind === "MethodDeclaration" ? "method" : "function",
      exportNames: variable ? [...(exportedNames.get(variable.id) ?? [])] : [],
      directSources: declaredEnvironment ? [source(declaredEnvironment, `exact ${declaredEnvironment === "browser" ? "client" : "server"} callable`, name)] : [],
      sources: declaredEnvironment ? [source(declaredEnvironment, `exact ${declaredEnvironment === "browser" ? "client" : "server"} callable`, name)] : [],
      calls: []
      ,directWrites: []
      ,writes: []
      ,directReads: []
      ,reads: []
      ,directContexts: []
      ,contexts: []
      ,seedTargets: clientBoundaryFunction(fn) ? ["client"] : []
      ,executable: false
      ,parameters: ((fn.node as { parameters?: readonly Variable[] }).parameters ?? []).filter(parameter => parameter.name !== "this")
    };
    mutable.push(summary);
    callableByNode.set(fn.node.id, summary);
    if (variable) callableByVariable.set(variable.id, summary);
  }

  const initializers = new Map<string, NodeRef>();
  for (const declaration of module.walk().ofKind("VariableDeclaration")) {
    const variable = declaration.children().first()?.variable;
    const initializer = declaration.children().toArray().at(-1);
    if (!variable || variable.scope.kind !== "module" || !initializer || initializer.node === declaration.children().first()?.node || isFunctionNode(initializer)) continue;
    const summary: MutableCallable = {
      id: stableId(module.filename, "initializer", declaration.node.id),
      nodeId: initializer.node.id,
      name: `${variable.name}.initializer`,
      kind: "initializer",
      exportNames: [...(exportedNames.get(variable.id) ?? [])],
      directSources: [],
      sources: [],
      calls: []
      ,directWrites: []
      ,writes: []
      ,directReads: []
      ,reads: []
      ,directContexts: []
      ,contexts: []
      ,seedTargets: []
      ,executable: false
      ,parameters: []
    };
    mutable.push(summary);
    callableByNode.set(initializer.node.id, summary);
    initializerByVariable.set(variable.id, summary);
    initializers.set(summary.id, initializer);
  }

  for (const statement of module.walk().where(reference =>
    (reference.node.kind === "ExpressionStatement"
      || reference.node.kind === "ImportDeclaration" && /^\s*import\s*["']/.test(reference.node.text ?? ""))
    && reference.parent?.node.kind === "SourceFile")) {
    const summary: MutableCallable = {
      id: stableId(module.filename, "module-initializer", statement.node.id),
      nodeId: statement.node.id,
      name: `<module initializer@${statement.node.span?.start ?? 0}>`,
      kind: "module-initializer",
      exportNames: [],
      directSources: [],
      sources: [],
      calls: [],
      directWrites: [],
      writes: [],
      directReads: [],
      reads: [],
      directContexts: [],
      contexts: [],
      seedTargets: [],
      executable: true
      ,parameters: []
    };
    mutable.push(summary);
    callableByNode.set(statement.node.id, summary);
    initializers.set(summary.id, statement);
  }

  const external = externalCallableIndex(module.filename, importedManifests);
  for (const exported of graph.exports) {
    if (!exported.moduleSpecifier || !exported.importedName || exported.typeOnly) continue;
    const target = external.get(externalKey(exported.moduleSpecifier, exported.importedName));
    if (!target) continue;
    const summary: MutableCallable = {
      id: stableId(module.filename, "re-export", exported.exportedName, exported.moduleSpecifier, exported.importedName),
      nodeId: stableId(module.filename, "re-export-node", exported.exportedName),
      name: exported.exportedName,
      kind: target.kind,
      exportNames: [exported.exportedName],
      directSources: target.effectSources.map(effectSource => prepend(effectSource, exported.exportedName)),
      sources: target.effectSources.map(effectSource => prepend(effectSource, exported.exportedName)),
      calls: [{
        id: stableId(module.filename, "re-export-edge", exported.exportedName, exported.moduleSpecifier),
        name: exported.importedName,
        moduleSpecifier: exported.moduleSpecifier,
        exportName: exported.importedName,
        resolved: true
      }],
      directWrites: [...target.stateWrites],
      writes: [...target.stateWrites],
      directReads: [...target.stateReads],
      reads: [...target.stateReads],
      directContexts: [...target.contexts],
      contexts: [...target.contexts],
      seedTargets: [],
      executable: false
      ,parameters: []
    };
    mutable.push(summary);
  }
  for (const fn of functions) {
    const owner = nearestFunction(fn);
    if (!owner || fn.parent?.node.kind !== "ReturnStatement") continue;
    const ownerSummary = callableByNode.get(owner.node.id);
    const returnedSummary = callableByNode.get(fn.node.id);
    if (!ownerSummary || !returnedSummary) continue;
    ownerSummary.calls.push({
      id: stableId(module.filename, ownerSummary.id, "returned", fn.node.id),
      name: `${returnedSummary.name}:returned`,
      targetId: returnedSummary.id,
      resolved: true
    });
  }
  const referencesById = new Map(module.walk().toArray().map(reference => [reference.node.id, reference]));
  for (const site of writePlan?.sites.values() ?? []) {
    const reference = referencesById.get(site.nodeId);
    const owner = reference ? nearestFunction(reference) : undefined;
    const summary = owner ? callableByNode.get(owner.node.id) : undefined;
    if (!summary) continue;
    summary.directWrites.push({ path: site.path.join("."), kind: "write", confidence: site.operation === "array-mutation" ? "broad" : "exact" });
  }
  for (const summary of mutable) summary.writes = uniqueStateEffects(summary.directWrites);
  for (const fn of functions) {
    const summary = callableByNode.get(fn.node.id)!;
    for (const reference of fn.descendants({ types: false }).where(candidate => candidate.node.kind === "Identifier" || candidate.node.kind === "ThisKeyword")) {
      if (nearestFunction(reference)?.node !== fn.node) continue;
      const variable = reference.variable;
      const name = variable?.name ?? reference.name;
      const platform = isUnshadowedPlatformGlobal(name, variable, localVariables);
      if (platform) summary.directSources.push(source(platform, name!, summary.name));
      const explicitImportPlacement = variable?.importedFrom ? moduleImports?.placementBySpecifier.get(variable.importedFrom) : undefined;
      if (explicitImportPlacement) summary.directSources.push(source(explicitImportPlacement === "client" ? "browser" : "server", `exact ${explicitImportPlacement} import ${variable!.importedFrom}`, summary.name));
      if (variable?.importedFrom && isServerOnlyModule(variable.importedFrom)) {
        summary.directSources.push(source("server", `${variable.importedFrom}:${variable.name}`, summary.name));
      }
      const initializer = variable ? initializerByVariable.get(variable.id) : undefined;
      if (initializer) summary.calls.push({
        id: stableId(module.filename, summary.id, "dependency", reference.node.id),
        name: variable!.name,
        targetId: initializer.id,
        resolved: true
      });
    }
    for (const call of fn.descendants({ types: false }).calls()) {
      if (nearestFunction(call)?.node !== fn.node) continue;
      const variable = callVariable(call);
      const local = localCallTarget(call, callableByVariable, initializerByVariable, callableByNode);
      const knownCallEffect = knownCallEffects.get(call.node.id);
      const boundImportedName = variable ? importedNames.get(variable.id) ?? variable.name : undefined;
      const importedName = boundImportedName === "*" && call.target?.isMember() ? call.target.name : boundImportedName;
      const resolvedExternal = variable?.importedFrom ? external.get(externalKey(variable.importedFrom, importedName ?? variable.name)) : undefined;
      const edge: ExactCallEdgeIR = {
        id: stableId(module.filename, summary.id, "call", call.node.id),
        name: call.target?.node.text?.trim() ?? call.node.text?.trim() ?? "call",
        ...(local ? { targetId: local.id } : {}),
        ...(variable?.importedFrom ? { moduleSpecifier: variable.importedFrom, exportName: importedName } : {}),
        resolved: !!local || !!resolvedExternal || !!knownCallEffect,
        ...receiverBindingField(call, summary, local, resolvedExternal)
      };
      summary.calls.push(edge);
      callNodeIds.set(edge.id, call.node.id);
      if (resolvedExternal) {
        for (const effectSource of resolvedExternal.effectSources) summary.directSources.push(prepend(effectSource, summary.name));
        summary.directReads.push(...mapStateEffects(resolvedExternal.stateReads, edge));
        summary.directWrites.push(...mapStateEffects(resolvedExternal.stateWrites, edge));
        summary.directContexts.push(...resolvedExternal.contexts);
      } else if (!local && knownCallEffect) {
        if (knownCallEffect !== "isomorphic") {
          summary.directSources.push(source(
            knownCallEffect === "client" ? "browser" : "server",
            `${knownCallEffect} context call`,
            summary.name
          ));
        }
      } else if (!local) {
        const placed = variable?.importedFrom ? moduleImports?.placementBySpecifier.get(variable.importedFrom) : undefined;
        const unresolved = placed
          ? placed === "client" ? "browser" : "server"
          : isCompilerOwnedCollectionCall(module, call, stateAliases)
            ? undefined
            : unresolvedCallEffect(call, localVariables);
        if (unresolved) summary.directSources.push(source(unresolved, call.target?.node.text?.trim() ?? "dynamic call", summary.name));
      }
      const callbacks = new Set<NodeRef>(trackedCallbackArguments(call));
      if (knownHigherOrderCall(call)) for (const argument of call.arguments) if (isFunctionNode(argument)) callbacks.add(argument);
      for (const callback of callbacks) {
        const target = callableByNode.get(callback.node.id);
        if (!target) continue;
        const callbackEdge: ExactCallEdgeIR = {
          id: stableId(module.filename, summary.id, "callback", call.node.id, callback.node.id),
          name: `${edge.name}:callback`,
          targetId: target.id,
          resolved: true
        };
        summary.calls.push(callbackEdge);
        callNodeIds.set(callbackEdge.id, call.node.id);
      }
      if (call.target?.isMember() && /^this\.(?:getContext|setContext)$/.test(call.target.node.text ?? "")) {
        const token = call.arguments[0];
        const exact = token && /^(?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/.test(token.node.text ?? "");
        summary.directContexts.push({
          token: exact ? token!.node.text! : "unknown",
          kind: call.target.name === "getContext" ? "read" : "write",
          confidence: exact ? "exact" : "unknown"
        });
      }
    }
    for (const member of fn.descendants({ types: false }).memberAccesses()) {
      if (nearestFunction(member)?.node !== fn.node) continue;
      const statePath = expressionStatePath(module, member.node, writePlan?.aliases ?? new Map());
      const memberSpan = member.node.span;
      const assignmentTarget = statePath?.length && memberSpan && [...(writePlan?.sites.values() ?? [])].some(site =>
        site.operation === "assignment" && site.path.join(".") === statePath.join(".") && site.start <= memberSpan.start && site.end >= memberSpan.end);
      if (statePath?.length && !assignmentTarget) summary.directReads.push({ path: statePath.join("."), kind: "read", confidence: "exact" });
      const parameterState = parameterStateEffect(member, summary.parameters);
      if (parameterState) {
        if (isStateWrite(member)) summary.directWrites.push({ ...parameterState, kind: "write" });
        else summary.directReads.push({ ...parameterState, kind: "read" });
      }
    }
    summary.directSources = uniqueSources(summary.directSources);
    summary.sources = [...summary.directSources];
    summary.reads = uniqueStateEffects(summary.directReads);
    summary.contexts = uniqueContextEffects(summary.directContexts);
  }

  for (const [summaryId, initializer] of initializers) {
    const summary = mutable.find(candidate => candidate.id === summaryId)!;
    if (summary.kind === "module-initializer" && initializer.node.kind === "ImportDeclaration") {
      const moduleSpecifier = initializer.node.text?.match(/^\s*import\s*["']([^"']+)["']/)?.[1];
      const explicitPlacement = moduleSpecifier ? moduleImports?.placementBySpecifier.get(moduleSpecifier) : undefined;
      if (explicitPlacement) {
        summary.directSources.push(source(explicitPlacement === "client" ? "browser" : "server", `exact ${explicitPlacement} import ${moduleSpecifier}`, summary.name));
      } else {
        const importedInitializers = moduleSpecifier ? externalModuleInitializers(module.filename, moduleSpecifier, importedManifests) : [];
        if (!importedInitializers.length) summary.directSources.push(source("unknown", `side-effect import ${moduleSpecifier ?? "<unknown>"}`, summary.name));
        for (const imported of importedInitializers) {
          summary.directSources.push(...imported.effectSources.map(effectSource => prepend(effectSource, summary.name)));
          summary.directReads.push(...imported.stateReads);
          summary.directWrites.push(...imported.stateWrites);
          summary.directContexts.push(...imported.contexts);
          summary.calls.push({
            id: stableId(module.filename, summary.id, "side-effect-import", moduleSpecifier!, imported.id),
            name: moduleSpecifier!,
            moduleSpecifier,
            resolved: true
          });
        }
      }
    }
    for (const reference of initializer.walk({ types: false }).where(candidate => candidate.node.kind === "Identifier" || candidate.node.kind === "ThisKeyword")) {
      if (nearestFunction(reference)) continue;
      const variable = reference.variable;
      const name = variable?.name ?? reference.name;
      const platform = isUnshadowedPlatformGlobal(name, variable, localVariables);
      if (platform) summary.directSources.push(source(platform, name!, summary.name));
      const explicitImportPlacement = variable?.importedFrom ? moduleImports?.placementBySpecifier.get(variable.importedFrom) : undefined;
      if (explicitImportPlacement) summary.directSources.push(source(explicitImportPlacement === "client" ? "browser" : "server", `exact ${explicitImportPlacement} import ${variable!.importedFrom}`, summary.name));
      if (variable?.importedFrom && isServerOnlyModule(variable.importedFrom)) summary.directSources.push(source("server", `${variable.importedFrom}:${variable.name}`, summary.name));
      const dependency = variable ? initializerByVariable.get(variable.id) : undefined;
      if (dependency && dependency !== summary) summary.calls.push({
        id: stableId(module.filename, summary.id, "dependency", reference.node.id),
        name: variable!.name,
        targetId: dependency.id,
        resolved: true
      });
      const callableDependency = variable ? callableByVariable.get(variable.id) : undefined;
      if (callableDependency && callableDependency !== summary) summary.calls.push({
        id: stableId(module.filename, summary.id, "callable-dependency", reference.node.id),
        name: variable!.name,
        targetId: callableDependency.id,
        resolved: true
      });
    }
    for (const call of initializer.walk({ types: false }).calls()) {
      if (nearestFunction(call)) continue;
      const variable = callVariable(call);
      const local = localCallTarget(call, callableByVariable, initializerByVariable, callableByNode);
      const knownCallEffect = knownCallEffects.get(call.node.id);
      const boundImportedName = variable ? importedNames.get(variable.id) ?? variable.name : undefined;
      const importedName = boundImportedName === "*" && call.target?.isMember() ? call.target.name : boundImportedName;
      const resolvedExternal = variable?.importedFrom ? external.get(externalKey(variable.importedFrom, importedName ?? variable.name)) : undefined;
      const edge: ExactCallEdgeIR = {
        id: stableId(module.filename, summary.id, "call", call.node.id),
        name: call.target?.node.text?.trim() ?? call.node.text?.trim() ?? "call",
        ...(local ? { targetId: local.id } : {}),
        ...(variable?.importedFrom ? { moduleSpecifier: variable.importedFrom, exportName: importedName } : {}),
        resolved: !!local || !!resolvedExternal || !!knownCallEffect,
        ...receiverBindingField(call, summary, local, resolvedExternal)
      };
      summary.calls.push(edge);
      callNodeIds.set(edge.id, call.node.id);
      if (resolvedExternal) {
        for (const effectSource of resolvedExternal.effectSources) summary.directSources.push(prepend(effectSource, summary.name));
        summary.directReads.push(...mapStateEffects(resolvedExternal.stateReads, edge));
        summary.directWrites.push(...mapStateEffects(resolvedExternal.stateWrites, edge));
        summary.directContexts.push(...resolvedExternal.contexts);
      } else if (!local && knownCallEffect) {
        if (knownCallEffect !== "isomorphic") {
          summary.directSources.push(source(
            knownCallEffect === "client" ? "browser" : "server",
            `${knownCallEffect} context call`,
            summary.name
          ));
        }
      } else if (!local) {
        const placed = variable?.importedFrom ? moduleImports?.placementBySpecifier.get(variable.importedFrom) : undefined;
        const unresolved = placed
          ? placed === "client" ? "browser" : "server"
          : isCompilerOwnedCollectionCall(module, call, stateAliases)
            ? undefined
            : unresolvedCallEffect(call, localVariables);
        if (unresolved) summary.directSources.push(source(unresolved, call.target?.node.text?.trim() ?? "dynamic call", summary.name));
      }
    }
    summary.directSources = uniqueSources(summary.directSources);
    summary.sources = [...summary.directSources];
    summary.reads = uniqueStateEffects(summary.directReads);
    summary.writes = uniqueStateEffects(summary.directWrites);
    summary.contexts = uniqueContextEffects(summary.directContexts);
  }

  // Resolve callee SCCs before callers, then run a monotone fixed point only
  // inside each recursive component. Source order cannot affect the result.
  const mutableById = new Map(mutable.map(summary => [summary.id, summary]));
  for (const component of callableSccOrder(mutable)) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const summary of component) {
      const next = [...summary.directSources];
      for (const edge of summary.calls) {
        if (!edge.targetId) continue;
        const target = mutableById.get(edge.targetId);
        if (target) for (const effectSource of target.sources) next.push(prepend(effectSource, summary.name));
      }
      const unique = uniqueSources(next);
      if (sourceSignature(unique) !== sourceSignature(summary.sources)) {
        summary.sources = unique;
        changed = true;
      }
      const nextWrites = [...summary.directWrites];
      for (const edge of summary.calls) {
        const target = edge.targetId ? mutableById.get(edge.targetId) : undefined;
        if (target) nextWrites.push(...mapStateEffects(target.writes, edge));
      }
      const writes = uniqueStateEffects(nextWrites);
      if (JSON.stringify(writes) !== JSON.stringify(summary.writes)) {
        summary.writes = writes;
        changed = true;
      }
      const nextReads = [...summary.directReads];
      const nextContexts = [...summary.directContexts];
      for (const edge of summary.calls) {
        const target = edge.targetId ? mutableById.get(edge.targetId) : undefined;
        if (target) {
          nextReads.push(...mapStateEffects(target.reads, edge));
          nextContexts.push(...target.contexts);
        }
      }
      const reads = uniqueStateEffects(nextReads);
      const contexts = uniqueContextEffects(nextContexts);
      if (JSON.stringify(reads) !== JSON.stringify(summary.reads)) { summary.reads = reads; changed = true; }
      if (JSON.stringify(contexts) !== JSON.stringify(summary.contexts)) { summary.contexts = contexts; changed = true; }
      }
    }
  }

  const targetSets = callableArtifactTargets(mutable);
  const callables = mutable.map(summary => Object.freeze({
    id: summary.id,
    name: summary.name,
    kind: summary.kind,
    exportNames: [...summary.exportNames].sort(),
    directEffect: effectFor(summary.directSources),
    effect: effectFor(summary.sources),
    directEffectSources: summary.directSources,
    effectSources: summary.sources,
    calls: [...summary.calls].sort((left, right) => left.id.localeCompare(right.id)),
    artifactTargets: [...(targetSets.get(summary.id) ?? [])].sort()
    ,stateReads: summary.reads
    ,stateWrites: summary.writes
    ,contexts: summary.contexts
  } satisfies ExactCallableSummaryIR)).sort((left, right) => left.id.localeCompare(right.id));
  const byNodeId = new Map<string, ExactCallableSummaryIR>();
  for (const summary of mutable) byNodeId.set(summary.nodeId, callables.find(candidate => candidate.id === summary.id)!);
  const byId = new Map(callables.map(summary => [summary.id, summary]));
  const callEffects = new Map<string, Readonly<{ effect: ExactEnvironmentEffect; sources: readonly ExactEnvironmentEffectSourceIR[] }>>();
  for (const summary of mutable) for (const edge of summary.calls) {
    const target = edge.targetId ? byId.get(edge.targetId) : undefined;
    const imported = edge.moduleSpecifier && edge.exportName ? external.get(externalKey(edge.moduleSpecifier, edge.exportName)) : undefined;
    const resolved = target ?? imported;
    const callNodeId = callNodeIds.get(edge.id);
    if (resolved && callNodeId) callEffects.set(callNodeId, Object.freeze({ effect: resolved.effect, sources: resolved.effectSources }));
  }
  return Object.freeze({ callables: Object.freeze(callables), byNodeId, callEffects });
}

function uniqueStateEffects(values: readonly ExactStateEffect[]): ExactStateEffect[] {
  return [...new Map(values.map(value => [`${value.kind}:${value.path}:${value.confidence}:${stateReceiverKey(value)}`, value])).values()]
    .sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

function stateReceiverKey(value: ExactStateEffect): string {
  return value.receiver?.kind === "parameter" ? `parameter:${value.receiver.index}` : value.receiver?.kind ?? "component";
}

function receiverBindingField(
  call: NodeRef,
  caller: MutableCallable,
  local: MutableCallable | undefined,
  external: ExactCallableSummaryIR | undefined
): Pick<ExactCallEdgeIR, "receiverBindings"> | Record<string, never> {
  const indices = local
    ? local.parameters.map((_, index) => index)
    : [...new Set([...(external?.stateReads ?? []), ...(external?.stateWrites ?? [])]
      .flatMap(effect => effect.receiver?.kind === "parameter" ? [effect.receiver.index] : []))];
  if (!indices.length) return {};
  return {
    receiverBindings: indices.map(parameterIndex => {
      const argument = call.arguments[parameterIndex];
      if (argument?.node.kind === "ThisKeyword") return { parameterIndex, source: "component" as const };
      const argumentVariable = argument?.variable ?? argument?.rootVariable;
      const sourceParameterIndex = argumentVariable ? caller.parameters.findIndex(parameter => parameter.id === argumentVariable.id) : -1;
      return sourceParameterIndex >= 0
        ? { parameterIndex, source: "parameter" as const, sourceParameterIndex }
        : { parameterIndex, source: "unknown" as const };
    })
  };
}

function mapStateEffects(effects: readonly ExactStateEffect[], edge: ExactCallEdgeIR): ExactStateEffect[] {
  return effects.map(effect => {
    if (effect.receiver?.kind !== "parameter") return effect;
    const parameterIndex = effect.receiver.index;
    const binding = edge.receiverBindings?.find(candidate => candidate.parameterIndex === parameterIndex);
    if (binding?.source === "component") return { ...effect, receiver: { kind: "component" } };
    if (binding?.source === "parameter") return { ...effect, receiver: { kind: "parameter", index: binding.sourceParameterIndex! } };
    return { ...effect, path: effect.path || "*", confidence: "unknown", receiver: { kind: "unknown" } };
  });
}

function parameterStateEffect(
  member: NodeRef,
  parameters: readonly Variable[]
): Omit<ExactStateEffect, "kind"> | undefined {
  if (!member.isMember()) return undefined;
  if (member.parent?.isMember() && member.parent.target?.node === member.node) return undefined;
  const parameterIndex = member.rootVariable ? parameters.findIndex(parameter => parameter.id === member.rootVariable!.id) : -1;
  if (parameterIndex < 0) return undefined;
  const segments: string[] = [];
  let current: NodeRef | undefined = member;
  while (current?.isMember()) {
    if (!current.name) return { path: "*", confidence: "unknown", receiver: { kind: "parameter", index: parameterIndex } };
    segments.unshift(current.name);
    current = current.target;
  }
  if (segments[0] !== "state") return undefined;
  segments.shift();
  if (member.parent?.node.kind === "CallExpression" && member.parent.target?.node === member.node && arrayStateMutators.has(segments.at(-1) ?? "")) segments.pop();
  return { path: segments.join(".") || "*", confidence: segments.length ? "exact" : "broad", receiver: { kind: "parameter", index: parameterIndex } };
}

const arrayStateMutators = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "copyWithin", "fill"]);
const intrinsicCollectionMethods = new Set([
  ...arrayStateMutators,
  "concat", "every", "filter", "find", "findIndex", "flat", "flatMap", "forEach", "includes", "indexOf",
  "join", "lastIndexOf", "map", "reduce", "reduceRight", "slice", "some", "toReversed", "toSorted", "toSpliced"
]);

function isCompilerOwnedCollectionCall(
  module: BoundModule,
  call: NodeRef,
  aliases: ReadonlyMap<string, readonly string[]>
): boolean {
  if (!call.target?.isMember() || !intrinsicCollectionMethods.has(call.target.name ?? "")) return false;
  return isCompilerOwnedCollectionReceiver(module, call.target.target, aliases);
}

function isCompilerOwnedCollectionReceiver(
  module: BoundModule,
  receiver: NodeRef | undefined,
  aliases: ReadonlyMap<string, readonly string[]>
): boolean {
  if (!receiver) return false;
  if (expressionStatePath(module, receiver.node, aliases) !== undefined) return true;
  if (receiver.node.kind !== "CallExpression" || !receiver.target?.isMember()
    || !intrinsicCollectionMethods.has(receiver.target.name ?? "")) return false;
  return isCompilerOwnedCollectionReceiver(module, receiver.target.target, aliases);
}

function isStateWrite(member: NodeRef): boolean {
  const parent = member.parent;
  if (!parent) return false;
  if (parent.node.kind === "BinaryExpression" && parent.node.children[0] === member.node && /^(?:=|\+=|-=|\*=|\/=|%=|&&=|\|\|=|\?\?=)$/.test(parent.node.operator ?? "")) return true;
  if (["PrefixUnaryExpression", "PostfixUnaryExpression", "DeleteExpression"].includes(parent.node.kind)) return true;
  return parent.node.kind === "CallExpression" && parent.target?.node === member.node && arrayStateMutators.has(member.name ?? "");
}

function uniqueContextEffects(values: readonly ExactContextEffect[]): ExactContextEffect[] {
  return [...new Map(values.map(value => [`${value.kind}:${value.token}:${value.confidence}`, value])).values()]
    .sort((left, right) => `${left.kind}:${left.token}`.localeCompare(`${right.kind}:${right.token}`));
}

function knownHigherOrderCall(call: NodeRef): boolean {
  const name = call.target?.name;
  return !!name && new Set(["map", "flatMap", "filter", "forEach", "some", "every", "find", "findIndex", "reduce", "reduceRight", "sort", "then", "catch", "finally"]).has(name);
}

function isFunctionNode(reference: NodeRef): boolean {
  return reference.node.kind === "ArrowFunction" || reference.node.kind === "FunctionExpression" || reference.node.kind === "FunctionDeclaration";
}

export function effectFor(sources: readonly ExactEnvironmentEffectSourceIR[]): ExactEnvironmentEffect {
  const environments = new Set(sources.map(candidate => candidate.environment));
  if (environments.has("browser") && environments.has("server")) return "mixed";
  if (environments.has("unknown")) return "unknown";
  if (environments.has("browser")) return "browser";
  if (environments.has("server")) return "server";
  return "neutral";
}

function targetsFor(effect: ExactEnvironmentEffect): ExactArtifactTarget[] {
  if (effect === "browser") return ["client"];
  if (effect === "server") return ["server"];
  if (effect === "neutral") return ["client", "server"];
  return [];
}

function targetsForCallable(callable: MutableCallable): ExactArtifactTarget[] {
  const effect = effectFor(callable.sources);
  if (effect !== "unknown") return targetsFor(effect);
  const browser = callable.sources.some(source => source.environment === "browser");
  const server = callable.sources.some(source => source.environment === "server");
  return browser === server ? [] : browser ? ["client"] : ["server"];
}

function allowedTargetsForCallable(callable: MutableCallable): ExactArtifactTarget[] {
  const effect = effectFor(callable.sources);
  if (effect !== "unknown") return targetsFor(effect);
  const browser = callable.sources.some(source => source.environment === "browser");
  const server = callable.sources.some(source => source.environment === "server");
  if (browser && server) return [];
  if (browser) return ["client"];
  if (server) return ["server"];
  return ["client", "server"];
}

function callableSccOrder(callables: readonly MutableCallable[]): MutableCallable[][] {
  const byId = new Map(callables.map(callable => [callable.id, callable]));
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: MutableCallable[] = [];
  const onStack = new Set<string>();
  const components: MutableCallable[][] = [];
  let nextIndex = 0;
  const visit = (callable: MutableCallable) => {
    indices.set(callable.id, nextIndex);
    lowLinks.set(callable.id, nextIndex++);
    stack.push(callable);
    onStack.add(callable.id);
    const targets = [...new Set(callable.calls.flatMap(edge => edge.targetId && byId.has(edge.targetId) ? [edge.targetId] : []))].sort();
    for (const targetId of targets) {
      const target = byId.get(targetId)!;
      if (!indices.has(targetId)) {
        visit(target);
        lowLinks.set(callable.id, Math.min(lowLinks.get(callable.id)!, lowLinks.get(targetId)!));
      } else if (onStack.has(targetId)) lowLinks.set(callable.id, Math.min(lowLinks.get(callable.id)!, indices.get(targetId)!));
    }
    if (lowLinks.get(callable.id) !== indices.get(callable.id)) return;
    const component: MutableCallable[] = [];
    let member: MutableCallable;
    do {
      member = stack.pop()!;
      onStack.delete(member.id);
      component.push(member);
    } while (member !== callable);
    components.push(component.sort((left, right) => left.id.localeCompare(right.id)));
  };
  for (const callable of [...callables].sort((left, right) => left.id.localeCompare(right.id))) if (!indices.has(callable.id)) visit(callable);

  const componentByCallable = new Map<string, number>();
  components.forEach((component, index) => component.forEach(callable => componentByCallable.set(callable.id, index)));
  const ordered: MutableCallable[][] = [];
  const visited = new Set<number>();
  const order = (index: number) => {
    if (visited.has(index)) return;
    visited.add(index);
    const dependencies = new Set<number>();
    for (const callable of components[index]!) for (const edge of callable.calls) {
      const dependency = edge.targetId ? componentByCallable.get(edge.targetId) : undefined;
      if (dependency !== undefined && dependency !== index) dependencies.add(dependency);
    }
    for (const dependency of [...dependencies].sort((left, right) => left - right)) order(dependency);
    ordered.push(components[index]!);
  };
  for (const index of components.keys()) order(index);
  return ordered;
}

function callableArtifactTargets(callables: readonly MutableCallable[]): Map<string, Set<ExactArtifactTarget>> {
  const result = new Map<string, Set<ExactArtifactTarget>>();
  for (const callable of callables) {
    const effect = effectFor(callable.sources);
    const seeds = new Set<ExactArtifactTarget>(callable.seedTargets);
    if (callable.executable) for (const target of targetsForCallable(callable)) seeds.add(target);
    if (callable.exportNames.length) for (const target of targetsForCallable(callable)) seeds.add(target);
    if (callable.kind === "task") {
      if (effect === "neutral") {
        if (callable.writes.length) {
          seeds.add("client");
          seeds.add("server");
        } else seeds.add("client");
      }
      else for (const target of targetsForCallable(callable)) seeds.add(target);
    }
    result.set(callable.id, seeds);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const caller of callables) for (const edge of caller.calls) {
      if (!edge.targetId) continue;
      const callee = callables.find(candidate => candidate.id === edge.targetId);
      if (!callee) continue;
      const allowed = new Set(allowedTargetsForCallable(callee));
      const targets = result.get(edge.targetId)!;
      for (const target of result.get(caller.id) ?? []) if (allowed.has(target) && !targets.has(target)) {
        targets.add(target);
        changed = true;
      }
    }
  }
  return result;
}

function clientBoundaryFunction(reference: NodeRef): boolean {
  const attribute = reference.ancestors().ofKind("JsxAttribute").first();
  return !!attribute && (attribute.node.name === "ref" || /^on[A-Z]/.test(attribute.node.name ?? ""));
}

function taskOwner(fn: NodeRef): NodeRef | undefined {
  const call = fn.parent?.node.kind === "CallExpression" ? fn.parent : undefined;
  return call && /^this\.task(?:\.(?:client|server))?\s*\(/.test(call.node.text ?? "") ? call : undefined;
}

function declarationVariable(fn: NodeRef): Variable | undefined {
  if (fn.node.kind === "FunctionDeclaration" || fn.node.kind === "MethodDeclaration") {
    return fn.children().where(child => child.node.kind === "Identifier").first()?.variable;
  }
  const declaration = fn.ancestors().ofKind("VariableDeclaration").first();
  return declaration?.children().first()?.variable;
}

function callableName(fn: NodeRef, variable: Variable | undefined): string {
  return variable?.name ?? fn.node.name ?? `<function@${fn.node.span?.start ?? 0}>`;
}

function exportedNamesByVariable(module: BoundModule, graph: ExactSemanticGraphIR): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const add = (variable: Variable | undefined, name: string | undefined) => {
    if (!variable || !name) return;
    const names = result.get(variable.id) ?? [];
    if (!names.includes(name)) names.push(name);
    result.set(variable.id, names);
  };
  const declarations = new Map(graph.declarations.map(declaration => [declaration.id, declaration]));
  for (const reference of module.walk().where(candidate => candidate.node.kind === "Identifier")) {
    const declaration = reference.variable ? declarations.get(reference.variable.id) : undefined;
    if (declaration?.exportedName && !declaration.typeOnly) add(reference.variable, declaration.exportedName);
  }
  for (const specifier of module.walk().ofKind("ExportSpecifier")) {
    if (/\btype\b/.test(specifier.node.text ?? "") || specifier.ancestors().first(ancestor => ancestor.node.kind === "ExportDeclaration")?.node.text?.match(/\bfrom\s*["']/)) continue;
    const identifiers = specifier.children().where(child => child.node.kind === "Identifier").toArray();
    const local = identifiers.length > 1 ? identifiers[0] : identifiers.at(-1);
    add(local?.variable, identifiers.at(-1)?.name);
  }
  for (const names of result.values()) names.sort();
  return result;
}

function nearestFunction(reference: NodeRef): NodeRef | undefined {
  return reference.ancestors().functions().first();
}

function callVariable(call: NodeRef): Variable | undefined {
  const targetVariable = call.target?.variable;
  const rootVariable = call.target?.rootVariable;
  if (rootVariable?.importedFrom && (!targetVariable?.importedFrom || targetVariable === rootVariable)) return rootVariable;
  return targetVariable ?? rootVariable;
}

function unresolvedCallEffect(
  call: NodeRef,
  localVariables: ReadonlySet<Variable>
): "browser" | "server" | "unknown" | undefined {
  const directives = call.node.resolvedSignature?.directives;
  if (hasExactDirective(directives, "client")) return "browser";
  if (hasExactDirective(directives, "server")) return "server";
  const targetText = call.target?.node.text?.trim() ?? "";
  if (/^this\.(?:task(?:\.(?:client|server))?|map|getContext|setContext|prop|ref|reactive)$/.test(targetText)) return undefined;
  const receiver = call.target?.isMember() ? call.target.target : call.target;
  const rootVariable = receiver?.rootVariable ?? receiver?.variable ?? call.target?.rootVariable ?? call.target?.variable;
  const rootName = rootVariable?.name ?? receiver?.name ?? call.target?.name;
  const platform = isUnshadowedPlatformGlobal(rootName, rootVariable, localVariables);
  if (platform) return platform;
  if (rootName && universalCallRoots.has(rootName)) return undefined;
  const receiverType = call.target?.target?.type?.display ?? "";
  if (/\b(?:AbortController|AbortSignal|Array|Headers|Map|Promise|Request|Response|Set|URL|URLSearchParams|WeakMap|WeakSet)\b|\[\](?:\s|$)/.test(receiverType)) return undefined;
  const declaration = call.node.resolvedSignature?.declarationSource?.replace(/\\/g, "/") ?? "";
  if (/\/typescript\/lib\/lib\.(?:dom|webworker)(?:\.[^/]*)?\.d\.ts$/i.test(declaration)) return "browser";
  if (/\/typescript\/lib\/lib\.[^/]+\.d\.ts$/i.test(declaration)) return undefined;
  if (/(?:^|\/)@types\/node\//.test(declaration) || /\/node_modules\/(?:node:)?(?:fs|path|crypto|http|https|net|tls|child_process)\//.test(declaration)) return "server";
  if (/(?:^|\/)(?:@exact|packages)\/hydrate\//.test(declaration)) return "browser";
  if (/(?:^|\/)(?:@exact|packages)\/dom\//.test(declaration) && /^(?:render|unmount|dispose|adoptStatic|adoptComponentRoot|adoptMarkerlessComponentRoot|findComponentDomNode|disposeOwnedSubtree)$/.test(call.target?.name ?? "")) return "browser";
  if (/(?:^|\/)(?:@exact|packages)\/(?:core|dom|reactive|request)(?:\/|$)/.test(declaration)) return undefined;
  return "unknown";
}

const universalCallRoots = new Set([
  "Array", "BigInt", "Boolean", "Date", "Error", "EvalError", "Intl", "JSON", "Map", "Math", "Number", "Object",
  "Promise", "RangeError", "ReferenceError", "Reflect", "RegExp", "Set", "String", "Symbol", "SyntaxError", "TypeError",
  "URIError", "URL", "URLSearchParams", "WeakMap", "WeakSet", "clearInterval", "clearTimeout", "decodeURI",
  "decodeURIComponent", "encodeURI", "encodeURIComponent", "fetch", "isFinite", "isNaN", "parseFloat", "parseInt",
  "console", "peek", "queueMicrotask", "setInterval", "setTimeout", "structuredClone"
]);

function localCallTarget(
  call: NodeRef,
  callables: ReadonlyMap<string, MutableCallable>,
  initializers: ReadonlyMap<string, MutableCallable>,
  nodes: ReadonlyMap<string, MutableCallable>
): MutableCallable | undefined {
  for (const variable of [call.target?.variable, call.target?.rootVariable]) {
    if (!variable) continue;
    const target = callables.get(variable.id) ?? initializers.get(variable.id);
    if (target) return target;
  }
  return call.target ? nodes.get(call.target.node.id) : undefined;
}

function source(environment: "browser" | "server" | "unknown", description: string, owner: string): ExactEnvironmentEffectSourceIR {
  return Object.freeze({ environment, description, path: [owner, description] });
}

function prepend(value: ExactEnvironmentEffectSourceIR, owner: string): ExactEnvironmentEffectSourceIR {
  return Object.freeze({ ...value, path: value.path[0] === owner ? value.path : [owner, ...value.path] });
}

function uniqueSources(values: readonly ExactEnvironmentEffectSourceIR[]): ExactEnvironmentEffectSourceIR[] {
  const shortest = new Map<string, ExactEnvironmentEffectSourceIR>();
  for (const value of values) {
    const key = `${value.environment}:${value.description}`;
    const current = shortest.get(key);
    if (!current || value.path.length < current.path.length || value.path.length === current.path.length && value.path.join(".") < current.path.join(".")) shortest.set(key, value);
  }
  return [...shortest.values()]
    .sort((left, right) => `${left.environment}:${left.description}:${left.path.join(".")}`.localeCompare(`${right.environment}:${right.description}:${right.path.join(".")}`));
}

function sourceSignature(values: readonly ExactEnvironmentEffectSourceIR[]): string {
  return values.map(value => `${value.environment}:${value.description}:${value.path.join(">")}`).join("|");
}

function externalCallableIndex(filename: string, manifests: readonly ExactCompilerManifest[]): Map<string, ExactCallableSummaryIR> {
  const result = new Map<string, ExactCallableSummaryIR>();
  const sourceDir = path.dirname(path.resolve(filename));
  for (const manifest of manifests) for (const callable of manifest.callables ?? []) for (const exportName of callable.exportNames) {
    const relative = relativeSpecifier(sourceDir, manifest.filename);
    result.set(externalKey(relative, exportName), callable);
    result.set(externalKey(manifest.filename, exportName), callable);
  }
  return result;
}

function externalModuleInitializers(filename: string, moduleSpecifier: string, manifests: readonly ExactCompilerManifest[]): ExactCallableSummaryIR[] {
  const sourceDir = path.dirname(path.resolve(filename));
  return manifests
    .filter(manifest => externalKey(relativeSpecifier(sourceDir, manifest.filename), "") === externalKey(moduleSpecifier, ""))
    .flatMap(manifest => manifest.callables.filter(callable => callable.kind === "module-initializer"));
}

function relativeSpecifier(from: string, target: string): string {
  let value = path.relative(from, path.resolve(target)).replace(/\\/g, "/").replace(/\.[cm]?[jt]sx?$/i, "");
  if (!value.startsWith(".")) value = `./${value}`;
  return value;
}

function externalKey(specifier: string, exportName: string): string {
  return `${specifier.replace(/\\/g, "/").replace(/\.[cm]?[jt]sx?$/i, "")}:${exportName}`;
}
