import type { BoundModule, NodeRef, Variable } from "@exact/expressions";
import type { ExpressionJsxPlan } from "./expression-jsx.js";
import type { ExpressionTaskPlan } from "./expression-tasks.js";
import type { ExactProvenanceGraph } from "./provenance.js";
import { expressionStatePath, type ExpressionWritePlan } from "./expression-writes.js";
import { isServerOnlyModule } from "./imports.js";
import { stableId } from "./ids.js";
import type { ExactBoundaryIR, ExactComponentIR, ExactComponentRenderEdgeIR, ExactContextEffect, ExactImportedComponentIR, ExactTaskIR } from "./types.js";
import { generatedComponentName, serverSlotBoundaryId } from "./names.js";

export interface ExpressionRenderSite {
  readonly tag: string;
  readonly start: number;
  readonly end: number;
  readonly path: string;
  readonly serverSlotChildren: boolean;
}

export interface ExpressionClientIslandSite {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly serverOnlyChildren: boolean;
  readonly childTags: readonly string[];
  readonly valueCaptures: readonly string[];
  readonly functionCaptures: readonly string[];
  readonly stateReads: readonly string[];
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
  readonly clientIslands: readonly ExpressionClientIslandSite[];
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
export function analyzeExpressionComponents(module: BoundModule, jsx: ExpressionJsxPlan, tasks: ExpressionTaskPlan, provenance?: ExactProvenanceGraph, writes?: ExpressionWritePlan): ExpressionComponentPlan {
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
    const clientIslands: ExpressionClientIslandSite[] = [];
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
        if (!nestedInIsland) {
          clientIslandCount++;
          const children = reference?.node.jsxChildren ?? [];
          const childRefs = children.map(child => module.ref(child));
          const serverOnlyChildren = childRefs.some(child => child.walk().references().any(candidate =>
            !!candidate.variable?.importedFrom && isServerOnlyModule(candidate.variable.importedFrom)));
          const childTags = new Set<string>();
          for (const child of childRefs) for (const descendant of child.walk().jsxElements()) {
            if (descendant.node.tagName && !/^[a-z]/.test(descendant.node.tagName)) childTags.add(descendant.node.tagName);
          }
          const captures = expressionIslandCaptures(module, component, reference);
          const stateReads = expressionIslandStateReads(module, reference, provenance, writes?.aliases ?? new Map());
          clientIslands.push(Object.freeze({
            index: clientIslandCount,
            start: element.start,
            end: element.end,
            serverOnlyChildren,
            childTags: Object.freeze([...childTags]),
            valueCaptures: Object.freeze(captures.values),
            functionCaptures: Object.freeze(captures.functions),
            stateReads: Object.freeze(stateReads)
          }));
        }
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
      renders: Object.freeze(renders),
      clientIslands: Object.freeze(clientIslands)
    }));
  }
  return Object.freeze({ sites });
}

function declarationDescription(kind: string): string {
  if (["VariableDeclaration", "BindingElement"].includes(kind)) return "variable";
  if (["ClassDeclaration", "ClassExpression"].includes(kind)) return "class";
  return kind;
}

function expressionIslandCaptures(module: BoundModule, component: NodeRef, island: NodeRef | undefined): Readonly<{ values: string[]; functions: string[] }> {
  if (!island?.node.span) return { values: [], functions: [] };
  const values = new Set<string>();
  const functions = new Set<string>();
  const visited = new Set<string>();
  const addCapture = (variable: Variable): void => {
    if (visited.has(variable.id)) return;
    visited.add(variable.id);
    if (!["VariableDeclaration", "BindingElement", "FunctionDeclaration"].includes(variable.declarationKind)) return;
    const declaration = variableDeclaration(module, variable);
    if (!declaration?.node.span || insideSpan(declaration.node.span.start, declaration.node.span.end, island)) return;
    if (declarationOwner(declaration)?.node !== component.node) return;
    if (isCloneableFunctionDeclaration(declaration)) {
      functions.add(variable.name);
      for (const dependency of module.dependenciesOf(declaration)) addCapture(dependency);
    } else values.add(variable.name);
  };
  for (const variable of module.dependenciesOf(island)) addCapture(variable);
  return { values: [...values].sort(), functions: [...functions].sort() };
}

