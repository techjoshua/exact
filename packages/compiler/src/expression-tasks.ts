import type { BoundModule, NodeRef, Variable } from "@exact/expressions";
import { analyzeExpressionWrites, writeSiteKey } from "./expression-writes.js";
import { isServerOnlyModule } from "./imports.js";
import type { ExactContextEffect, ExactPlacement, ExactStateEffect } from "./types.js";

export interface ExpressionTaskSite {
  readonly component?: string;
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
}

export interface ExpressionLifecycleListener {
  readonly component: string;
  readonly start: number;
  readonly end: number;
}

export type ExpressionTaskResourceKind = "timeout" | "interval" | "animation-frame" | "fetch" | "observer";
export interface ExpressionTaskResource {
  readonly start: number;
  readonly end: number;
  readonly kind: ExpressionTaskResourceKind;
}

const browserGlobals = new Set(["window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame", "MutationObserver", "ResizeObserver", "IntersectionObserver"]);

/** Builds task effects from canonical references while retaining source spans for emission. */
export function analyzeExpressionTasks(module: BoundModule): ExpressionTaskPlan {
  const sites = new Map<string, ExpressionTaskSite>();
  const resources = new Map<string, ExpressionTaskResource>();
  const lifecycleListeners = new Map<string, ExpressionLifecycleListener>();
  const writes = analyzeExpressionWrites(module);
  const localVariables = new Set(module.writesOf(module.root));
  for (const task of module.walk().calls().where(isTaskCall)) {
    if (!task.node.span) continue;
    const work = task.arguments.at(-1);
    if (!work || !isFunction(work)) continue;
    const aliases = collectStateAliases(module, work);
    const reads: ExactStateEffect[] = [];
    const taskWrites: ExactStateEffect[] = [];
    const contexts: ExactContextEffect[] = [];
    const contextSites: Array<Readonly<{ start: number; effect: ExactContextEffect }>> = [];
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
      const resourceKind = taskResourceKind(call, localVariables);
      if (resourceKind && call.node.span) {
        const resource = Object.freeze({ start: call.node.span.start, end: call.node.span.end, kind: resourceKind });
        resources.set(writeSiteKey(resource.start, resource.end), resource);
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
    if (browserEffects && taskWrites.length) diagnostics.push("task writes component state and references browser-only globals; classify as client and split at this boundary");
    if (!requestedPlacement && !browserEffects && !serverEffects && taskWrites.length) diagnostics.push("task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work");
    if (!browserEffects && !serverEffects && !taskWrites.length) diagnostics.push("task has no detected state writes or environment-specific effects; classify as client lifecycle work");
    if (requestedPlacement === "server" && browserEffects) diagnostics.push("error: this.task.server() cannot reference browser-only globals");
    if (requestedPlacement === "client" && serverEffects) diagnostics.push("error: this.task.client() cannot reference server-only imports");
    if (requestedPlacement) diagnostics.push(`task placement forced by this.task.${requestedPlacement}()`);
    const component = task.ancestors().functions().first(owner => owner.node.kind === "FunctionDeclaration" && /^[A-Z]/.test(owner.node.name ?? ""))?.node.name;
    const site = Object.freeze({
      ...(component ? { component } : {}),
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
    sites.set(writeSiteKey(site.start, site.end), site);
  }
  for (const call of module.walk().calls()) {
    if (!call.node.span || !isGlobalListener(call, localVariables) || insideTask(call) || insideClientJsx(call)) continue;
    const owner = call.ancestors().functions().first();
    if (owner?.node.kind !== "FunctionDeclaration" || !/^[A-Z]/.test(owner.node.name ?? "")) continue;
    const listener = Object.freeze({ component: owner.node.name!, start: call.node.span.start, end: call.node.span.end });
    lifecycleListeners.set(writeSiteKey(listener.start, listener.end), listener);
  }
  return Object.freeze({ sites, resources, lifecycleListeners });
}

function isGlobalListener(call: NodeRef, localVariables: ReadonlySet<Variable>): boolean {
  if (!call.target?.isMember("addEventListener")) return false;
  const receiver = call.target.target;
  const root = receiver?.rootVariable;
  const name = root?.name ?? receiver?.name ?? receiver?.node.text;
  return !!name && ["window", "document", "globalThis"].includes(name) && (!root || !localVariables.has(root));
}

function insideTask(reference: NodeRef): boolean {
  return reference.ancestors().calls().any(isTaskCall);
}

function insideClientJsx(reference: NodeRef): boolean {
  return reference.ancestors().ofKind("JsxAttribute").any(attribute => /^(?:on[A-Z]|ref)\b/.test(attribute.node.name ?? attribute.node.text ?? ""));
}

function taskResourceKind(call: NodeRef, localVariables: ReadonlySet<Variable>): ExpressionTaskResourceKind | undefined {
  const target = call.target;
  const name = target?.name ?? target?.node.text?.trim();
  const variable = target?.rootVariable ?? target?.variable;
  if (variable && localVariables.has(variable)) return undefined;
  if (call.node.kind === "NewExpression" && ["MutationObserver", "ResizeObserver", "IntersectionObserver"].includes(name ?? "")) return "observer";
  if (name === "setTimeout") return "timeout";
  if (name === "setInterval") return "interval";
  if (name === "requestAnimationFrame") return "animation-frame";
  if (name === "fetch") return "fetch";
  return undefined;
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
    if (pattern.variable) aliases.set(pattern.variable.id, base);
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
    const left = assignment.node.children[0]?.span;
    const span = reference.node.span;
    if (left && span && span.start >= left.start && span.end <= left.end) return true;
  }
  return false;
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

function isTaskCall(call: NodeRef): boolean {
  return /^this\.task(?:\.(?:client|server))?\s*\(/.test(call.node.text ?? "");
}

function isFunction(reference: NodeRef): boolean {
  return reference.node.kind === "ArrowFunction" || reference.node.kind === "FunctionExpression";
}
