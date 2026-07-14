import type { ExpressionNode } from "./model.js";
import type { NodeRef } from "./query.js";

export interface ControlFlowNode {
  readonly id: string;
  readonly expression: ExpressionNode;
  readonly successors: readonly string[];
  readonly predecessors: readonly string[];
  readonly terminal: boolean;
}

export interface ControlFlowGraph {
  readonly owner: ExpressionNode;
  readonly entry?: string;
  readonly exits: readonly string[];
  readonly nodes: readonly ControlFlowNode[];
  readonly byId: ReadonlyMap<string, ControlFlowNode>;
}

interface MutableFlowNode {
  readonly id: string;
  readonly expression: ExpressionNode;
  readonly successors: Set<string>;
  readonly predecessors: Set<string>;
  terminal: boolean;
}

interface Fragment {
  readonly entry?: string;
  readonly exits: readonly string[];
  readonly terminals: readonly string[];
  readonly breaks?: readonly string[];
  readonly continues?: readonly string[];
}

const cache = new WeakMap<ExpressionNode, ControlFlowGraph>();

/** Builds a statement-level CFG without exposing the TypeScript compiler graph. */
export function buildControlFlowGraph(owner: NodeRef): ControlFlowGraph {
  const cached = cache.get(owner.node);
  if (cached) return cached;
  const nodes = new Map<string, MutableFlowNode>();
  const addNode = (expression: ExpressionNode): MutableFlowNode => {
    const id = `${expression.id}:flow`;
    let result = nodes.get(id);
    if (!result) {
      result = { id, expression, successors: new Set(), predecessors: new Set(), terminal: false };
      nodes.set(id, result);
    }
    return result;
  };
  const connect = (from: string, to: string): void => {
    nodes.get(from)?.successors.add(to);
    nodes.get(to)?.predecessors.add(from);
  };

  const sequence = (values: readonly ExpressionNode[]): Fragment => {
    let entry: string | undefined;
    let exits: readonly string[] = [];
    const terminals: string[] = [];
    const breaks: string[] = [];
    const continues: string[] = [];
    for (const value of values) {
      const next = fragment(value);
      if (!next.entry) continue;
      if (!entry) entry = next.entry;
      for (const exit of exits) connect(exit, next.entry);
      exits = next.exits;
      terminals.push(...next.terminals);
      breaks.push(...(next.breaks ?? []));
      continues.push(...(next.continues ?? []));
      // Abrupt completion cannot flow into the following statement.
      if (next.breaks?.length || next.continues?.length) exits = [];
    }
    return { entry, exits, terminals, breaks, continues };
  };

  const fragment = (expression: ExpressionNode): Fragment => {
    if (expression.kind === "Block" || expression.kind === "SourceFile" || expression.kind === "ModuleBlock") {
      return sequence(expression.children.filter(isExecutable));
    }
    if (expression.kind === "IfStatement") {
      const decision = addNode(expression);
      const branches = expression.children.filter(child => child.category === "statement" || child.kind === "Block");
      const whenTrue = branches[0] ? fragment(branches[0]) : undefined;
      const whenFalse = branches[1] ? fragment(branches[1]) : undefined;
      if (whenTrue?.entry) connect(decision.id, whenTrue.entry);
      if (whenFalse?.entry) connect(decision.id, whenFalse.entry);
      return {
        entry: decision.id,
        exits: [...(whenTrue?.exits ?? [decision.id]), ...(whenFalse?.exits ?? [decision.id])],
        terminals: [...(whenTrue?.terminals ?? []), ...(whenFalse?.terminals ?? [])],
        breaks: [...(whenTrue?.breaks ?? []), ...(whenFalse?.breaks ?? [])],
        continues: [...(whenTrue?.continues ?? []), ...(whenFalse?.continues ?? [])]
      };
    }
    if (isLoop(expression.kind)) {
      const loop = addNode(expression);
      const body = [...expression.children].reverse().find(child => child.category === "statement" || child.kind === "Block");
      const contents = body ? fragment(body) : undefined;
      if (contents?.entry) connect(loop.id, contents.entry);
      for (const exit of contents?.exits ?? []) connect(exit, loop.id);
      for (const continuation of contents?.continues ?? []) connect(continuation, loop.id);
      return { entry: loop.id, exits: [loop.id, ...(contents?.breaks ?? [])], terminals: contents?.terminals ?? [] };
    }
    if (expression.kind === "SwitchStatement") {
      const branch = addNode(expression);
      const caseBlock = expression.children.find(child => child.kind === "CaseBlock");
      const clauses = caseBlock?.children.filter(child => child.kind === "CaseClause" || child.kind === "DefaultClause") ?? [];
      const parts = clauses.map(fragment);
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index]!;
        if (part.entry) connect(branch.id, part.entry);
        const next = parts[index + 1]?.entry;
        if (next) for (const exit of part.exits) connect(exit, next);
      }
      return {
        entry: branch.id,
        exits: [branch.id, ...(parts.at(-1)?.exits ?? []), ...parts.flatMap(part => part.breaks ?? [])],
        terminals: parts.flatMap(part => part.terminals)
      };
    }
    if (expression.kind === "TryStatement") {
      const branch = addNode(expression);
      const tryBlock = expression.children.find(child => child.kind === "Block");
      const catchClause = expression.children.find(child => child.kind === "CatchClause");
      const blocks = expression.children.filter(child => child.kind === "Block");
      const finallyBlock = blocks.length > 1 ? blocks.at(-1) : undefined;
      const attempted = tryBlock ? fragment(tryBlock) : undefined;
      const caught = catchClause ? fragment(catchClause) : undefined;
      if (attempted?.entry) connect(branch.id, attempted.entry);
      if (caught?.entry) connect(branch.id, caught.entry);
      const incoming = [...(attempted?.exits ?? [branch.id]), ...(caught?.exits ?? []),
        ...(attempted?.terminals ?? []), ...(caught?.terminals ?? [])];
      if (!finallyBlock) return {
        entry: branch.id,
        exits: [...(attempted?.exits ?? [branch.id]), ...(caught?.exits ?? [])],
        terminals: [...(attempted?.terminals ?? []), ...(caught?.terminals ?? [])],
        breaks: [...(attempted?.breaks ?? []), ...(caught?.breaks ?? [])],
        continues: [...(attempted?.continues ?? []), ...(caught?.continues ?? [])]
      };
      const finalizer = fragment(finallyBlock);
      if (finalizer.entry) for (const from of incoming) connect(from, finalizer.entry);
      return { entry: branch.id, exits: finalizer.exits, terminals: finalizer.terminals,
        breaks: finalizer.breaks, continues: finalizer.continues };
    }
    if (expression.kind === "CatchClause" || expression.kind === "CaseBlock" || expression.kind === "CaseClause" || expression.kind === "DefaultClause") {
      return sequence(expression.children.filter(isExecutable));
    }
    const current = addNode(expression);
    const terminal = expression.kind === "ReturnStatement" || expression.kind === "ThrowStatement";
    current.terminal = terminal;
    if (expression.kind === "BreakStatement") return { entry: current.id, exits: [], terminals: [], breaks: [current.id] };
    if (expression.kind === "ContinueStatement") return { entry: current.id, exits: [], terminals: [], continues: [current.id] };
    return { entry: current.id, exits: terminal ? [] : [current.id], terminals: terminal ? [current.id] : [] };
  };

  const body = functionBody(owner.node) ?? owner.node;
  const result = fragment(body);
  const exitIds = Object.freeze([...new Set([...result.exits, ...result.terminals])]);
  const immutableNodes = Object.freeze([...nodes.values()].map(node => Object.freeze({
    id: node.id,
    expression: node.expression,
    successors: Object.freeze([...node.successors]),
    predecessors: Object.freeze([...node.predecessors]),
    terminal: node.terminal
  })));
  const graph = Object.freeze({
    owner: owner.node,
    ...(result.entry ? { entry: result.entry } : {}),
    exits: exitIds,
    nodes: immutableNodes,
    byId: readonlyMap(immutableNodes.map(node => [node.id, node] as const))
  });
  cache.set(owner.node, graph);
  return graph;
}

function functionBody(owner: ExpressionNode): ExpressionNode | undefined {
  if (!["FunctionDeclaration", "FunctionExpression", "ArrowFunction", "MethodDeclaration", "GetAccessor", "SetAccessor"].includes(owner.kind)) return undefined;
  return [...owner.children].reverse().find(child => child.kind === "Block" || child.category === "expression");
}

function isExecutable(node: ExpressionNode): boolean {
  return node.category === "statement" || node.category === "declaration"
    || node.kind === "Block" || node.kind === "CaseClause" || node.kind === "DefaultClause" || node.kind === "CatchClause";
}

function isLoop(kind: string): boolean {
  return kind === "ForStatement" || kind === "ForInStatement" || kind === "ForOfStatement"
    || kind === "WhileStatement" || kind === "DoStatement";
}

function readonlyMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const values = new Map(entries);
  return Object.freeze({
    get size() { return values.size; },
    get: (key: K) => values.get(key),
    has: (key: K) => values.has(key),
    entries: () => values.entries(),
    keys: () => values.keys(),
    values: () => values.values(),
    forEach: (callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) => {
      values.forEach((value, key) => callback.call(thisArg, value, key, values));
    },
    [Symbol.iterator]: () => values[Symbol.iterator]()
  });
}
