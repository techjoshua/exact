import type { BoundModule, NodeRef, Variable } from "@exact/expressions";
import type { ExpressionJsxPlan } from "./expression-jsx.js";
import type { ExpressionTaskPlan } from "./expression-tasks.js";
import { isServerOnlyModule } from "./imports.js";
import { stableId } from "./ids.js";
import type { ExactBoundaryIR, ExactComponentIR, ExactComponentRenderEdgeIR, ExactContextEffect, ExactImportedComponentIR, ExactTaskIR } from "./types.js";
import { serverSlotBoundaryId } from "./names.js";

export interface ExpressionRenderSite {
  readonly tag: string;
  readonly start: number;
  readonly end: number;
  readonly path: string;
  readonly serverSlotChildren: boolean;
}

export interface ExpressionComponentSite {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly clientEffects: boolean;
  readonly serverEffects: boolean;
  readonly clientIslandCount: number;
  readonly splitBoundaries: readonly string[];
  readonly diagnostics: readonly string[];
  readonly browserGlobalsOutsideClientBoundary: readonly string[];
  readonly contexts: readonly ExactContextEffect[];
  readonly contextSites: readonly Readonly<{ start: number; effect: ExactContextEffect }>[];
  readonly renders: readonly ExpressionRenderSite[];
}

export interface ExpressionComponentPlan {
  readonly sites: ReadonlyMap<string, ExpressionComponentSite>;
}

/** Materializes component and task manifest IR without consulting TypeScript syntax nodes. */
export function createExpressionComponents(
  filename: string,
  plan: ExpressionComponentPlan,
  tasks: ExpressionTaskPlan,
  safety: ReadonlyMap<string, readonly string[]>
): ExactComponentIR[] {
  return [...plan.sites.values()].sort((left, right) => left.start - right.start).map(site => {
    const componentTasks = [...tasks.sites.values()]
      .filter(task => task.component === site.name && task.start >= site.start && task.end <= site.end)
      .sort((left, right) => left.start - right.start)
      .map((task, index): ExactTaskIR => ({
        id: stableId(filename, `${site.name}:task:${index}`),
        placement: task.placement,
        requestedPlacement: task.requestedPlacement,
        async: task.async,
        browserEffects: task.browserEffects,
        reads: [...task.reads],
        writes: [...task.writes],
        contexts: [...task.contexts],
        diagnostics: [...task.diagnostics]
      }));
    const hasServerEffect = site.serverEffects;
    const diagnostics = new Set<string>([...(safety.get(site.name) ?? []), ...site.diagnostics]);
    for (const task of componentTasks) for (const diagnostic of task.diagnostics) diagnostics.add(diagnostic);
    if (hasServerEffect) for (const global of site.browserGlobalsOutsideClientBoundary) {
      diagnostics.add(`error: browser-only global ${global} cannot be used in server-rendered component code; move it into a client island or client task`);
    }
    const placement = site.clientEffects && site.serverEffects ? "isomorphic" : site.serverEffects ? "server" : site.clientEffects ? "client" : "server";
    return {
      id: stableId(filename, site.name),
      name: site.name,
      exported: false,
      placement,
      subgraphPlacement: placement,
      renderEdges: [],
      clientIslandCount: site.clientIslandCount,
      tasks: componentTasks,
      contexts: uniqueContexts([
        ...site.contextSites,
        ...[...tasks.sites.values()].filter(task => task.component === site.name).flatMap(task => task.contextSites)
      ].sort((left, right) => left.start - right.start).map(entry => entry.effect)),
      splitBoundaries: [...site.splitBoundaries],
      diagnostics: [...diagnostics]
    };
  });
}

const browserGlobals = new Set(["window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame", "MutationObserver", "ResizeObserver", "IntersectionObserver"]);

