import type {
  EmitOptions,
  ExpressionNode,
  ExpressionScope,
  ExpressionType,
  ExpressionTypeKind,
  ScopeKind,
  Variable
} from "./model.js";
import { createModule, type UnboundModule } from "./module.js";

let syntheticId = 1;

class SyntheticScope implements ExpressionScope {
  readonly id = `synthetic-scope:${syntheticId++}`;
  private readonly owned: Variable[] = [];
  constructor(readonly kind: ScopeKind, readonly parent?: ExpressionScope) {}
  get variables(): readonly Variable[] { return this.owned; }
  add(variable: Variable): void {
    if (this.owned.some(current => current.name === variable.name)) throw new Error(`Duplicate binding "${variable.name}"`);
    this.owned.push(variable);
  }
}

class SyntheticVariable implements Variable {
  readonly id = `synthetic-variable:${syntheticId++}`;
  readonly synthetic = true;
  constructor(
    readonly name: string,
    readonly declarationKind: string,
    readonly scope: ExpressionScope,
    readonly type?: ExpressionType,
    readonly exported = false,
    readonly importedFrom?: string
  ) {}
}

function type(kind: ExpressionTypeKind, display: string = kind): ExpressionType {
  return Object.freeze({
    id: `synthetic-type:${kind}:${display}`,
    kind,
    display,
    nullable: kind === "null" || kind === "undefined" || kind === "unknown" || kind === "any",
    callable: kind === "function",
    properties: Object.freeze([]),
    unionMembers: Object.freeze([])
  });
}

export class TypeBuilder {
  any(): ExpressionType { return type("any"); }
  unknown(): ExpressionType { return type("unknown"); }
  never(): ExpressionType { return type("never"); }
  void(): ExpressionType { return type("void"); }
  boolean(): ExpressionType { return type("boolean"); }
  number(): ExpressionType { return type("number"); }
  bigint(): ExpressionType { return type("bigint"); }
  string(): ExpressionType { return type("string"); }
  object(display = "object"): ExpressionType { return type("object", display); }
  named(display: string): ExpressionType { return type("object", display); }
  union(...members: ExpressionType[]): ExpressionType {
    return Object.freeze({
      id: `synthetic-type:union:${members.map(member => member.id).join("|")}`,
      kind: "union" as const,
      display: members.map(member => member.display).join(" | "),
      nullable: members.some(member => member.nullable),
      callable: members.every(member => member.callable),
      properties: Object.freeze([]),
      unionMembers: Object.freeze([...members])
    });
  }
}

function syntheticNode(
  kind: string,
  category: ExpressionNode["category"],
  scope: ExpressionScope,
  generatedText: string,
  children: readonly ExpressionNode[] = [],
  extra: Partial<ExpressionNode> = {}
): ExpressionNode {
  return Object.freeze({
    id: `synthetic-node:${syntheticId++}`,
    kind,
    category,
    scope,
    synthetic: true,
    children: Object.freeze([...children]),
    generatedText,
    ...extra
  });
}

export class FunctionBuilder {
  private readonly statements: ExpressionNode[] = [];
  private readonly parameters: Variable[] = [];
  readonly scope: SyntheticScope;

  constructor(private readonly module: ModuleBuilder, parent: ExpressionScope) {
    this.scope = new SyntheticScope("function", parent);
  }

  parameter(name: string, valueType?: ExpressionType): Variable {
    const variable = new SyntheticVariable(name, "parameter", this.scope, valueType);
    this.scope.add(variable);
    this.parameters.push(variable);
    return variable;
  }

  variable(name: string, initializer?: ExpressionNode, valueType?: ExpressionType): Variable {
    const variable = new SyntheticVariable(name, "const", this.scope, valueType ?? initializer?.type);
    this.scope.add(variable);
    const annotation = variable.type ? `: ${variable.type.display}` : "";
    const text = `const ${name}${annotation}${initializer ? ` = ${printNode(initializer)}` : ""};`;
    this.statements.push(syntheticNode("VariableStatement", "statement", this.scope, text, initializer ? [initializer] : [], { variable }));
    return variable;
  }

  expression(expression: ExpressionNode): this {
    this.statements.push(syntheticNode("ExpressionStatement", "statement", this.scope, `${printNode(expression)};`, [expression]));
    return this;
  }

  returns(expression?: ExpressionNode): this {
    this.statements.push(syntheticNode("ReturnStatement", "statement", this.scope, `return${expression ? ` ${printNode(expression)}` : ""};`, expression ? [expression] : []));
    return this;
  }

  build(name: string, exported: boolean): ExpressionNode {
    const params = this.parameters.map(variable => `${variable.name}${variable.type ? `: ${variable.type.display}` : ""}`).join(", ");
    const body = this.statements.map(statement => `  ${printNode(statement)}`).join("\n");
    return syntheticNode("FunctionDeclaration", "declaration", this.scope, `${exported ? "export " : ""}function ${name}(${params}) {\n${body}\n}`, this.statements, { name });
  }
}