function expressionIslandStateReads(
  module: BoundModule,
  island: NodeRef | undefined,
  provenance: ExactProvenanceGraph | undefined,
  aliases: ReadonlyMap<string, readonly string[]>
): string[] {
  if (!island) return [];
  const paths = new Set<string>();
  const visitedVariables = new Set<string>();
  const collect = (root: NodeRef): void => {
    for (const reference of root.walk().references()) {
      const alias = reference.variable ? aliases.get(reference.variable.id) : undefined;
      if (!alias?.length) continue;
      if (reference.parent?.isMember() && reference.parent.target?.node === reference.node) continue;
      paths.add(alias.join("."));
    }
    for (const member of root.walk().memberAccesses()) {
      if (member.parent?.isMember() && member.parent.target?.node === member.node) continue;
      const path = expressionStatePath(module, member.node, aliases);
      if (path?.length) paths.add(path.join("."));
    }
    if (!provenance) return;
    for (const variable of module.dependenciesOf(root)) {
      const entry = provenance.get(variable);
      if (visitedVariables.has(variable.id) || entry?.provenance !== "derived" || !entry.safeToReevaluate) continue;
      if (aliases.has(variable.id)) continue;
      visitedVariables.add(variable.id);
      const declaration = variableDeclaration(module, variable);
      const initializer = declaration?.children().toArray().at(-1);
      if (initializer && initializer.node !== declaration?.children().first()?.node) collect(initializer);
    }
  };
  collect(island);
  return [...paths].sort();
}

function variableDeclaration(module: BoundModule, variable: Variable): NodeRef | undefined {
  return module.walk().references()
    .where(reference => reference.variable === variable)
    .toArray()
    .sort((left, right) => (left.node.span?.start ?? Number.MAX_SAFE_INTEGER) - (right.node.span?.start ?? Number.MAX_SAFE_INTEGER))
    .map(reference => {
      const declaration = reference.ancestors().first(ancestor => ancestor.node.kind === variable.declarationKind);
      if (!declaration) return undefined;
      const name = declaration.children().first();
      if (variable.declarationKind === "BindingElement") {
        return reference.parent?.node === declaration.node ? declaration : undefined;
      }
      return name && insideSpan(reference.node.span?.start ?? -1, reference.node.span?.end ?? -1, name) ? declaration : undefined;
    })
    .find((declaration): declaration is NodeRef => !!declaration);
}

function declarationOwner(declaration: NodeRef): NodeRef | undefined {
  return declaration.ancestors().functions().first();
}

function isCloneableFunctionDeclaration(declaration: NodeRef): boolean {
  if (declaration.node.kind === "FunctionDeclaration") return true;
  if (declaration.node.kind !== "VariableDeclaration") return false;
  const initializer = declaration.children().toArray().at(-1)?.node.kind;
  return initializer === "ArrowFunction" || initializer === "FunctionExpression";
}

function insideSpan(start: number, end: number, owner: NodeRef): boolean {
  const span = owner.node.span;
  return !!span && start >= span.start && end <= span.end;
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

/** Creates server-slot boundaries for generated intrinsic client islands. */
export function createExpressionGeneratedServerSlotBoundaries(
  filename: string,
  components: readonly ExactComponentIR[],
  plan: ExpressionComponentPlan,
  componentInfo: ReadonlyMap<string, ExactImportedComponentIR>
): ExactBoundaryIR[] {
  const boundaries: ExactBoundaryIR[] = [];
  for (const owner of components) {
    const site = plan.sites.get(owner.name);
    if (!site) continue;
    for (const island of site.clientIslands) {
      const hasServerComponent = island.childTags.some(tag => componentInfo.get(tag)?.placement === "server");
      if (!island.serverOnlyChildren && !hasServerComponent) continue;
      const islandId = stableId(filename, owner.name, "client-island", String(island.index));
      boundaries.push({
        id: serverSlotBoundaryId(islandId),
        name: `${generatedComponentName(owner.name, "client-island", island.index)}:children`,
        componentId: owner.id,
        ownerComponentId: owner.id,
        kind: "server-slot"
      });
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
