import {
  isAssignmentExpression,
  isCallExpression,
  isFunctionExpression,
  isJsxExpression,
  type AssignmentExpressionNode,
  type CallExpressionNode,
  type ExpressionNode,
  type FunctionExpressionNode,
  type JsxExpressionNode,
  type WalkOptions
} from "./model.js";

export type ParentIndex = ReadonlyMap<ExpressionNode, ExpressionNode | undefined>;

/** Root-aware node facade. Parent navigation stays correct across immutable tree versions. */
export class NodeRef<T extends ExpressionNode = ExpressionNode> {
  constructor(
    readonly node: T,
    readonly parentIndex: ParentIndex
  ) {}

  get parent(): NodeRef | undefined {
    const parent = this.parentIndex.get(this.node);
    return parent ? new NodeRef(parent, this.parentIndex) : undefined;
  }

  children(): NodeQuery {
    return NodeQuery.from(this.node.children.map(node => new NodeRef(node, this.parentIndex)));
  }

  ancestors(): NodeQuery {
    const self = this;
    return new NodeQuery(function* () {
      let cursor = self.parent;
      while (cursor) {
        yield cursor;
        cursor = cursor.parent;
      }
    });
  }

  descendants(options: WalkOptions = {}): NodeQuery {
    return walkRefs(this, { ...options, includeSelf: false });
  }

  walk(options: WalkOptions = {}): NodeQuery {
    return walkRefs(this, { ...options, includeSelf: options.includeSelf ?? true });
  }

  isKind<K extends string>(kind: K): boolean {
    return this.node.kind === kind;
  }
}

/** Lazy fluent query over root-aware expression nodes. */
export class NodeQuery<T extends ExpressionNode = ExpressionNode> implements Iterable<NodeRef<T>> {
  constructor(private readonly create: () => Iterable<NodeRef<T>>) {}

  static from<T extends ExpressionNode>(items: Iterable<NodeRef<T>>): NodeQuery<T> {
    return new NodeQuery(() => items);
  }

  [Symbol.iterator](): Iterator<NodeRef<T>> {
    return this.create()[Symbol.iterator]();
  }

  where(predicate: (ref: NodeRef<T>, index: number) => boolean): NodeQuery<T> {
    const self = this;
    return new NodeQuery(function* () {
      let index = 0;
      for (const ref of self) if (predicate(ref, index++)) yield ref;
    });
  }

  ofKind<K extends ExpressionNode>(guard: (node: ExpressionNode) => node is K): NodeQuery<K>;
  ofKind(kind: string): NodeQuery<T>;
  ofKind<K extends ExpressionNode>(kindOrGuard: string | ((node: ExpressionNode) => node is K)): NodeQuery<T> | NodeQuery<K> {
    const self = this;
    return new NodeQuery(function* () {
      for (const ref of self) {
        if (typeof kindOrGuard === "string" ? ref.node.kind === kindOrGuard : kindOrGuard(ref.node)) {
          yield ref as unknown as NodeRef<K>;
        }
      }
    });
  }

  calls(): NodeQuery<CallExpressionNode> {
    return this.ofKind(isCallExpression);
  }

  functions(): NodeQuery<FunctionExpressionNode> {
    return this.ofKind(isFunctionExpression);
  }

  assignments(): NodeQuery<AssignmentExpressionNode> {
    return this.ofKind(isAssignmentExpression);
  }

  jsxElements(): NodeQuery<JsxExpressionNode> {
    return this.ofKind(isJsxExpression);
  }

  first(predicate?: (ref: NodeRef<T>) => boolean): NodeRef<T> | undefined {
    for (const ref of this) if (!predicate || predicate(ref)) return ref;
    return undefined;
  }

  single(predicate?: (ref: NodeRef<T>) => boolean): NodeRef<T> {
    const matches = predicate ? this.where(ref => predicate(ref)) : this;
    let result: NodeRef<T> | undefined;
    for (const ref of matches) {
      if (result) throw new Error("Expression query returned more than one node");
      result = ref;
    }
    if (!result) throw new Error("Expression query returned no nodes");
    return result;
  }

  any(predicate?: (ref: NodeRef<T>) => boolean): boolean {
    return this.first(predicate) !== undefined;
  }

  toArray(): NodeRef<T>[] {
    return [...this];
  }

  groupBy<K>(select: (ref: NodeRef<T>) => K): Map<K, NodeRef<T>[]> {
    const groups = new Map<K, NodeRef<T>[]>();
    for (const ref of this) {
      const key = select(ref);
      const group = groups.get(key) ?? [];
      group.push(ref);
      groups.set(key, group);
    }
    return groups;
  }
}

export function buildParentIndex(root: ExpressionNode): ParentIndex {
  const parents = new Map<ExpressionNode, ExpressionNode | undefined>();
  const visit = (node: ExpressionNode, parent?: ExpressionNode): void => {
    parents.set(node, parent);
    for (const child of node.children) visit(child, node);
  };
  visit(root);
  return parents;
}

function walkRefs(root: NodeRef, options: WalkOptions): NodeQuery {
  return new NodeQuery(function* () {
    const visit = function* (ref: NodeRef, include: boolean): Generator<NodeRef> {
      if (include) yield ref;
      for (const child of ref.node.children) {
        if (options.types === false && child.category === "type") continue;
        if (options.jsx === false && child.category === "jsx") continue;
        if (options.nestedFunctions === false && isFunctionExpression(child)) continue;
        if (options.nestedClasses === false && (child.kind === "ClassDeclaration" || child.kind === "ClassExpression")) continue;
        yield* visit(new NodeRef(child, ref.parentIndex), true);
      }
    };
    yield* visit(root, options.includeSelf ?? true);
  });
}
