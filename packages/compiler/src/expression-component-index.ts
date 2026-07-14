import type { BoundModule, FunctionExpressionNode, NodeRef, Variable } from "@exact/expressions";

export interface ExpressionComponentIndex {
  readonly functions: readonly NodeRef<FunctionExpressionNode>[];
  isComponent(reference: NodeRef | undefined): boolean;
  owner(reference: NodeRef): NodeRef | undefined;
}

const cache = new WeakMap<BoundModule, ExpressionComponentIndex>();
const componentProtocolMembers = new Set([
  "getContext", "log", "map", "onMount", "onRender", "onUnmount", "reactive", "ref", "refs", "setContext", "state", "task"
]);

/** Builds the single canonical component identity index used by compiler analyses. */
export function expressionComponentIndex(module: BoundModule): ExpressionComponentIndex {
  const existing = cache.get(module);
  if (existing) return existing;
  const componentNodes = new Set<NodeRef["node"]>();
  const declarations = module.walk().functions()
    .where(reference => reference.node.kind === "FunctionDeclaration" && !!reference.node.span)
    .toArray();

  for (const declaration of declarations) {
    if (declaration.node.parameters.some(isComponentThisVariable)) componentNodes.add(declaration.node);
  }
  // JavaScript and concise TypeScript components commonly omit an explicit
  // `this: Component` parameter. Treat use of the compiler-owned component
  // protocol as the semantic declaration signal. An explicitly typed,
  // non-Component `this` remains an ordinary function.
  for (const reference of module.walk().references()) {
    const variable = reference.variable;
    if (!isImplicitComponentThisVariable(variable)) continue;
    const member = reference.parent;
    if (!member?.isMember() || member.target?.node !== reference.node || !componentProtocolMembers.has(member.name ?? "")) continue;
    const owner = reference.ancestors().functions().first(candidate => candidate.node.kind === "FunctionDeclaration");
    if (owner) componentNodes.add(owner.node);
  }
  for (const element of module.walk().jsxElements()) {
    const owner = element.ancestors().functions().first(candidate => candidate.node.kind === "FunctionDeclaration");
    if (owner) componentNodes.add(owner.node);
  }

  const functions = Object.freeze(declarations.filter(declaration => componentNodes.has(declaration.node)));
  const index: ExpressionComponentIndex = Object.freeze({
    functions,
    isComponent(reference: NodeRef | undefined) { return !!reference && componentNodes.has(reference.node); },
    owner(reference: NodeRef) {
      return reference.ancestors().functions().first((candidate: NodeRef<FunctionExpressionNode>) => componentNodes.has(candidate.node));
    }
  });
  cache.set(module, index);
  return index;
}

/** Recognizes eXact's component receiver from package-owned semantic type data. */
export function isComponentThisVariable(variable: Variable | undefined): variable is Variable {
  if (!variable || variable.name !== "this" || variable.declarationKind !== "Parameter" || !variable.type) return false;
  const properties = new Set(variable.type.properties);
  return /(?:^|\W)Component(?:<|$)/.test(variable.type.display)
    || ["state", "task", "map", "getContext", "setContext", "onMount", "onUnmount"]
      .every(property => properties.has(property));
}

/** An unannotated function receiver whose component status is established by protocol use. */
export function isImplicitComponentThisVariable(variable: Variable | undefined): variable is Variable {
  return !!variable && variable.name === "this" && variable.declarationKind === "ThisKeyword";
}
