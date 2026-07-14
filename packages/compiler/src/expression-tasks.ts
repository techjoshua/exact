import type { BoundModule, NodeRef, Variable } from "@exact/expressions";
import { analyzeExpressionWrites } from "./expression-writes.js";
import { isServerOnlyModule } from "./imports.js";
import type { ExactContextEffect, ExactPlacement, ExactStateEffect } from "./types.js";
import { expressionComponentIndex } from "./expression-component-index.js";
import { exactCleanupForCall, exactOwnsReturn } from "./annotations.js";

export interface ExpressionTaskSite {
  readonly nodeId: string;
  readonly component?: string;
  readonly componentId?: string;
  readonly start: number;
  readonly end: number;
  readonly requestedPlacement?: "client" | "server";
  readonly placement: ExactPlacement;
  readonly async: boolean;
  readonly browserEffects: boolean;
  readonly serverEffects: boolean;
  readonly reads: readonly ExactStateEffect[];
  readonly writes: readonly ExactStateEffect[];
  readonly contexts: readonly ExactContextEffect[];
  readonly contextSites: readonly Readonly<{ start: number; effect: ExactContextEffect }>[];
  readonly diagnostics: readonly string[];
}

export interface ExpressionTaskPlan {
  readonly sites: ReadonlyMap<string, ExpressionTaskSite>;
  readonly resources: ReadonlyMap<string, ExpressionTaskResource>;
  readonly lifecycleListeners: ReadonlyMap<string, ExpressionLifecycleListener>;
  readonly setupTasks: ReadonlyMap<string, ExpressionSetupTask>;
  readonly signalCalls: ReadonlyMap<string, ExpressionTaskSignalCall>;
  readonly diagnostics: readonly string[];
  readonly diagnosticLocations: readonly Readonly<{ message: string; start: number }>[];
}

export interface ExpressionLifecycleListener {
  readonly nodeId: string;
  readonly component: string;
  readonly start: number;
  readonly end: number;
}

/** A direct component-setup expression whose lifetime is compiler-owned. */
export interface ExpressionSetupTask {
  readonly nodeId: string;
  readonly component: string;
  readonly start: number;
  readonly end: number;
}

export type ExpressionTaskResourceKind = "timeout" | "interval" | "animation-frame" | "idle-callback" | "fetch" | "observer" | "owned";
export type ExpressionTaskResourceDisposal = string;
export interface ExpressionTaskResource {
  readonly nodeId: string;
  readonly start: number;
  readonly end: number;
  readonly kind: ExpressionTaskResourceKind;
  readonly disposal?: ExpressionTaskResourceDisposal;
  readonly description?: string;
}

export interface ExpressionTaskSignalCall {
  readonly nodeId: string;
  readonly start: number;
  readonly end: number;
  readonly parameter: number;
  readonly mode: "direct" | "options";
  readonly eventOptions?: boolean;
}