export class ModuleBuilder {
  readonly types = new TypeBuilder();
  readonly scope = new SyntheticScope("module");
  private readonly statements: ExpressionNode[] = [];

  constructor(readonly filename: string) {}

  variable(name: string, valueType?: ExpressionType): Variable {
    const variable = new SyntheticVariable(name, "const", this.scope, valueType);
    this.scope.add(variable);
    return variable;
  }

  import(names: readonly string[], from: string): readonly Variable[] {
    const variables = names.map(name => {
      const variable = new SyntheticVariable(name, "import", this.scope, undefined, false, from);
      this.scope.add(variable);
      return variable;
    });
    this.statements.push(syntheticNode("ImportDeclaration", "declaration", this.scope, `import { ${names.join(", ")} } from ${JSON.stringify(from)};`, [], { name: from }));
    return variables;
  }

  exportFunction(name: string, configure: (fn: FunctionBuilder) => void): this {
    const variable = new SyntheticVariable(name, "function", this.scope, type("function", `typeof ${name}`), true);
    this.scope.add(variable);
    const fn = new FunctionBuilder(this, this.scope);
    configure(fn);
    this.statements.push(Object.freeze({ ...fn.build(name, true), variable }));
    return this;
  }

  literal(value: string | number | bigint | boolean | null | undefined): ExpressionNode {
    const valueType = value === null ? type("null") : value === undefined ? type("undefined") : type(typeof value as ExpressionTypeKind);
    const text = typeof value === "string" ? JSON.stringify(value) : typeof value === "bigint" ? `${value}n` : value === undefined ? "undefined" : String(value);
    return syntheticNode("LiteralExpression", "expression", this.scope, text, [], { type: valueType, text });
  }

  reference(variable: Variable): ExpressionNode {
    return syntheticNode("Identifier", "expression", variable.scope, variable.name, [], { name: variable.name, variable, type: variable.type });
  }

  multiply(left: ExpressionNode, right: ExpressionNode): ExpressionNode {
    return this.binary(left, "*", right, this.types.number());
  }

  binary(left: ExpressionNode, operator: string, right: ExpressionNode, valueType?: ExpressionType): ExpressionNode {
    return syntheticNode("BinaryExpression", "expression", this.scope, `${printNode(left)} ${operator} ${printNode(right)}`, [left, right], { operator, type: valueType });
  }

  member(target: ExpressionNode, name: string): ExpressionNode {
    return syntheticNode("PropertyAccessExpression", "expression", this.scope, `${printNode(target)}.${name}`, [target], { name });
  }

  call(target: ExpressionNode, ...args: ExpressionNode[]): ExpressionNode {
    return Object.freeze({
      ...syntheticNode("CallExpression", "expression", this.scope, `${printNode(target)}(${args.map(printNode).join(", ")})`, [target, ...args]),
      target,
      arguments: Object.freeze(args)
    });
  }

  jsx(tag: string, props: Readonly<Record<string, ExpressionNode | string | boolean>> = {}, ...children: ExpressionNode[]): ExpressionNode {
    const attributes = Object.entries(props).map(([name, value]) => {
      if (value === true) return name;
      if (value === false) return `${name}={false}`;
      if (typeof value === "string") return `${name}=${JSON.stringify(value)}`;
      return `${name}={${printNode(value)}}`;
    }).join(" ");
    const open = attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
    return syntheticNode("JsxElement", "jsx", this.scope, `${open}${children.map(printNode).join("")}</${tag}>`, children, { name: tag });
  }

  build(): UnboundModule {
    const code = this.statements.map(printNode).join("\n");
    const root = syntheticNode("SourceFile", "module", this.scope, code, this.statements);
    return createModule({
      filename: this.filename,
      source: "",
      root,
      state: "unbound",
      emitGenerated: options => ({
        code: normalizeGenerated(code, options),
        ...(options?.sourceMap ? { map: { version: 3 as const, file: this.filename, sources: [this.filename], sourcesContent: [code], names: [], mappings: code.split("\n").map(() => "AAAA").join(";") } } : {})
      })
    });
  }
}

export function moduleBuilder(filename: string): ModuleBuilder {
  return new ModuleBuilder(filename);
}

export function printNode(node: ExpressionNode): string {
  if (node.generatedText !== undefined) return node.generatedText;
  if (node.text !== undefined) return node.text;
  throw new Error(`Node ${node.kind} cannot be emitted without source or generated text`);
}

function normalizeGenerated(code: string, options?: EmitOptions): string {
  let output = code;
  if (options?.quote === "single") output = output.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_match, value: string) => `'${value.replace(/'/g, "\\'")}'`);
  if (options?.semicolons === false) output = output.replace(/;(?=\r?$)/gm, "");
  if (options?.newline === "crlf") output = output.replace(/\r?\n/g, "\r\n");
  return output;
}