/** Classifies component placement effects from canonical bindings and typed JSX. */
export function analyzeExpressionComponents(module: BoundModule, jsx: ExpressionJsxPlan, tasks: ExpressionTaskPlan): ExpressionComponentPlan {
  const components = module.walk().functions()
    .where(reference => reference.node.kind === "FunctionDeclaration" && !!reference.node.span && /^[A-Z]/.test(reference.node.name ?? ""))
    .toArray();
  const componentNodes = new Set(components.map(component => component.node));
  const localVariables = new Set(module.writesOf(module.root));
  const sites = new Map<string, ExpressionComponentSite>();

  for (const component of components) {
    const splitBoundaries = new Set<string>();
    const outsideGlobals = new Set<string>();
    const contexts: ExactContextEffect[] = [];
    const contextSites: Array<Readonly<{ start: number; effect: ExactContextEffect }>> = [];
    const renders: ExpressionRenderSite[] = [];
    const diagnostics = new Set<string>();
    let clientIslandCount = 0;
    let clientEffects = false;
    let serverEffects = false;

    for (const element of jsx.elements.values()) {
      if (!inside(element.start, element.end, component) || !ownedByComponent(module, element.start, component, componentNodes)) continue;
      for (const attribute of element.attributes) {
        if (!/^on[A-Z]/.test(attribute) && attribute !== "ref") continue;
        clientEffects = true;
        splitBoundaries.add(attribute === "ref" ? "ref" : "event-handler");
      }
      const isClientIsland = element.attributes.some(isClientIslandAttribute);
      if (isClientIsland) {
        const reference = module.walk().jsxElements().first(candidate => candidate.node.span?.start === element.start);
        const nestedInIsland = reference?.ancestors().jsxElements().any(ancestor =>
          ancestor.node.attributes.some(attribute => isClientIslandAttribute(attribute.name ?? "")));
        if (!nestedInIsland) clientIslandCount++;
      }
      if (!element.intrinsic && element.tagName) {
        const reference = module.walk().jsxElements().first(candidate => candidate.node.span?.start === element.start);
        const tagBinding = reference?.descendants().references().first(candidate =>
          candidate.name === element.tagName?.split(".")[0]
          && candidate.ancestors().any(ancestor => ancestor.node.kind === "JsxOpeningElement" || ancestor.node.kind === "JsxSelfClosingElement"));
        const rootTag = element.tagName.split(".")[0]!;
        if (tagBinding?.variable?.typeOnly) {
          diagnostics.add(`error: JSX tag ${rootTag} resolves to a type-only import and cannot be rendered at runtime`);
        } else if (!tagBinding?.variable) {
          diagnostics.add(`error: JSX tag ${rootTag} is not defined as a runtime component`);
        } else if (!["ImportSpecifier", "ImportClause", "NamespaceImport", "FunctionDeclaration"].includes(tagBinding.variable.declarationKind)) {
          diagnostics.add(`error: JSX tag ${rootTag} resolves to ${declarationDescription(tagBinding.variable.declarationKind)}, not a runtime component`);
        }
        const canReferenceComponent = !!tagBinding?.variable && ["ImportSpecifier", "ImportClause", "NamespaceImport", "FunctionDeclaration"].includes(tagBinding.variable.declarationKind);
        if (reference && canReferenceComponent && !reference.ancestors().functions().any(fn => fn.node !== component.node && fn.node.kind !== "ArrowFunction")) {
          renders.push(Object.freeze({ tag: element.tagName, start: element.start, end: element.end, path: nodePath(reference, component), serverSlotChildren: element.serverSlotChildren }));
        }
      }
    }

    for (const reference of component.descendants({ types: false }).where(candidate => candidate.node.kind === "Identifier" || candidate.node.kind === "ThisKeyword")) {
      if (nearestComponent(reference, componentNodes)?.node !== component.node) continue;
      const variable = reference.variable;
      const name = variable?.name ?? reference.name;
      if (name && browserGlobals.has(name) && (!variable || !localVariables.has(variable))) {
        clientEffects = true;
        splitBoundaries.add(`browser:${name}`);
        if (!insideTask(reference) && !insideClientIsland(reference)) outsideGlobals.add(name);
      }
      if (variable?.importedFrom && isServerOnlyModule(variable.importedFrom)) {
        serverEffects = true;
        splitBoundaries.add(`server-import:${variable.name}`);
        if (insideClientIslandOpening(reference)) diagnostics.add("error: client island cannot reference server-only imports");
      }
    }

    for (const task of tasks.sites.values()) {
      if (!inside(task.start, task.end, component)) continue;
      if (task.placement === "client" || task.placement === "isomorphic") clientEffects = true;
      if (task.placement === "server" || task.placement === "isomorphic") serverEffects = true;
    }

    for (const call of component.descendants({ types: false }).calls()) {
      if (nearestComponent(call, componentNodes)?.node !== component.node || insideTask(call)) continue;
      if (!call.target?.isMember() || !/^this\.(?:getContext|setContext)$/.test(call.target.node.text ?? "")) continue;
      const token = call.arguments[0];
      const exact = token && /^(?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/.test(token.node.text ?? "");
      const effect = Object.freeze({
        token: exact ? token!.node.text! : "unknown",
        kind: call.target.name === "getContext" ? "read" : "write",
        confidence: exact ? "exact" : "unknown"
      } satisfies ExactContextEffect);
      contexts.push(effect);
      contextSites.push(Object.freeze({ start: call.node.span?.start ?? spanStart(component), effect }));
    }

    const span = component.node.span!;
    sites.set(component.node.name!, Object.freeze({
      name: component.node.name!,
      start: span.start,
      end: span.end,
      clientEffects,
      serverEffects,
      clientIslandCount,
      splitBoundaries: Object.freeze([...splitBoundaries].sort()),
      diagnostics: Object.freeze([...diagnostics].sort()),
      browserGlobalsOutsideClientBoundary: Object.freeze([...outsideGlobals].sort()),
      contexts: Object.freeze(uniqueContexts(contexts)),
      contextSites: Object.freeze(contextSites),
      renders: Object.freeze(renders)
    }));
  }
  return Object.freeze({ sites });
}

function declarationDescription(kind: string): string {
  if (["VariableDeclaration", "BindingElement"].includes(kind)) return "variable";
  if (["ClassDeclaration", "ClassExpression"].includes(kind)) return "class";
  return kind;
}

function isClientIslandAttribute(name: string): boolean {
  return name === "ref" || /^on[A-Z]/.test(name);
}

/** Resolves expression render sites against local/imported component metadata. */
export function createExpressionRenderEdges(
  filename: string,
  componentName: string,
  renders: readonly ExpressionRenderSite[],
  componentInfo: ReadonlyMap<string, ExactImportedComponentIR>
): ExactComponentRenderEdgeIR[] {
  const edges: ExactComponentRenderEdgeIR[] = [];
  for (const render of renders) {
    const component = componentInfo.get(render.tag);
    if (!component) continue;
    const index = edges.length + 1;
    edges.push({
      id: stableId(filename, componentName, "render-edge", String(index), render.path, render.tag, component.componentId ?? component.name),
      tag: render.tag,
      name: component.boundaryName ?? component.name,
      componentId: component.componentId,
      placement: component.placement,
      boundary: component.placement,
      index,
      path: render.path
    });
  }
  return edges;
}

/** Creates client-component and server-slot boundaries from expression render sites. */
export function createExpressionComponentBoundaries(
  filename: string,
  components: readonly ExactComponentIR[],
  plan: ExpressionComponentPlan,
  componentInfo: ReadonlyMap<string, ExactImportedComponentIR>
): ExactBoundaryIR[] {
  const boundaries: ExactBoundaryIR[] = [];
  const seen = new Set<string>();
  for (const owner of components) {
    const site = plan.sites.get(owner.name);
    if (!site) continue;
    for (const render of site.renders) {
      const component = componentInfo.get(render.tag);
      if (!component || component.placement !== "client") continue;
      const name = component.boundaryName ?? component.name;
      const id = stableId(filename, name, "component-island", String(render.start), String(render.end));
      if (seen.has(id)) continue;
      seen.add(id);
      const edge = owner.renderEdges.find(candidate => candidate.path === render.path && candidate.tag === render.tag);
      boundaries.push({
        id,
        name,
        componentId: component.componentId,
        ownerComponentId: owner.id,
        renderEdgeId: edge?.id,
        renderEdgeIndex: edge?.index,
        renderPath: edge?.path,
        kind: "client-island"
      });
      if (render.serverSlotChildren) {
        boundaries.push({
          id: serverSlotBoundaryId(id),
          name: `${name}:children`,
          componentId: component.componentId,
          ownerComponentId: owner.id,
          renderEdgeId: edge?.id,
          renderEdgeIndex: edge?.index,
          renderPath: edge?.path,
          kind: "server-slot"
        });
      }
    }
  }
  return boundaries;
}

function nodePath(reference: NodeRef, component: NodeRef): string {
  const path: number[] = [];
  let current = reference;
  while (current.parent && current.parent.node !== component.node) {
    path.unshift(current.parent.node.children.indexOf(current.node));
    current = current.parent;
  }
  if (current.parent?.node === component.node) path.unshift(component.node.children.indexOf(current.node));
  return path.join(".");
}

function uniqueContexts(values: readonly ExactContextEffect[]): ExactContextEffect[] {
  return [...new Map(values.map(value => [`${value.kind}:${value.token}:${value.confidence}`, value])).values()]
    .sort((left, right) => `${left.kind}:${left.token}`.localeCompare(`${right.kind}:${right.token}`));
}

function inside(start: number, end: number, component: NodeRef): boolean {
  const span = component.node.span!;
  return start >= span.start && end <= span.end;
}

function nearestComponent(reference: NodeRef, components: ReadonlySet<NodeRef["node"]>): NodeRef | undefined {
  return reference.ancestors().functions().first(candidate => components.has(candidate.node));
}

function ownedByComponent(module: BoundModule, start: number, component: NodeRef, components: ReadonlySet<NodeRef["node"]>): boolean {
  const element = module.walk().jsxElements().first(reference => reference.node.span?.start === start);
  return !element || nearestComponent(element, components)?.node === component.node;
}

function insideTask(reference: NodeRef): boolean {
  return reference.ancestors().calls().any(call => /^this\.task(?:\.[A-Za-z_$][\w$]*)?\s*\(/.test(call.node.text ?? ""));
}

function insideClientIsland(reference: NodeRef): boolean {
  return reference.ancestors().jsxElements().any(element => element.node.attributes.some(attribute => isClientIslandAttribute(attribute.name ?? "")));
}

function insideClientIslandOpening(reference: NodeRef): boolean {
  if (!insideClientIsland(reference)) return false;
  return reference.ancestors().any(ancestor => ancestor.node.kind === "JsxAttribute" || ancestor.node.kind === "JsxOpeningElement" || ancestor.node.kind === "JsxSelfClosingElement");
}

function spanStart(reference: NodeRef): number {
  return reference.node.span?.start ?? 0;
}
