import type { BoundModule, NodeRef, Variable } from "@exact/expressions";
import type { ExpressionJsxPlan } from "./expression-jsx.js";
import type { ExpressionTaskPlan } from "./expression-tasks.js";
import { isServerOnlyModule } from "./imports.js";

export interface ExpressionComponentSite {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly clientEffects: boolean;
  readonly serverEffects: boolean;
  readonly splitBoundaries: readonly string[];
  readonly browserGlobalsOutsideClientBoundary: readonly string[];
}

export interface ExpressionComponentPlan {
  readonly sites: ReadonlyMap<string, ExpressionComponentSite>;
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
    let clientEffects = false;
    let serverEffects = false;

    for (const element of jsx.elements.values()) {
      if (!inside(element.start, element.end, component) || !ownedByComponent(module, element.start, component, componentNodes)) continue;
      for (const attribute of element.attributes) {
        if (!/^on[A-Z]/.test(attribute) && attribute !== "ref") continue;
        clientEffects = true;
        splitBoundaries.add(attribute === "ref" ? "ref" : "event-handler");
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
      }
    }

    for (const task of tasks.sites.values()) {
      if (!inside(task.start, task.end, component)) continue;
      if (task.placement === "client" || task.placement === "isomorphic") clientEffects = true;
      if (task.placement === "server" || task.placement === "isomorphic") serverEffects = true;
    }

    const span = component.node.span!;
    sites.set(component.node.name!, Object.freeze({
      name: component.node.name!,
      start: span.start,
      end: span.end,
      clientEffects,
      serverEffects,
      splitBoundaries: Object.freeze([...splitBoundaries].sort()),
      browserGlobalsOutsideClientBoundary: Object.freeze([...outsideGlobals].sort())
    }));
  }
  return Object.freeze({ sites });
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
  return reference.ancestors().jsxElements().any(element => element.node.attributes.some(attribute => /^(?:on[A-Z]|ref)$/.test(attribute.name ?? "")));
}
