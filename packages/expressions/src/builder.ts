import type {
  EmitOptions,
  ExpressionNode,
  ExpressionScope,
  ExpressionSymbol,
  ExpressionType,
  ExpressionTypeKind,
  ScopeKind,
  Variable
} from "./model.js";
import { createModule, type UnboundModule } from "./module.js";
import { validateExpressionTree } from "./validation.js";

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
  readonly symbol: ExpressionSymbol;
  constructor(
    readonly name: string,
    readonly declarationKind: string,
    readonly scope: ExpressionScope,
    readonly type?: ExpressionType,
    readonly exported = false,
    readonly importedFrom?: string,
    readonly typeOnly = false
  ) { this.symbol = Object.freeze({ id: this.id, name }); }
}

function type(kind: ExpressionTypeKind, display: string = kind): ExpressionType {
  return Object.freeze({
    id: `synthetic-type:${kind}:${display}`,
    kind,
    display,
    nullable: kind === "null" || kind === "undefined" || kind === "unknown" || kind === "any",
    callable: kind === "function",
    properties: Object.freeze([]),
    unionMembers: Object.freeze([]),
    callSignatures: Object.freeze([]),
    typeArguments: Object.freeze([]),
    typeParameters: Object.freeze([])
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
  array(element: ExpressionType): ExpressionType { return type("object", `readonly ${element.display}[]`); }
  mutableArray(element: ExpressionType): ExpressionType { return type("object", `${element.display}[]`); }
  generic(name: string, ...arguments_: ExpressionType[]): ExpressionType {
    return type("object", `${name}<${arguments_.map(argument => argument.display).join(", ")}>`);
  }
  literal(value: string | number | bigint | boolean): ExpressionType {
    const display = typeof value === "string" ? JSON.stringify(value) : typeof value === "bigint" ? `${value}n` : String(value);
    return type(typeof value as ExpressionTypeKind, display);
  }
  nullable(value: ExpressionType): ExpressionType { return this.union(value, type("null")); }
  function(parameters: readonly ExpressionType[], returns: ExpressionType): ExpressionType {
    const display = `(${parameters.map((parameter, index) => `arg${index}: ${parameter.display}`).join(", ")}) => ${returns.display}`;
    return Object.freeze({
      ...type("function", display),
      callSignatures: Object.freeze([Object.freeze({
        display,
        parameters: Object.freeze(parameters.map((parameter, index) => Object.freeze({ name: `arg${index}`, type: parameter, optional: false, rest: false }))),
        returnType: returns,
        typeParameters: Object.freeze([])
      })])
    });
  }
  union(...members: ExpressionType[]): ExpressionType {
    return Object.freeze({
      id: `synthetic-type:union:${members.map(member => member.id).join("|")}`,
      kind: "union" as const,
      display: members.map(member => member.display).join(" | "),
      nullable: members.some(member => member.nullable),
      callable: members.every(member => member.callable),
      properties: Object.freeze([]),
      unionMembers: Object.freeze([...members]),
      callSignatures: Object.freeze([]),
      typeArguments: Object.freeze([]),
      typeParameters: Object.freeze([])
    });
  }
}

export interface FunctionOptions {
  readonly exported?: boolean;
  readonly async?: boolean;
  readonly generator?: boolean;
  readonly returnType?: ExpressionType;
  readonly typeParameters?: readonly string[];
}

export interface MethodOptions extends FunctionOptions {
  readonly static?: boolean;
  readonly access?: "public" | "protected" | "private";
}

export interface PropertyOptions {
  readonly static?: boolean;
  readonly readonly?: boolean;
  readonly optional?: boolean;
  readonly access?: "public" | "protected" | "private";
}

export interface ImportOptions {
  readonly typeOnly?: boolean;
  readonly aliases?: Readonly<Record<string, string>>;
}

function syntheticNode(
  kind: string,
  category: ExpressionNode["category"],
  scope: ExpressionScope,
  generatedText: string,
  children: readonly ExpressionNode[] = [],
  extra: Partial<ExpressionNode> & Readonly<Record<string, unknown>> = {}
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

export class BlockBuilder {
  private readonly statements: ExpressionNode[] = [];
  readonly scope: SyntheticScope;

  constructor(protected readonly module: ModuleBuilder, parent: ExpressionScope, kind: ScopeKind = "block") {
    this.scope = new SyntheticScope(kind, parent);
  }
  variable(name: string, initializer?: ExpressionNode, valueType?: ExpressionType, declaration: "const" | "let" = "const"): Variable {
    const variable = new SyntheticVariable(name, declaration, this.scope, valueType ?? initializer?.type);
    this.scope.add(variable);
    const annotation = variable.type ? `: ${variable.type.display}` : "";
    const text = `${declaration} ${name}${annotation}${initializer ? ` = ${printNode(initializer)}` : ""};`;
    this.statements.push(syntheticNode("VariableStatement", "statement", this.scope, text, initializer ? [initializer] : [], { variable }));
    return variable;
  }

  let(name: string, initializer?: ExpressionNode, valueType?: ExpressionType): Variable {
    return this.variable(name, initializer, valueType, "let");
  }

  expression(expression: ExpressionNode): this {
    this.statements.push(syntheticNode("ExpressionStatement", "statement", this.scope, `${printNode(expression)};`, [expression]));
    return this;
  }

  returns(expression?: ExpressionNode): this {
    this.statements.push(syntheticNode("ReturnStatement", "statement", this.scope, `return${expression ? ` ${printNode(expression)}` : ""};`, expression ? [expression] : []));
    return this;
  }

  throws(expression: ExpressionNode): this {
    this.statements.push(syntheticNode("ThrowStatement", "statement", this.scope, `throw ${printNode(expression)};`, [expression]));
    return this;
  }

  if(condition: ExpressionNode, whenTrue: (block: BlockBuilder) => void, whenFalse?: (block: BlockBuilder) => void): this {
    const truthy = new BlockBuilder(this.module, this.scope);
    whenTrue(truthy);
    const falsy = whenFalse ? new BlockBuilder(this.module, this.scope) : undefined;
    whenFalse?.(falsy!);
    const children = [condition, ...truthy.nodes(), ...(falsy?.nodes() ?? [])];
    const alternate = falsy ? ` else ${falsy.printBlock()}` : "";
    this.statements.push(syntheticNode("IfStatement", "statement", this.scope, `if (${printNode(condition)}) ${truthy.printBlock()}${alternate}`, children));
    return this;
  }

  forOf(name: string, iterable: ExpressionNode, configure: (block: BlockBuilder, item: Variable) => void, valueType?: ExpressionType): this {
    const block = new BlockBuilder(this.module, this.scope);
    const item = new SyntheticVariable(name, "const", block.scope, valueType);
    block.scope.add(item);
    configure(block, item);
    this.statements.push(syntheticNode("ForOfStatement", "statement", this.scope, `for (const ${name} of ${printNode(iterable)}) ${block.printBlock()}`, [iterable, ...block.nodes()], { variable: item }));
    return this;
  }

  while(condition: ExpressionNode, configure: (block: BlockBuilder) => void): this {
    const block = new BlockBuilder(this.module, this.scope);
    configure(block);
    this.statements.push(syntheticNode("WhileStatement", "statement", this.scope, `while (${printNode(condition)}) ${block.printBlock()}`, [condition, ...block.nodes()]));
    return this;
  }

  break(): this { this.statements.push(syntheticNode("BreakStatement", "statement", this.scope, "break;")); return this; }
  continue(): this { this.statements.push(syntheticNode("ContinueStatement", "statement", this.scope, "continue;")); return this; }

  nodes(): readonly ExpressionNode[] { return Object.freeze([...this.statements]); }
  printBlock(indent = "  "): string {
    const body = this.statements.map(statement => `${indent}${indentLines(printNode(statement), indent)}`).join("\n");
    return `{${body ? `\n${body}\n` : ""}}`;
  }
}

export class FunctionBuilder extends BlockBuilder {
  private readonly parameters: Variable[] = [];

  constructor(module: ModuleBuilder, parent: ExpressionScope) {
    super(module, parent, "function");
  }

  parameter(name: string, valueType?: ExpressionType): Variable {
    const variable = new SyntheticVariable(name, "parameter", this.scope, valueType);
    this.scope.add(variable);
    this.parameters.push(variable);
    return variable;
  }

  arrow(configure: (fn: FunctionBuilder) => ExpressionNode | void, options: Omit<FunctionOptions, "exported" | "generator"> = {}): ExpressionNode {
    return this.module.arrowIn(this.scope, configure, options);
  }

  build(name: string, options: FunctionOptions = {}): ExpressionNode {
    const params = this.parameters.map(variable => `${variable.name}${variable.type ? `: ${variable.type.display}` : ""}`).join(", ");
    const generics = options.typeParameters?.length ? `<${options.typeParameters.join(", ")}>` : "";
    const returnType = options.returnType ? `: ${options.returnType.display}` : "";
    const prefix = `${options.exported ? "export " : ""}${options.async ? "async " : ""}function${options.generator ? "*" : ""}`;
    return syntheticNode("FunctionDeclaration", "declaration", this.scope, `${prefix} ${name}${generics}(${params})${returnType} ${this.printBlock()}`, this.nodes(), {
      name,
      parameters: Object.freeze([...this.parameters]),
      captures: Object.freeze([])
    });
  }
}

export class ClassBuilder {
  readonly scope: SyntheticScope;
  private readonly members: ExpressionNode[] = [];

  constructor(private readonly module: ModuleBuilder, parent: ExpressionScope) {
    this.scope = new SyntheticScope("class", parent);
  }

  property(name: string, valueType?: ExpressionType, initializer?: ExpressionNode, options: PropertyOptions = {}): Variable {
    const variable = new SyntheticVariable(name, "property", this.scope, valueType ?? initializer?.type);
    this.scope.add(variable);
    const modifiers = `${options.access ? `${options.access} ` : ""}${options.static ? "static " : ""}${options.readonly ? "readonly " : ""}`;
    const annotation = valueType ? `: ${valueType.display}` : "";
    const text = `${modifiers}${name}${options.optional ? "?" : ""}${annotation}${initializer ? ` = ${printNode(initializer)}` : ""};`;
    this.members.push(syntheticNode("PropertyDeclaration", "declaration", this.scope, text, initializer ? [initializer] : [], { name, variable }));
    return variable;
  }

  method(name: string, configure: (method: FunctionBuilder) => void, options: MethodOptions = {}): this {
    const method = new FunctionBuilder(this.module, this.scope);
    configure(method);
    const declaration = method.build(name, { ...options, exported: false });
    const functionText = printNode(declaration);
    const start = functionText.indexOf("function");
    const signature = functionText.slice(start + "function".length).trimStart();
    const modifiers = `${options.access ? `${options.access} ` : ""}${options.static ? "static " : ""}${options.async ? "async " : ""}`;
    const methodText = `${modifiers}${signature.replace(/^\*?\s*/, options.generator ? "*" : "")}`;
    this.members.push(syntheticNode("MethodDeclaration", "declaration", method.scope, methodText, method.nodes(), {
      name,
      parameters: Object.freeze(method.scope.variables.filter(variable => variable.declarationKind === "parameter")),
      captures: Object.freeze([])
    }));
    return this;
  }

  build(name: string, exported: boolean, extendsExpression?: ExpressionNode): ExpressionNode {
    const extension = extendsExpression ? ` extends ${printNode(extendsExpression)}` : "";
    const body = this.members.map(member => `  ${indentLines(printNode(member), "  ")}`).join("\n");
    return syntheticNode("ClassDeclaration", "declaration", this.scope, `${exported ? "export " : ""}class ${name}${extension} {${body ? `\n${body}\n` : ""}}`, this.members, { name });
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

  /** Declares a project- or lib-resolved symbol without emitting a declaration. */
  ambient(name: string, valueType?: ExpressionType): Variable {
    const variable = new SyntheticVariable(name, "ambient", this.scope, valueType);
    this.scope.add(variable);
    return variable;
  }

  import(names: readonly string[], from: string, options: ImportOptions = {}): readonly Variable[] {
    const variables = names.map(importedName => {
      const name = options.aliases?.[importedName] ?? importedName;
      const variable = new SyntheticVariable(name, "import", this.scope, undefined, false, from, options.typeOnly ?? false);
      this.scope.add(variable);
      return variable;
    });
    const bindings = names.map(name => options.aliases?.[name] ? `${name} as ${options.aliases[name]}` : name);
    this.statements.push(syntheticNode("ImportDeclaration", "declaration", this.scope, `import${options.typeOnly ? " type" : ""} { ${bindings.join(", ")} } from ${JSON.stringify(from)};`, [], { name: from }));
    return variables;
  }

  exportFunction(name: string, configure: (fn: FunctionBuilder) => void): this {
    return this.function(name, configure, { exported: true });
  }

  function(name: string, configure: (fn: FunctionBuilder) => void, options: FunctionOptions = {}): this {
    const variable = new SyntheticVariable(name, "function", this.scope, type("function", `typeof ${name}`), true);
    this.scope.add(variable);
    const fn = new FunctionBuilder(this, this.scope);
    configure(fn);
    this.statements.push(Object.freeze({ ...fn.build(name, options), variable }));
    return this;
  }

  exportClass(name: string, configure: (value: ClassBuilder) => void, extendsExpression?: ExpressionNode): this {
    const variable = new SyntheticVariable(name, "class", this.scope, type("function", `typeof ${name}`), true);
    this.scope.add(variable);
    const value = new ClassBuilder(this, this.scope);
    configure(value);
    this.statements.push(Object.freeze({ ...value.build(name, true, extendsExpression), variable }));
    return this;
  }

  exportConst(name: string, initializer: ExpressionNode, valueType?: ExpressionType): Variable {
    const variable = new SyntheticVariable(name, "const", this.scope, valueType ?? initializer.type, true);
    this.scope.add(variable);
    const annotation = valueType ? `: ${valueType.display}` : "";
    this.statements.push(syntheticNode("VariableStatement", "declaration", this.scope, `export const ${name}${annotation} = ${printNode(initializer)};`, [initializer], { name, variable }));
    return variable;
  }

  literal(value: string | number | bigint | boolean | null | undefined): ExpressionNode {
    const valueType = value === null ? type("null") : value === undefined ? type("undefined") : type(typeof value as ExpressionTypeKind);
    const text = typeof value === "string" ? JSON.stringify(value) : typeof value === "bigint" ? `${value}n` : value === undefined ? "undefined" : String(value);
    return syntheticNode("LiteralExpression", "expression", this.scope, text, [], { type: valueType, text });
  }

  reference(variable: Variable): ExpressionNode {
    return syntheticNode("Identifier", "expression", variable.scope, variable.name, [], { name: variable.name, variable, type: variable.type });
  }

  thisValue(): ExpressionNode {
    return syntheticNode("ThisKeyword", "expression", this.scope, "this");
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

  element(target: ExpressionNode, index: ExpressionNode): ExpressionNode {
    return syntheticNode("ElementAccessExpression", "expression", this.scope, `${printNode(target)}[${printNode(index)}]`, [target, index]);
  }

  conditional(condition: ExpressionNode, whenTrue: ExpressionNode, whenFalse: ExpressionNode, valueType?: ExpressionType): ExpressionNode {
    return syntheticNode("ConditionalExpression", "expression", this.scope, `${printNode(condition)} ? ${printNode(whenTrue)} : ${printNode(whenFalse)}`, [condition, whenTrue, whenFalse], { type: valueType });
  }

  unary(operator: string, operand: ExpressionNode, valueType?: ExpressionType): ExpressionNode {
    return syntheticNode("PrefixUnaryExpression", "expression", this.scope, `${operator}${printNode(operand)}`, [operand], { operator, type: valueType });
  }

  assignment(target: ExpressionNode, value: ExpressionNode, operator = "="): ExpressionNode {
    return syntheticNode("BinaryExpression", "expression", this.scope, `${printNode(target)} ${operator} ${printNode(value)}`, [target, value], { operator, type: value.type });
  }

  array(...items: ExpressionNode[]): ExpressionNode {
    return syntheticNode("ArrayLiteralExpression", "expression", this.scope, `[${items.map(printNode).join(", ")}]`, items);
  }

  object(properties: Readonly<Record<string, ExpressionNode>>): ExpressionNode {
    const children = Object.values(properties);
    const text = `{ ${Object.entries(properties).map(([name, value]) => `${safePropertyName(name)}: ${printNode(value)}`).join(", ")} }`;
    return syntheticNode("ObjectLiteralExpression", "expression", this.scope, text, children);
  }

  await(value: ExpressionNode): ExpressionNode {
    return syntheticNode("AwaitExpression", "expression", this.scope, `await ${printNode(value)}`, [value]);
  }

  construct(target: ExpressionNode, ...args: ExpressionNode[]): ExpressionNode {
    return Object.freeze({
      ...syntheticNode("NewExpression", "expression", this.scope, `new ${printNode(target)}(${args.map(printNode).join(", ")})`, [target, ...args]),
      target,
      arguments: Object.freeze(args)
    });
  }

  arrow(configure: (fn: FunctionBuilder) => ExpressionNode | void, options: Omit<FunctionOptions, "exported" | "generator"> = {}): ExpressionNode {
    return this.arrowIn(this.scope, configure, options);
  }

  arrowIn(parent: ExpressionScope, configure: (fn: FunctionBuilder) => ExpressionNode | void, options: Omit<FunctionOptions, "exported" | "generator"> = {}): ExpressionNode {
    const fn = new FunctionBuilder(this, parent);
    const returned = configure(fn);
    if (returned) fn.returns(returned);
    const params = fn.scope.variables.filter(variable => variable.declarationKind === "parameter").map(variable => `${variable.name}${variable.type ? `: ${variable.type.display}` : ""}`).join(", ");
    const returnType = options.returnType ? `: ${options.returnType.display}` : "";
    return syntheticNode("ArrowFunction", "expression", fn.scope, `${options.async ? "async " : ""}(${params})${returnType} => ${fn.printBlock()}`, fn.nodes(), {
      parameters: Object.freeze(fn.scope.variables.filter(variable => variable.declarationKind === "parameter")),
      captures: Object.freeze([])
    });
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
      diagnostics: validateExpressionTree(root, this.filename),
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

function indentLines(text: string, indent: string): string {
  return text.replace(/\n/g, `\n${indent}`);
}

function safePropertyName(name: string): string {
  return /^[$A-Z_a-z][$\w]*$/.test(name) ? name : JSON.stringify(name);
}
