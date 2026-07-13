import type {
  EmitOptions,
  EmitResult,
  ExpressionDiagnostic,
  ExpressionNode,
  NodeEffect,
  Variable,
  WalkOptions
} from "./model.js";
import { buildParentIndex, NodeQuery, NodeRef, type ParentIndex } from "./query.js";
import { buildControlFlowGraph, type ControlFlowGraph } from "./control-flow.js";

export type ModuleState = "bound" | "unbound";

export interface SourceTrivia {
  readonly newline: "lf" | "crlf";
  readonly quote: "single" | "double";
  readonly shebang?: string;
  readonly directives: readonly string[];
}

export interface ModuleData {
  readonly filename: string;
  readonly source: string;
  readonly root: ExpressionNode;
  readonly state: ModuleState;
  readonly diagnostics?: readonly ExpressionDiagnostic[];
  readonly trivia?: SourceTrivia;
  readonly emitGenerated?: (options?: EmitOptions) => EmitResult;
  readonly provenance?: SourceProvenance;
}

export interface SourceProvenance {
  readonly originalSource: string;
  readonly lineOrigins: readonly number[];
}

let nextVersion = 1;
const analysisCache = new WeakMap<ExpressionModule, Readonly<{ effects: readonly NodeEffect[]; captures: ReadonlyMap<ExpressionNode, readonly Variable[]> }>>();
const defaultWalkCache = new WeakMap<ExpressionModule, readonly NodeRef[]>();
const subtreeEffectsCache = new WeakMap<ExpressionNode, readonly NodeEffect[]>();
const captureCache = new WeakMap<ExpressionNode, readonly Variable[]>();

/** Immutable, versioned expression module. */
export class ExpressionModule<S extends ModuleState = ModuleState> {
  readonly version = nextVersion++;
  readonly filename: string;
  readonly source: string;
  readonly rootNode: ExpressionNode;
  readonly state: S;
  readonly diagnostics: readonly ExpressionDiagnostic[];
  readonly trivia: SourceTrivia;
  private readonly emitGenerated?: (options?: EmitOptions) => EmitResult;
  readonly provenance?: SourceProvenance;
  private readonly parents: ParentIndex;

  constructor(data: ModuleData & { state: S }) {
    this.filename = data.filename;
    this.source = data.source;
    this.rootNode = data.root;
    this.state = data.state;
    this.diagnostics = Object.freeze([...(data.diagnostics ?? [])]);
    this.trivia = data.trivia ?? detectTrivia(data.source);
    this.emitGenerated = data.emitGenerated;
    this.provenance = data.provenance;
    this.parents = buildParentIndex(data.root);
    Object.freeze(this);
  }

  get root(): NodeRef {
    return new NodeRef(this.rootNode, this.parents);
  }

  walk(options?: WalkOptions): NodeQuery {
    if (options !== undefined) return this.root.walk(options);
    const module = this;
    return new NodeQuery(() => defaultWalk(module));
  }

  ref(node: ExpressionNode): NodeRef {
    if (!this.parents.has(node)) throw new Error("Node does not belong to this expression module version");
    return new NodeRef(node, this.parents);
  }

  effects(): readonly NodeEffect[] {
    return getAnalyses(this).effects;
  }

  effectsOf(node: ExpressionNode | NodeRef): readonly NodeEffect[] {
    const target = node instanceof NodeRef ? node.node : node;
    if (!this.parents.has(target)) throw new Error("Node does not belong to this expression module version");
    const cached = subtreeEffectsCache.get(target);
    if (cached) return cached;
    const effects = Object.freeze(getAnalyses(this).effects.filter(effect => isWithin(effect.node, target)));
    subtreeEffectsCache.set(target, effects);
    return effects;
  }

  dependenciesOf(node: ExpressionNode | NodeRef): readonly Variable[] {
    return Object.freeze([...new Set(this.effectsOf(node)
      .filter(effect => effect.kind === "read")
      .map(effect => effect.variable))]);
  }

  writesOf(node: ExpressionNode | NodeRef): readonly Variable[] {
    return Object.freeze([...new Set(this.effectsOf(node)
      .filter(effect => effect.kind === "write")
      .map(effect => effect.variable))]);
  }

  capturesOf(functionNode: ExpressionNode | NodeRef): readonly Variable[] {
    const target = functionNode instanceof NodeRef ? functionNode.node : functionNode;
    const cached = captureCache.get(target);
    if (cached) return cached;
    const captures = getAnalyses(this).captures.get(target) ?? Object.freeze([]);
    captureCache.set(target, captures);
    return captures;
  }

  controlFlowOf(functionNode: ExpressionNode | NodeRef): ControlFlowGraph {
    const reference = functionNode instanceof NodeRef ? functionNode : this.ref(functionNode);
    return buildControlFlowGraph(reference);
  }

  validate(): readonly ExpressionDiagnostic[] {
    return this.diagnostics;
  }

  emit(options: EmitOptions = {}): EmitResult {
    if (options.format === "generated" && this.emitGenerated) return this.emitGenerated(options);
    if (this.emitGenerated && !this.source) return this.emitGenerated(options);
    const newline = options.newline === "crlf" ? "\r\n" : options.newline === "lf" ? "\n" : undefined;
    const code = newline ? this.source.replace(/\r?\n/g, newline) : this.source;
    return {
      code,
      ...(options.sourceMap ? { map: sourceMap(this.filename, this.provenance?.originalSource ?? this.source, code, this.provenance?.lineOrigins) } : {})
    };
  }
}

function defaultWalk(module: ExpressionModule): readonly NodeRef[] {
  const cached = defaultWalkCache.get(module);
  if (cached) return cached;
  const references = Object.freeze(module.root.walk().toArray());
  defaultWalkCache.set(module, references);
  return references;
}

