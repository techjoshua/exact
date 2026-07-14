import type { ExpressionNode } from "./model.js";
import type { NodeRef } from "./query.js";

export interface ControlFlowNode {
  readonly id: string;
  readonly expression: ExpressionNode;
  readonly successors: readonly string[];
  readonly predecessors: readonly string[];
  readonly successorEdges: readonly Readonly<{ target: string; kind: "normal" | "branch" | "exception" | "finally" }> [];
  readonly completion: "normal" | "return" | "throw" | "break" | "continue";
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
  readonly edgeKinds: Map<string, "normal" | "branch" | "exception" | "finally">;
  readonly predecessors: Set<string>;
  terminal: boolean;
}

interface Fragment {
  readonly entry?: string;
  readonly exits: readonly string[];
  readonly terminals: readonly string[];
  readonly breaks?: readonly Jump[];
  readonly continues?: readonly Jump[];
}

interface Jump { readonly id: string; readonly label?: string }

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
      result = { id, expression, successors: new Set(), edgeKinds: new Map(), predecessors: new Set(), terminal: false };
      nodes.set(id, result);
    }
    return result;
  };
  const connect = (from: string, to: string, kind: "normal" | "branch" | "exception" | "finally" = "normal"): void => {
    nodes.get(from)?.successors.add(to);
    nodes.get(from)?.edgeKinds.set(to, kind);
    nodes.get(to)?.predecessors.add(from);
  };

  const sequence = (values: readonly ExpressionNode[]): Fragment => {
    let entry: string | undefined;
    let exits: readonly string[] = [];
    const terminals: string[] = [];
    const breaks: Jump[] = [];
    const continues: Jump[] = [];
    let reachable = true;
    for (const value of values) {
      const next = fragment(value);
      if (!next.entry) continue;
      if (!reachable) continue;
      if (!entry) entry = next.entry;
      for (const exit of exits) connect(exit, next.entry);
      exits = next.exits;
      terminals.push(...next.terminals);
      breaks.push(...(next.breaks ?? []));
      continues.push(...(next.continues ?? []));
      // Abrupt completion cannot make a later statement reachable. We still
      // materialize unreachable nodes above, but never expose them as exits.
      if (!exits.length && (next.terminals.length || next.breaks?.length || next.continues?.length)) reachable = false;
    }
    return { entry, exits, terminals, breaks, continues };
  };

  const fragment = (expression: ExpressionNode, activeLabel?: string): Fragment => {
    if (expression.kind === "Block" || expression.kind === "SourceFile" || expression.kind === "ModuleBlock") {
      return sequence(expression.children.filter(isExecutable));
    }
    if (expression.kind === "IfStatement") {
      const decision = addNode(expression);
      const branches = expression.children.filter(child => child.category === "statement" || child.kind === "Block");
      const whenTrue = branches[0] ? fragment(branches[0]) : undefined;
      const whenFalse = branches[1] ? fragment(branches[1]) : undefined;
      if (whenTrue?.entry) connect(decision.id, whenTrue.entry, "branch");
      if (whenFalse?.entry) connect(decision.id, whenFalse.entry, "branch");
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
      const consumedContinues = (contents?.continues ?? []).filter(jump => !jump.label || jump.label === activeLabel);
      const consumedBreaks = (contents?.breaks ?? []).filter(jump => !jump.label || jump.label === activeLabel);
      for (const continuation of consumedContinues) connect(continuation.id, loop.id);
      return {
        entry: loop.id,
        exits: [loop.id, ...consumedBreaks.map(jump => jump.id)],
        terminals: contents?.terminals ?? [],
        breaks: (contents?.breaks ?? []).filter(jump => jump.label && jump.label !== activeLabel),
        continues: (contents?.continues ?? []).filter(jump => jump.label && jump.label !== activeLabel)
      };
    }
    if (expression.kind === "SwitchStatement") {
      const branch = addNode(expression);
      const caseBlock = expression.children.find(child => child.kind === "CaseBlock");
      const clauses = caseBlock?.children.filter(child => child.kind === "CaseClause" || child.kind === "DefaultClause") ?? [];
      const parts = clauses.map(clause => fragment(clause));
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index]!;
        if (part.entry) connect(branch.id, part.entry);
        const next = parts[index + 1]?.entry;
        if (next) for (const exit of part.exits) connect(exit, next);
      }
      return {
        entry: branch.id,
        exits: [branch.id, ...(parts.at(-1)?.exits ?? []),
          ...parts.flatMap(part => (part.breaks ?? []).filter(jump => !jump.label).map(jump => jump.id))],
        terminals: parts.flatMap(part => part.terminals),
        breaks: parts.flatMap(part => (part.breaks ?? []).filter(jump => !!jump.label)),
        continues: parts.flatMap(part => part.continues ?? [])
      };
    }
    if (expression.kind === "LabeledStatement") {
      const label = expression.children.find(child => child.kind === "Identifier")?.name;
      const body = [...expression.children].reverse().find(isExecutable);
      if (!body) return { exits: [], terminals: [] };
      const contents = fragment(body, label);
      const consumed = (contents.breaks ?? []).filter(jump => jump.label === label);
      return {
        ...contents,
        exits: [...contents.exits, ...consumed.map(jump => jump.id)],
        breaks: (contents.breaks ?? []).filter(jump => jump.label !== label)
      };
    }
    if (expression.kind === "TryStatement") {
      const branch = addNode(expression);
      const tryBlock = expression.children.find(child => child.kind === "Block");
      const catchClause = expression.children.find(child => child.kind === "CatchClause");
      const blocks = expression.children.filter(child => child.kind === "Block");
      const finallyBlock = blocks.length > 1 ? blocks.at(-1) : undefined;
      const beforeAttempt = new Set(nodes.keys());
      const attempted = tryBlock ? fragment(tryBlock) : undefined;
      const attemptedNodes = [...nodes.keys()].filter(id => !beforeAttempt.has(id));
      const caught = catchClause ? fragment(catchClause) : undefined;
      if (attempted?.entry) connect(branch.id, attempted.entry);
      if (caught?.entry) {
        // Any executable operation in the try may throw. The catch is not a
        // normal branch from the try statement itself.
        for (const id of attemptedNodes) connect(id, caught.entry, "exception");
      }
      const incoming = [...(attempted?.exits ?? [branch.id]), ...(caught?.exits ?? []),
        ...(attempted?.terminals ?? []), ...(caught?.terminals ?? []),
        ...(attempted?.breaks ?? []).map(jump => jump.id), ...(caught?.breaks ?? []).map(jump => jump.id),
        ...(attempted?.continues ?? []).map(jump => jump.id), ...(caught?.continues ?? []).map(jump => jump.id)];
      if (!finallyBlock) return {
        entry: branch.id,
        exits: [...(attempted?.exits ?? [branch.id]), ...(caught?.exits ?? [])],
        terminals: [...(attempted?.terminals ?? []), ...(caught?.terminals ?? [])],
        breaks: [...(attempted?.breaks ?? []), ...(caught?.breaks ?? [])],
        continues: [...(attempted?.continues ?? []), ...(caught?.continues ?? [])]
      };
      const finalizer = fragment(finallyBlock);
      if (!finalizer.entry) return {
        entry: branch.id,
        exits: [...(attempted?.exits ?? [branch.id]), ...(caught?.exits ?? [])],
        terminals: [...(attempted?.terminals ?? []), ...(caught?.terminals ?? [])],
        breaks: [...(attempted?.breaks ?? []), ...(caught?.breaks ?? [])],
        continues: [...(attempted?.continues ?? []), ...(caught?.continues ?? [])]
      };
      if (finalizer.entry) for (const from of incoming) connect(from, finalizer.entry, "finally");
      const finalizerAbrupt = finalizer.terminals.length || finalizer.breaks?.length || finalizer.continues?.length;
      if (finalizerAbrupt) return { entry: branch.id, exits: finalizer.exits, terminals: finalizer.terminals,
        breaks: finalizer.breaks, continues: finalizer.continues };
      const normalIncoming = (attempted?.exits.length ?? 1) + (caught?.exits.length ?? 0) > 0;
      return {
        entry: branch.id,
        exits: normalIncoming ? finalizer.exits : [],
        terminals: [...(attempted?.terminals ?? []), ...(caught?.terminals ?? [])],
        breaks: [...(attempted?.breaks ?? []), ...(caught?.breaks ?? [])]
          .flatMap(jump => finalizer.exits.map(id => ({ id, ...(jump.label ? { label: jump.label } : {}) }))),
        continues: [...(attempted?.continues ?? []), ...(caught?.continues ?? [])]
          .flatMap(jump => finalizer.exits.map(id => ({ id, ...(jump.label ? { label: jump.label } : {}) })))
      };
    }
    if (expression.kind === "CatchClause" || expression.kind === "CaseBlock" || expression.kind === "CaseClause" || expression.kind === "DefaultClause") {
      return sequence(expression.children.filter(isExecutable));
    }
    const current = addNode(expression);
    const terminal = expression.kind === "ReturnStatement" || expression.kind === "ThrowStatement";
    current.terminal = terminal;
    if (expression.kind === "BreakStatement") return { entry: current.id, exits: [], terminals: [], breaks: [{ id: current.id, ...jumpLabel(expression) }] };
    if (expression.kind === "ContinueStatement") return { entry: current.id, exits: [], terminals: [], continues: [{ id: current.id, ...jumpLabel(expression) }] };
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
    successorEdges: Object.freeze([...node.edgeKinds].map(([target, kind]) => Object.freeze({ target, kind }))),
    completion: node.expression.kind === "ReturnStatement" ? "return"
      : node.expression.kind === "ThrowStatement" ? "throw"
        : node.expression.kind === "BreakStatement" ? "break"
          : node.expression.kind === "ContinueStatement" ? "continue" : "normal",
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

function jumpLabel(node: ExpressionNode): { label?: string } {
  const match = node.text?.match(/^\s*(?:break|continue)\s+([A-Za-z_$][\w$]*)/);
  return match?.[1] ? { label: match[1] } : {};
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
