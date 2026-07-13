import type { BoundModule, ExpressionNode, NodeRef, Variable } from "@exact/expressions";

export type ExactReactiveProvenance = "state" | "props" | "context" | "derived" | "cell" | "snapshot" | "unknown";

export interface ExactProvenanceEntry {
  readonly variable: Variable;
  readonly provenance: ExactReactiveProvenance;
  readonly dependencies: readonly Variable[];
}

export interface ExactProvenanceGraph {
  readonly entries: readonly ExactProvenanceEntry[];
  readonly cells: readonly ExactReactiveCell[];
  readonly byVariableId: ReadonlyMap<string, ExactProvenanceEntry>;
  get(variable: Variable): ExactProvenanceEntry | undefined;
}

export interface ExactReactiveCell {
  readonly node: ExpressionNode;
  readonly kind: "jsx-child" | "jsx-attribute";
  readonly dependencies: readonly Variable[];
}

/** Adds eXact semantics over the package's generic canonical dependency model. */
export function buildExactProvenance(module: BoundModule): ExactProvenanceGraph {
  const dependencies = new Map<Variable, Set<Variable>>();
  const hints = new Map<Variable, ExactReactiveProvenance>();

  for (const fn of module.walk().functions()) {
    if (fn.node.kind === "FunctionDeclaration" && /^[A-Z]/.test(fn.node.name ?? "")) {
      for (const parameter of fn.node.parameters) hints.set(parameter, parameter.name === "this" ? "state" : "props");
    }
  }

  for (const declaration of module.walk().ofKind("VariableDeclaration")) {
    const declared = declaration.descendants().references().first(reference => isDeclarationName(reference, declaration))?.variable;
    if (!declared) continue;
    const values = dependencies.get(declared) ?? new Set<Variable>();
    const initializer = declaration.children().toArray().at(-1);
    for (const variable of initializer ? module.dependenciesOf(initializer) : []) {
      if (variable !== declared) values.add(variable);
    }
    dependencies.set(declared, values);
    const text = declaration.node.text ?? "";
    if (/\bpeek\s*\(/.test(text)) hints.set(declared, "snapshot");
    else if (/\bthis\.state\b/.test(text)) hints.set(declared, "derived");
    else if (/\bthis\.props\b/.test(text)) hints.set(declared, "derived");
    else if (/\b(?:useContext|this\.context)\b/.test(text)) hints.set(declared, "derived");
  }

  for (const call of module.walk().calls()) {
    if (!call.target?.isMember() || !["filter", "map", "flatMap", "reduce", "find", "some", "every"].includes(call.target.name ?? "")) continue;
    const source = call.target.target;
    const sources = source?.walk().references().toArray().map(reference => reference.variable).filter((value): value is Variable => !!value) ?? [];
    const directlyReactive = /\bthis\.(?:state|props|context)\b/.test(source?.node.text ?? "");
    for (const argument of call.arguments) {
      if (!argument.node.kind.includes("Function") && argument.node.kind !== "ArrowFunction") continue;
      const parameters = "parameters" in argument.node ? argument.node.parameters as readonly Variable[] : [];
      for (const parameter of parameters) {
        const values = dependencies.get(parameter) ?? new Set<Variable>();
        for (const sourceVariable of sources) values.add(sourceVariable);
        dependencies.set(parameter, values);
        if (directlyReactive) hints.set(parameter, "derived");
      }
    }
  }

  const allVariables = new Map<string, Variable>();
  for (const reference of module.walk().references()) {
    if (reference.variable && isLexicalBinding(reference.variable)) allVariables.set(reference.variable.id, reference.variable);
  }
  const resolving = new Set<Variable>();
  const resolved = new Map<Variable, ExactReactiveProvenance>();
  const classify = (variable: Variable): ExactReactiveProvenance => {
    const prior = resolved.get(variable);
    if (prior) return prior;
    const direct = hints.get(variable) ?? classifyName(variable.name);
    if (direct !== "unknown") { resolved.set(variable, direct); return direct; }
    if (resolving.has(variable)) return "unknown";
    resolving.add(variable);
    const reactive = [...(dependencies.get(variable) ?? [])].some(source => isReactive(classify(source)));
    resolving.delete(variable);
    const value = reactive ? "derived" : "unknown";
    resolved.set(variable, value);
    return value;
  };

  const entries = Object.freeze([...allVariables.values()].map(variable => Object.freeze({
    variable,
    provenance: classify(variable),
    dependencies: Object.freeze([...(dependencies.get(variable) ?? [])])
  })));
  const byVariableId = new Map(entries.map(entry => [entry.variable.id, entry]));
  const cells: ExactReactiveCell[] = [];
  for (const jsx of module.walk().ofKind("JsxExpression")) {
    const cellDependencies = jsx.descendants().references().toArray().map(reference => reference.variable).filter((value): value is Variable => !!value && isReactive(classify(value)));
    if (!cellDependencies.length) continue;
    cells.push(Object.freeze({
      node: jsx.node,
      kind: jsx.parent?.node.kind === "JsxAttribute" ? "jsx-attribute" : "jsx-child",
      dependencies: Object.freeze([...new Set(cellDependencies)])
    }));
  }
  return Object.freeze({ entries, cells: Object.freeze(cells), byVariableId, get: (variable: Variable) => byVariableId.get(variable.id) });
}

function isDeclarationName(reference: NodeRef, declaration: NodeRef): boolean {
  return reference.parent?.node === declaration.node || reference.ancestors().first()?.node === declaration.node;
}

function classifyName(name: string): ExactReactiveProvenance {
  if (name === "state") return "state";
  if (name === "props") return "props";
  if (name === "context") return "context";
  return "unknown";
}

function isReactive(value: ExactReactiveProvenance): boolean {
  return value === "state" || value === "props" || value === "context" || value === "derived" || value === "cell";
}

function isLexicalBinding(variable: Variable): boolean {
  return ["VariableDeclaration", "Parameter", "BindingElement", "FunctionDeclaration", "ClassDeclaration", "ImportSpecifier", "ImportClause", "NamespaceImport"].includes(variable.declarationKind);
}