const browserGlobals = new Set(["window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "MutationObserver", "ResizeObserver", "IntersectionObserver", "WebSocket", "EventSource", "BroadcastChannel", "Worker"]);

/** Builds task effects from canonical references while retaining source spans for emission. */
export function analyzeExpressionTasks(module: BoundModule): ExpressionTaskPlan {
  const components = expressionComponentIndex(module);
  const sites = new Map<string, ExpressionTaskSite>();
  const resources = new Map<string, ExpressionTaskResource>();
  const lifecycleListeners = new Map<string, ExpressionLifecycleListener>();
  const setupTasks = new Map<string, ExpressionSetupTask>();
  const signalCalls = new Map<string, ExpressionTaskSignalCall>();
  const planDiagnostics: string[] = [];
  const diagnosticLocations: Array<Readonly<{ message: string; start: number }>> = [];
  const writes = analyzeExpressionWrites(module);
  const localVariables = moduleLocalVariables(module);
  for (const task of module.walk().calls().where(call => isTaskCall(call, components))) {
    if (!task.node.span) continue;
    const work = task.arguments.at(-1);
    if (!work || !isFunction(work)) continue;
    const aliases = collectStateAliases(module, work);
    const reads: ExactStateEffect[] = [];
    const taskWrites: ExactStateEffect[] = [];
    const contexts: ExactContextEffect[] = [];
    const contextSites: Array<Readonly<{ start: number; effect: ExactContextEffect }>> = [];
    const resourceDiagnostics: string[] = [];
    let browserEffects = false;
    let serverEffects = false;

    for (const reference of work.walk({ types: false })) {
      const variable = reference.variable;
      const name = variable?.name ?? reference.name;
      if (reference.node.kind === "Identifier" && name && browserGlobals.has(name) && (!variable || !localVariables.has(variable))) browserEffects = true;
      if (reference.node.kind === "Identifier" && variable?.importedFrom && isServerOnlyModule(variable.importedFrom)) serverEffects = true;
      if (reference.isMember()) {
        const callTarget = reference.parent?.node.kind === "CallExpression" && "target" in reference.parent.node && reference.parent.node.target === reference.node;
        const path = statePath(module, callTarget && reference.target ? reference.target : reference, aliases);
        if (path && !insideAssignmentTarget(reference)) reads.push(effect(path.join("."), "read"));
      }
    }
    for (const site of writes.sites.values()) {
      if (site.start >= work.node.span!.start && site.end <= work.node.span!.end) taskWrites.push(effect(site.path.join("."), "write", site.operation === "array-mutation"));
    }
    for (const call of work.walk().calls()) {
      const resource = taskResource(call, localVariables);
      if (resource && call.node.span) {
        const ownership = resource.kind === "owned" ? taskResourceOwnership(module, work, call, resource) : "owned";
        if (ownership === "owned") {
          const site = Object.freeze({ nodeId: call.node.id, start: call.node.span.start, end: call.node.span.end, ...resource });
          resources.set(site.nodeId, site);
        } else if (ownership === "escape") {
          resourceDiagnostics.push(`error: task-owned ${resource.description ?? "resource"} escapes its task generation; return an explicit cleanup or keep the resource local`);
        }
      }
      const signalCall = taskSignalCall(call, localVariables);
      if (signalCall && call.node.span) {
        const site = Object.freeze({ nodeId: call.node.id, start: call.node.span.start, end: call.node.span.end, ...signalCall });
        signalCalls.set(site.nodeId, site);
      }
      if (!call.target?.isMember() || !/^this\.(?:getContext|setContext)$/.test(call.target.node.text ?? "")) continue;
      const token = call.arguments[0];
      const exactToken = token && /^(?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/.test(token.node.text ?? "");
      const effect = Object.freeze({
        token: exactToken ? token!.node.text! : "unknown",
        kind: call.target.name === "getContext" ? "read" : "write",
        confidence: exactToken ? "exact" : "unknown"
      } satisfies ExactContextEffect);
      contexts.push(effect);
      contextSites.push(Object.freeze({ start: call.node.span?.start ?? task.node.span.start, effect }));
      continue;
    }
    for (const call of work.walk().calls()) {
      if (!call.target?.isMember("assign") || call.target.target?.node.text !== "Object") continue;
      const object = call.target.target.rootVariable;
      if (object && localVariables.has(object)) continue;
      const target = call.arguments[0];
      const path = target ? statePath(module, target, aliases) : undefined;
      if (path) taskWrites.push(effect(path.length ? path.join(".") : "*", "write", true));
    }
    const requestedPlacement = task.target?.name === "client" || task.target?.name === "server" ? task.target.name : undefined;
    const placement: ExactPlacement = requestedPlacement ?? (browserEffects ? "client" : serverEffects ? "server" : taskWrites.length ? "isomorphic" : "client");
    const diagnostics: string[] = [];
    const nearestFunction = task.ancestors().functions().first();
    const componentOwner = taskComponentOwner(task, components);
    if (componentOwner && nearestFunction?.node !== componentOwner.node) {
      diagnostics.push("error: this.task() must be registered directly during component setup, not inside render functions or callbacks");
    }
    if (browserEffects && taskWrites.length) diagnostics.push("task writes component state and references browser-only globals; classify as client and split at this boundary");
    if (!requestedPlacement && !browserEffects && !serverEffects && taskWrites.length) diagnostics.push("task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work");
    if (!browserEffects && !serverEffects && !taskWrites.length) diagnostics.push("task has no detected state writes or environment-specific effects; classify as client lifecycle work");
    if (requestedPlacement === "server" && browserEffects) diagnostics.push("error: this.task.server() cannot reference browser-only globals");
    if (requestedPlacement === "client" && serverEffects) diagnostics.push("error: this.task.client() cannot reference server-only imports");
    if (requestedPlacement) diagnostics.push(`task placement forced by this.task.${requestedPlacement}()`);
    diagnostics.push(...resourceDiagnostics);
    // The plan-level channel is consumed before emission and must include every
    // fatal site diagnostic. Informational placement notes remain site-local.
    for (const diagnostic of diagnostics) if (diagnostic.startsWith("error:")) {
      planDiagnostics.push(diagnostic);
      diagnosticLocations.push(Object.freeze({ message: diagnostic, start: task.node.span.start }));
    }
    const component = componentOwner?.node.name;
    const site = Object.freeze({
      nodeId: task.node.id,
      ...(component ? { component } : {}),
      ...(componentOwner ? { componentId: componentOwner.node.id } : {}),
      start: task.node.span.start,
      end: task.node.span.end,
      ...(requestedPlacement ? { requestedPlacement } : {}),
      placement,
      async: /^\s*async\b/.test(work.node.text ?? ""),
      browserEffects,
      serverEffects,
      reads: Object.freeze(uniqueEffects(reads)),
      writes: Object.freeze(uniqueEffects(taskWrites)),
      contexts: Object.freeze(uniqueContexts(contexts)),
      contextSites: Object.freeze(contextSites),
      diagnostics: Object.freeze(diagnostics)
    });
    sites.set(site.nodeId, site);
  }
  for (const call of module.walk().calls()) {
    if (!call.node.span || insideTask(call) || insideClientJsx(call)) continue;
    const owner = components.owner(call);
    if (!owner || call.ancestors().functions().first()?.node !== owner.node) continue;
    const listenerCall = isOwnedListener(call, localVariables);
    const resource = taskResource(call, localVariables);
    const signalCall = taskSignalCall(call, localVariables);
    let ownResource = false;
    if (resource) {
      const ownership = resource.kind === "owned" ? taskResourceOwnership(module, owner, call, resource) : "owned";
      if (ownership === "owned") {
        ownResource = true;
        const site = Object.freeze({ nodeId: call.node.id, start: call.node.span.start, end: call.node.span.end, ...resource });
        resources.set(site.nodeId, site);
      } else if (ownership === "escape") {
        const message = `error: setup-created ${resource.description ?? resource.kind} escapes component lifecycle ownership; move its creation into this.task.client() or dispose it explicitly`;
        planDiagnostics.push(message);
        diagnosticLocations.push(Object.freeze({ message, start: call.node.span.start }));
      }
    }
    if (signalCall) {
      const site = Object.freeze({ nodeId: call.node.id, start: call.node.span.start, end: call.node.span.end, ...signalCall });
      signalCalls.set(site.nodeId, site);
    }
    if (!listenerCall && !ownResource && !signalCall) continue;
    const expression = directSetupExpression(call);
    if (!expression?.node.span) {
      const message = `error: setup-created ${resource?.description ?? resource?.kind ?? "cancellable operation"} cannot be owned without changing its expression result; move it into this.task.client()`;
      planDiagnostics.push(message);
      diagnosticLocations.push(Object.freeze({ message, start: call.node.span.start }));
      continue;
    }
    const setup = Object.freeze({ nodeId: expression.node.id, component: owner.node.name!, start: expression.node.span.start, end: expression.node.span.end });
    setupTasks.set(setup.nodeId, setup);
    if (listenerCall) {
      const listener = Object.freeze({ nodeId: call.node.id, component: owner.node.name!, start: call.node.span.start, end: call.node.span.end });
      lifecycleListeners.set(listener.nodeId, listener);
    }
  }
  return Object.freeze({
    sites, resources, lifecycleListeners, setupTasks, signalCalls,
    diagnostics: Object.freeze(planDiagnostics),
    diagnosticLocations: Object.freeze(diagnosticLocations)
  });
}

function moduleLocalVariables(module: BoundModule): Set<Variable> {
  return new Set(module.walk().references()
    .toArray()
    .map(reference => reference.variable)
    // Scope objects for declarations from lib.d.ts are projected into the
    // current module's scope graph so that references remain navigable.  The
    // canonical declaration identity, unlike that projected scope, retains the
    // declaration's real source file and is therefore the reliable locality
    // test.
    .filter((variable): variable is Variable => !!variable && variable.id.startsWith(`${module.filename}:`)));
}

function isOwnedListener(call: NodeRef, localVariables: ReadonlySet<Variable>): boolean {
  if (!call.target?.isMember("addEventListener")) return false;
  const receiver = call.target.target;
  const root = receiver?.rootVariable;
  const name = root?.name ?? receiver?.name ?? receiver?.node.text;
  if (!!name && ["window", "document", "globalThis"].includes(name) && (!root || !localVariables.has(root))) return true;
  // EventTarget-compatible APIs expose an options parameter containing signal.
  return taskSignalCall(call, localVariables)?.mode === "options";
}

function directSetupExpression(call: NodeRef): NodeRef | undefined {
  const statement = call.ancestors().ofKind("ExpressionStatement").first();
  if (!statement) return undefined;
  // Only own a whole direct setup expression. Calls nested in callbacks have a
  // nearer function owner and never reach this point; initializers deliberately
  // remain explicit because replacing their value with a task handle is invalid.
  return statement.children().first();
}

function insideTask(reference: NodeRef): boolean {
  return reference.ancestors().calls().any(isTaskCall);
}

function insideClientJsx(reference: NodeRef): boolean {
  return reference.ancestors().ofKind("JsxAttribute").any(attribute => /^(?:on[A-Z]|ref)\b/.test(attribute.node.name ?? attribute.node.text ?? ""));
}

function taskResource(
  call: NodeRef,
  localVariables: ReadonlySet<Variable>
): Readonly<{ kind: ExpressionTaskResourceKind; disposal?: ExpressionTaskResourceDisposal; description?: string }> | undefined {
  const target = call.target;
  const name = target?.name ?? target?.node.text?.trim();
  const variable = target?.rootVariable ?? target?.variable;
  if (variable && localVariables.has(variable) && [
    "MutationObserver", "ResizeObserver", "IntersectionObserver", "WebSocket", "EventSource", "BroadcastChannel", "Worker",
    "setTimeout", "setInterval", "requestAnimationFrame", "requestIdleCallback", "fetch"
  ].includes(name ?? "")) return undefined;
  if (call.node.kind === "NewExpression" && ["MutationObserver", "ResizeObserver", "IntersectionObserver"].includes(name ?? "")) return { kind: "observer" };
  if (call.node.kind === "NewExpression" && ["WebSocket", "EventSource", "BroadcastChannel"].includes(name ?? "")) return { kind: "owned", disposal: "close", description: name };
  if (call.node.kind === "NewExpression" && name === "Worker") return { kind: "owned", disposal: "terminate", description: name };
  if (name === "setTimeout") return { kind: "timeout" };
  if (name === "setInterval") return { kind: "interval" };
  if (name === "requestAnimationFrame") return { kind: "animation-frame" };
  if (name === "requestIdleCallback") return { kind: "idle-callback" };
  if (name === "fetch") return { kind: "fetch" };
  if (call.target?.isMember("subscribe")) {
    const disposal = disposalForSubscription(call.type);
    if (disposal) return { kind: "owned", disposal, description: "subscription" };
  }
  const annotatedCleanup = exactCleanupForCall(call);
  if (annotatedCleanup) return { kind: "owned", disposal: annotatedCleanup, description: call.type?.display ?? "annotated resource" };
  if (exactOwnsReturn(call) && call.type?.callable) return { kind: "owned", disposal: "call", description: "owned cleanup function" };
  if (isDisposableType(call.type)) return { kind: "owned", description: call.type?.display ?? "disposable resource" };
  return undefined;
}

function taskSignalCall(
  call: NodeRef,
  localVariables: ReadonlySet<Variable>
): Readonly<{ parameter: number; mode: "direct" | "options"; eventOptions?: boolean }> | undefined {
  if (isTaskCall(call)) return undefined;
  if (isKnownGlobalListener(call, localVariables)) return { parameter: 2, mode: "options", eventOptions: true };
  const target = call.target;
  const variable = target?.rootVariable ?? target?.variable;
  const name = target?.name ?? target?.node.text?.trim();
  const signatures = call.node.resolvedSignature ? [call.node.resolvedSignature] : target?.type?.callSignatures ?? [];
  for (const signature of signatures) {
    for (let index = 0; index < signature.parameters.length; index++) {
      const parameter = signature.parameters[index]!;
      const mode = acceptsAbortSignal(parameter.type) ? "direct" : hasAbortSignalOption(parameter.type) ? "options" : undefined;
      if (!mode || parameter.rest || index >= call.arguments.length && !parameter.optional) continue;
      if (signature.parameters.slice(call.arguments.length, index).some(candidate => !candidate.optional)) continue;
      return { parameter: index, mode };
    }
  }
  // Some lightweight projects omit DOM overloads. Preserve canonical fetch cancellation.
  if (name === "fetch" && (!variable || !localVariables.has(variable))) return { parameter: 1, mode: "options" };
  return undefined;
}

function isKnownGlobalListener(call: NodeRef, localVariables: ReadonlySet<Variable>): boolean {
  if (!call.target?.isMember("addEventListener")) return false;
  const receiver = call.target.target;
  const root = receiver?.rootVariable;
  const name = root?.name ?? receiver?.name ?? receiver?.node.text;
  return !!name && ["window", "document", "globalThis"].includes(name) && (!root || !localVariables.has(root));
}

function acceptsAbortSignal(type: NonNullable<NodeRef["type"]>): boolean {
  if (type.unionMembers.length) return type.unionMembers.some(member => acceptsAbortSignal(member));
  return /(?:^|\W)AbortSignal(?:$|\W)/.test(type.display) && !type.properties.includes("signal");
}

function hasAbortSignalOption(type: NonNullable<NodeRef["type"]>): boolean {
  const signal = type.propertyTypes.find(property => property.name === "signal");
  if (signal && acceptsAbortSignal(signal.type)) return true;
  return type.unionMembers.some(member => hasAbortSignalOption(member));
}

function disposalForSubscription(type: NodeRef["type"]): ExpressionTaskResourceDisposal | undefined {
  if (!type) return undefined;
  if (type.callable) return "call";
  if (type.properties.includes("unsubscribe")) return "unsubscribe";
  if (type.properties.includes("dispose")) return "dispose";
  return type.unionMembers.map(disposalForSubscription).find((value): value is ExpressionTaskResourceDisposal => !!value);
}

function isDisposableType(type: NodeRef["type"]): boolean {
  if (!type) return false;
  return /\b(?:Async)?Disposable\b/.test(type.display)
    || type.properties.some(property => /(?:async)?dispose/i.test(property))
    || type.unionMembers.some(isDisposableType);
}

function taskResourceOwnership(
  module: BoundModule,
  work: NodeRef,
  call: NodeRef,
  resource: Readonly<{ disposal?: ExpressionTaskResourceDisposal }>
): "owned" | "explicit" | "escape" {
  const declaration = call.ancestors().ofKind("VariableDeclaration").first();
  const variable = declaration?.children().first()?.walk().references().first()?.variable;
  if (!declaration || !variable) return resourceEscapesDirectly(call) ? "escape" : "owned";
  let explicit = false;
  for (const reference of work.walk().references().where(candidate => candidate.variable === variable)) {
    if (isWithin(reference, declaration)) continue;
    const member = reference.parent?.isMember() ? reference.parent : undefined;
    if (member?.target?.node === reference.node) {
      const method = member.name ?? "";
      if ([resource.disposal, "close", "terminate", "unsubscribe", "dispose", "cancel"].includes(method as ExpressionTaskResourceDisposal)) {
        if (member.parent?.node.kind === "CallExpression") explicit = true;
      }
      continue;
    }
    const parent = reference.parent;
    if (parent?.node.kind === "CallExpression" && parent.target?.node === reference.node && resource.disposal === "call") {
      explicit = true;
      continue;
    }
    if (ancestorWithin(reference, work, ancestor => ancestor.node.kind === "ReturnStatement")) {
      if (resource.disposal === "call") { explicit = true; continue; }
      return "escape";
    }
    if (ancestorWithin(reference, work, ancestor => ancestor.node.kind === "CallExpression" || ancestor.node.kind === "NewExpression")
      || ancestorWithin(reference, work, ancestor => ancestor.node.kind === "BinaryExpression" && ancestor.node.operator === "=")
      || ancestorWithin(reference, work, ancestor => ancestor.node.kind === "PropertyAssignment" || ancestor.node.kind === "ArrayLiteralExpression")) return "escape";
  }
  void module;
  return explicit ? "explicit" : "owned";
}

function ancestorWithin(reference: NodeRef, owner: NodeRef, predicate: (ancestor: NodeRef) => boolean): NodeRef | undefined {
  for (const ancestor of reference.ancestors()) {
    if (ancestor.node === owner.node) break;
    if (predicate(ancestor)) return ancestor;
  }
  return undefined;
}

function resourceEscapesDirectly(call: NodeRef): boolean {
  const parent = call.parent;
  if (!parent) return true;
  if (parent.isMember() && parent.target?.node === call.node) return false;
  return !["ExpressionStatement", "AwaitExpression"].includes(parent.node.kind);
}

function collectStateAliases(module: BoundModule, work: NodeRef): ReadonlyMap<string, readonly string[]> {
  const aliases = new Map<string, readonly string[]>();
  for (const declaration of work.walk().ofKind("VariableDeclaration")) {
    const children = declaration.children().toArray();
    const initializer = children.at(-1);
    const path = initializer ? statePath(module, initializer, aliases) : undefined;
    if (!path) continue;
    if (children[0]) bindPattern(children[0], path, aliases);
  }
  return aliases;
}

function bindPattern(pattern: NodeRef, base: readonly string[], aliases: Map<string, readonly string[]>): void {
  if (pattern.node.kind === "Identifier") {
    if (pattern.variable && !pattern.variable.mutable) aliases.set(pattern.variable.id, base);
    return;
  }
  const bindings = pattern.node.kind === "BindingElement" ? [pattern] : pattern.children().where(child => child.node.kind === "BindingElement").toArray();
  bindings.forEach((binding, index) => {
    const children = binding.children().toArray();
    const name = [...children].reverse().find(child => child.node.kind === "Identifier" || child.node.kind === "ObjectBindingPattern" || child.node.kind === "ArrayBindingPattern");
    if (!name) return;
    const identifiers = children.filter(child => child.node.kind === "Identifier");
    const segment = pattern.node.kind === "ArrayBindingPattern" ? String(index) : identifiers.length > 1 ? identifiers[0]!.name : name.name;
    bindPattern(name, [...base, segment ?? "*"], aliases);
  });
}

function statePath(module: BoundModule, reference: NodeRef, aliases: ReadonlyMap<string, readonly string[]>): readonly string[] | undefined {
  const text = reference.node.text?.trim();
  if (!text) return undefined;
  const direct = parsePath(text, "this.state");
  if (direct) return direct;
  const root = reference.walk().references().first()?.variable;
  const base = root ? aliases.get(root.id) : undefined;
  if (!base || !root) return undefined;
  const suffix = parsePath(text, root.name);
  return suffix ? [...base, ...suffix] : undefined;
}

function parsePath(text: string, root: string): readonly string[] | undefined {
  if (text === root) return [];
  if (!text.startsWith(root)) return undefined;
  const suffix = text.slice(root.length);
  const segments: string[] = [];
  const pattern = /\.([A-Za-z_$][\w$]*)|\[\s*(?:(["'])(.*?)\2|(\d+)|[^\]]+)\s*\]/g;
  let end = 0;
  for (const match of suffix.matchAll(pattern)) {
    if (match.index !== end) return undefined;
    segments.push(match[1] ?? match[3] ?? match[4] ?? "*");
    end = match.index + match[0].length;
  }
  return end === suffix.length ? segments : undefined;
}

function insideAssignmentTarget(reference: NodeRef): boolean {
  for (const assignment of reference.ancestors().assignments()) {
    const left = assignment.children().first();
    if (left && isWithin(reference, left)) return true;
  }
  return false;
}

function isWithin(reference: NodeRef, owner: NodeRef): boolean {
  return reference.node === owner.node || reference.ancestors().any(ancestor => ancestor.node === owner.node);
}

function effect(path: string, kind: "read" | "write", broad = false): ExactStateEffect {
  return Object.freeze({ path, kind, confidence: broad || path.includes("*") ? "broad" : "exact" });
}

function uniqueEffects(effects: readonly ExactStateEffect[]): ExactStateEffect[] {
  return [...new Map(effects.filter(value => value.path).map(value => [`${value.kind}:${value.path}`, value])).values()];
}

function uniqueContexts(effects: readonly ExactContextEffect[]): ExactContextEffect[] {
  return [...new Map(effects.map(value => [`${value.kind}:${value.token}`, value])).values()];
}

function isTaskCall(call: NodeRef, components?: ReturnType<typeof expressionComponentIndex>): boolean {
  const target = call.target;
  const taskTarget = target?.isMember("client") || target?.isMember("server") ? target.target : target;
  if (!taskTarget?.isMember("task")) return false;
  if (!components) return true;
  return components.ownsReceiver(components.owner(call), taskTarget.rootVariable);
}

function taskComponentOwner(task: NodeRef, components: ReturnType<typeof expressionComponentIndex>): NodeRef | undefined {
  const receiver = task.target?.rootVariable;
  const owner = components.owner(task);
  return components.ownsReceiver(owner, receiver) ? owner : undefined;
}

function isFunction(reference: NodeRef): boolean {
  return reference.node.kind === "ArrowFunction" || reference.node.kind === "FunctionExpression";
}
