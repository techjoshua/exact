import {
  isAssignmentExpression,
  isCallExpression,
  isFunctionExpression,
  isJsxAttribute,
  isJsxElement,
  isJsxExpression,
  type AssignmentExpressionNode,
  type CallExpressionNode,
  type ExpressionNode,
  type FunctionExpressionNode,
  type JsxExpressionNode,
  type JsxAttributeNode,
  type JsxElementNode,
  type WalkOptions
} from "./model.js";

export type ParentIndex = ReadonlyMap<ExpressionNode, ExpressionNode | undefined>;

/** Root-aware node facade. Parent navigation stays correct across immutable tree versions. */
export class NodeRef<T extends ExpressionNode = ExpressionNode> {
  constructor(
    readonly node: T,
    readonly parentIndex: ParentIndex
  ) {}

  get kind(): T["kind"] { return this.node.kind; }
  get name(): string | undefined { return this.node.name; }
  get variable() { return this.node.variable; }
  get type() { return this.node.type; }

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

  isMember(name?: string): boolean {
    return (this.node.kind === "PropertyAccessExpression" || this.node.kind === "ElementAccessExpression")
      && (name === undefined || this.node.name === name || this.node.children[1]?.text === name);
  }

  get target(): NodeRef | undefined {
    if (!isCallExpression(this.node) && !this.isMember()) return undefined;
    const target = isCallExpression(this.node) ? this.node.target : this.node.children[0];
    return target ? new NodeRef(target, this.parentIndex) : undefined;
  }

  get arguments(): readonly NodeRef[] {
    if (!isCallExpression(this.node)) return Object.freeze([]);
    return Object.freeze(this.node.arguments.map(argument => new NodeRef(argument, this.parentIndex)));
  }

  get rootVariable() {
    let cursor: NodeRef | undefined = this;
    let variable = cursor.variable;
    while (cursor?.target) {
      cursor = cursor.target;
      variable = cursor.variable ?? variable;
    }
    return variable;
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

  jsxElements(): NodeQuery<JsxElementNode> {
    return this.ofKind(isJsxElement);
  }

  jsxAttributes(): NodeQuery<JsxAttributeNode> {
    return this.ofKind(isJsxAttribute);
  }

  jsxSyntax(): NodeQuery<JsxExpressionNode> {
    return this.ofKind(isJsxExpression);
  }

  memberAccesses(): NodeQuery<T> {
    return this.where(ref => ref.isMember());
  }

  declarations(): NodeQuery<T> {
    return this.where(ref => ref.node.category === "declaration");
  }

  references(): NodeQuery<T> {
    return this.where(ref => (ref.node.kind === "Identifier" || ref.node.kind === "ThisKeyword") && !!ref.node.variable);
  }

  inScope(scopeId: string): NodeQuery<T> {
    return this.where(ref => {
      let scope = ref.node.scope;
      while (scope) {
        if (scope.id === scopeId) return true;
        if (!scope.parent) break;
        scope = scope.parent;
      }
      return false;
    });
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