export type BoundModule = ExpressionModule<"bound">;
export type UnboundModule = ExpressionModule<"unbound">;

export function createModule<S extends ModuleState>(data: ModuleData & { state: S }): ExpressionModule<S> {
  return new ExpressionModule(data);
}

function getAnalyses(module: ExpressionModule): Readonly<{ effects: readonly NodeEffect[]; captures: ReadonlyMap<ExpressionNode, readonly Variable[]> }> {
  const cached = analysisCache.get(module);
  if (cached) return cached;
  const effects: NodeEffect[] = [];
  const captures = new Map<ExpressionNode, Variable[]>();
  const functions: ExpressionNode[] = [];

  const visit = (ref: NodeRef, inType = false): void => {
    const node = ref.node;
    const typeMetadata = inType || node.category === "type";
    const functionLike = isFunctionKind(node.kind);
    if (functionLike) functions.push(node);
    if (!typeMetadata && node.variable && (node.kind === "Identifier" || node.kind === "ThisKeyword")) {
      const kinds = referenceEffectKinds(ref);
      for (const kind of kinds) effects.push(Object.freeze({ node, variable: node.variable, kind }));
      const owner = functions[functions.length - 1];
      if (owner && !scopeContains(owner.scope, node.variable.scope)) {
        const values = captures.get(owner) ?? [];
        if (!values.includes(node.variable)) values.push(node.variable);
        captures.set(owner, values);
        effects.push(Object.freeze({ node, variable: node.variable, kind: "capture" }));
      }
    }
    for (const child of ref.children()) visit(child, typeMetadata);
    if (functionLike) functions.pop();
  };
  visit(module.root);
  const frozenCaptures = new Map<ExpressionNode, readonly Variable[]>();
  for (const [node, values] of captures) frozenCaptures.set(node, Object.freeze([...values]));
  for (const [node, values] of frozenCaptures) captureCache.set(node, values);
  const result = Object.freeze({ effects: Object.freeze(effects), captures: frozenCaptures as ReadonlyMap<ExpressionNode, readonly Variable[]> });
  analysisCache.set(module, result);
  return result;
}

function referenceEffectKinds(ref: NodeRef): readonly ("read" | "write")[] {
  let child = ref.node;
  for (const ancestor of ref.ancestors()) {
    const node = ancestor.node;
    if ((node.kind === "VariableDeclaration" || node.kind === "Parameter" || node.kind === "BindingElement") && isWithin(child, node.children[0]!)) {
      return ["write"];
    }
    if (node.kind === "BinaryExpression" && isWithin(child, node.children[0]!) && assignmentOperators.has(node.operator ?? "")) {
      return node.operator === "=" ? ["write"] : ["read", "write"];
    }
    if ((node.kind === "PrefixUnaryExpression" || node.kind === "PostfixUnaryExpression") && /\+\+|--/.test(node.operator ?? "")) {
      return ["read", "write"];
    }
    if (node.kind === "DeleteExpression") return ["write"];
    if (isFunctionKind(node.kind) || node.kind.endsWith("Statement")) break;
    child = node;
  }
  return ["read"];
}

const assignmentOperators = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??="]);

function isWithin(node: ExpressionNode, ancestor: ExpressionNode): boolean {
  if (node === ancestor) return true;
  if (node.span && ancestor.span) return node.span.start >= ancestor.span.start && node.span.end <= ancestor.span.end;
  return ancestor.children.some(child => isWithin(node, child));
}

function isFunctionKind(kind: string): boolean {
  return kind === "FunctionDeclaration" || kind === "FunctionExpression" || kind === "ArrowFunction" || kind === "MethodDeclaration";
}

function scopeContains(functionScope: ExpressionNode["scope"], variableScope: ExpressionNode["scope"]): boolean {
  let cursor: ExpressionNode["scope"] | undefined = variableScope;
  while (cursor) {
    if (cursor === functionScope) return true;
    cursor = cursor.parent;
  }
  return false;
}

function detectTrivia(source: string): SourceTrivia {
  const single = (source.match(/'/g) ?? []).length;
  const double = (source.match(/"/g) ?? []).length;
  const shebang = source.startsWith("#!") ? source.slice(0, source.indexOf("\n") < 0 ? source.length : source.indexOf("\n")) : undefined;
  const directives = [...source.matchAll(/^[ \t]*(["'])([^"'\r\n]+)\1;?/gm)].map(match => match[2]!);
  return Object.freeze({
    newline: source.includes("\r\n") ? "crlf" : "lf",
    quote: single > double ? "single" : "double",
    ...(shebang ? { shebang } : {}),
    directives: Object.freeze(directives)
  });
}

function sourceMap(filename: string, source: string, code: string, lineOrigins?: readonly number[]): EmitResult["map"] {
  const lines = code.split(/\r?\n/).length;
  const sourceLines = source.split(/\r?\n/).length;
  let priorOriginalLine = 0;
  const mappings: string[] = [];
  for (let line = 0; line < lines; line++) {
    const originalLine = lineOrigins?.[line] ?? Math.min(line, Math.max(0, sourceLines - 1));
    mappings.push(`${vlq(0)}${vlq(0)}${vlq(originalLine - priorOriginalLine)}${vlq(0)}`);
    priorOriginalLine = originalLine;
  }
  return Object.freeze({
    version: 3 as const,
    file: filename,
    sources: Object.freeze([filename]),
    sourcesContent: Object.freeze([source]),
    names: Object.freeze([]),
    mappings: mappings.join(";")
  });
}

const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vlq(value: number): string {
  let encoded = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let output = "";
  do {
    let digit = encoded & 31;
    encoded >>>= 5;
    if (encoded) digit |= 32;
    output += base64[digit];
  } while (encoded);
  return output;
}
