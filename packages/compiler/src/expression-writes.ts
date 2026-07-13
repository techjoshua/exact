import { rewriteModule, type BoundModule, type NodeRef, type UnboundModule } from "@exact/expressions";

export interface ExpressionWriteResult {
  readonly module: BoundModule | UnboundModule;
  readonly changed: boolean;
  readonly count: number;
}

const assignmentOperators = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??="]);
const arrayMutators = new Set(["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"]);

/** Lowers direct component-state writes using immutable expression rewrites. */
export function lowerExpressionWrites(module: BoundModule): ExpressionWriteResult {
  const used = new Set(module.walk().references().toArray().map(reference => reference.name).filter((name): name is string => !!name));
  const names = {
    write: allocate("__exactWrite", used),
    update: allocate("__exactUpdate", used),
    remove: allocate("__exactDelete", used),
    array: allocate("__exactArrayMutation", used)
  };
  const replacements = new Map<string, string>();
  const imports = new Map<string, string>();
  const aliases = collectStateAliases(module);

  for (const reference of module.walk()) {
    if (!insideComponent(reference)) continue;
    const replacement = lowerWrite(module, reference, aliases, names, imports);
    if (replacement !== undefined) replacements.set(reference.node.id, replacement);
  }
  if (!replacements.size) return Object.freeze({ module, changed: false, count: 0 });

  const importText = `import { ${[...imports].map(([imported, local]) => `${imported} as ${local}`).join(", ")} } from "@exact/reactive";`;
  const rewritten = rewriteModule(module, rewriter => {
    rewriter.replaceTextWhere(reference => replacements.has(reference.node.id), reference => replacements.get(reference.node.id)!);
    const statements = module.root.children().toArray();
    const firstNonDirective = statements.find(statement => !isDirective(statement));
    if (firstNonDirective) rewriter.insertTextBefore(firstNonDirective, importText);
    else if (statements.length) rewriter.insertTextAfter(statements.at(-1)!, importText);
  });
  return Object.freeze({ module: rewritten, changed: true, count: replacements.size });
}

function lowerWrite(module: BoundModule, reference: NodeRef, aliases: ReadonlyMap<string, readonly string[]>, names: Readonly<{ write: string; update: string; remove: string; array: string }>, imports: Map<string, string>): string | undefined {
  const node = reference.node;
  if (node.kind === "BinaryExpression" && assignmentOperators.has(node.operator ?? "")) {
    const left = node.children[0];
    const right = node.children.at(-1);
    const path = statePath(module, left, aliases);
    if (!path?.length || !right?.text) return undefined;
    if (node.operator === "=") {
      imports.set("writeReactive", names.write);
      return `${names.write}(this.state, ${JSON.stringify(path)}, ${right.text})`;
    }
    imports.set("updateReactiveValue", names.update);
    return `${names.update}(this.state, ${JSON.stringify(path)}, previous => previous ${node.operator!.slice(0, -1)} (${right.text}))`;
  }
  if ((node.kind === "PrefixUnaryExpression" || node.kind === "PostfixUnaryExpression") && (node.operator === "++" || node.operator === "--")) {
    const path = statePath(module, node.children[0], aliases);
    if (!path?.length) return undefined;
    imports.set("updateReactiveValue", names.update);
    return `${names.update}(this.state, ${JSON.stringify(path)}, previous => previous ${node.operator === "++" ? "+" : "-"} 1, ${node.kind === "PostfixUnaryExpression"})`;
  }
  if (node.kind === "DeleteExpression") {
    const path = statePath(module, node.children[0], aliases);
    if (!path?.length) return undefined;
    imports.set("deleteReactiveValue", names.remove);
    return `${names.remove}(this.state, ${JSON.stringify(path)})`;
  }
  if (node.kind === "CallExpression" && reference.target?.isMember() && arrayMutators.has(reference.target.name ?? "")) {
    const path = statePath(module, reference.target.target?.node, aliases);
    if (!path?.length) return undefined;
    imports.set("mutateReactiveArray", names.array);
    return `${names.array}(this.state, ${JSON.stringify(path)}, ${JSON.stringify(reference.target.name)}, [${reference.arguments.map(argument => argument.node.text).join(", ")}])`;
  }
  return undefined;
}

function statePath(module: BoundModule, node: NodeRef["node"] | undefined, aliases: ReadonlyMap<string, readonly string[]>): string[] | undefined {
  const text = node?.text?.trim();
  if (!node || !text) return undefined;
  if (/^this\.state(?:\.[A-Za-z_$][\w$]*)*$/.test(text)) return text.split(".").slice(2);
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(text)) return undefined;
  const root = module.ref(node).walk().references().first()?.variable;
  const base = root ? aliases.get(root.id) : undefined;
  if (!base) return undefined;
  const segments = text.split(".");
  return [...base, ...segments.slice(1)];
}

function collectStateAliases(module: BoundModule): ReadonlyMap<string, readonly string[]> {
  const aliases = new Map<string, readonly string[]>();
  for (const declaration of module.walk().ofKind("VariableDeclaration")) {
    const children = declaration.children().toArray();
    const initializer = children.at(-1);
    const base = initializer ? statePath(module, initializer.node, aliases) : undefined;
    if (!base) continue;
    const name = children[0];
    if (name?.node.kind === "Identifier" && name.variable) {
      aliases.set(name.variable.id, base);
      continue;
    }
    for (const binding of name?.walk().ofKind("BindingElement") ?? []) {
      const identifiers = binding.children().where(child => child.node.kind === "Identifier").toArray();
      const variable = identifiers.at(-1)?.variable;
      if (!variable) continue;
      const segment = identifiers.length > 1 ? identifiers[0]!.name : identifiers.at(-1)!.name;
      if (segment) aliases.set(variable.id, [...base, segment]);
    }
  }
  return aliases;
}

function insideComponent(reference: NodeRef): boolean {
  return reference.ancestors().functions().any(ancestor => ancestor.node.kind === "FunctionDeclaration" && /^[A-Z]/.test(ancestor.node.name ?? ""));
}

function isDirective(reference: NodeRef): boolean {
  return reference.node.kind === "ExpressionStatement" && /^\s*["'][^"']+["'];?\s*$/.test(reference.node.text ?? "");
}

function allocate(base: string, used: Set<string>): string {
  let name = base;
  let index = 1;
  while (used.has(name)) name = `${base}_${index++}`;
  used.add(name);
  return name;
}
