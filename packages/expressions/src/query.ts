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
	type JsxAttributeNode,
	type JsxElementNode,
	type JsxExpressionNode,
	type WalkOptions
} from './model.js';

/** Defines the parent index type contract. */
export type ParentIndex = ReadonlyMap<ExpressionNode, ExpressionNode | undefined>;

/** Root-aware node facade. Parent navigation stays correct across immutable tree versions. */
export class NodeRef<T extends ExpressionNode = ExpressionNode> {
	constructor(
		readonly node: T,
		readonly parentIndex: ParentIndex
	) {}

	/** Performs the kind domain operation for this node ref instance. */
	get kind(): T['kind'] {
		return this.node.kind;
	}
	/** Performs the name domain operation for this node ref instance. */
	get name(): string | undefined {
		return this.node.name;
	}
	/** Performs the variable domain operation for this node ref instance. */
	get variable() {
		return this.node.variable;
	}
	/** Performs the type domain operation for this node ref instance. */
	get type() {
		return this.node.type;
	}

	/** Performs the parent domain operation for this node ref instance. */
	get parent(): NodeRef | undefined {
		const parent = this.parentIndex.get(this.node);
		return parent ? new NodeRef(parent, this.parentIndex) : undefined;
	}

	/** Performs the children domain operation for this node ref instance. */
	children(): NodeQuery {
		return NodeQuery.from(this.node.children.map((node) => new NodeRef(node, this.parentIndex)));
	}

	/** Performs the ancestors domain operation for this node ref instance. */
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

	/** Performs the descendants domain operation for this node ref instance. */
	descendants(options: WalkOptions = {}): NodeQuery {
		return walkRefs(this, { ...options, includeSelf: false });
	}

	/** Performs the walk domain operation for this node ref instance. */
	walk(options: WalkOptions = {}): NodeQuery {
		return walkRefs(this, { ...options, includeSelf: options.includeSelf ?? true });
	}

	/** Reports whether kind for this node ref instance. */
	isKind<K extends string>(kind: K): boolean {
		return this.node.kind === kind;
	}

	/** Reports whether member for this node ref instance. */
	isMember(name?: string): boolean {
		return (
			(this.node.kind === 'PropertyAccessExpression' ||
				this.node.kind === 'ElementAccessExpression') &&
			(name === undefined || this.node.name === name || this.node.children[1]?.text === name)
		);
	}

	/** Performs the target domain operation for this node ref instance. */
	get target(): NodeRef | undefined {
		if (!isCallExpression(this.node) && !this.isMember()) return undefined;
		const target = isCallExpression(this.node) ? this.node.target : this.node.children[0];
		return target ? new NodeRef(target, this.parentIndex) : undefined;
	}

	/** Performs the arguments domain operation for this node ref instance. */
	get arguments(): readonly NodeRef[] {
		if (!isCallExpression(this.node)) return Object.freeze([]);
		return Object.freeze(
			this.node.arguments.map((argument) => new NodeRef(argument, this.parentIndex))
		);
	}

	/** Performs the root variable domain operation for this node ref instance. */
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

	/** Performs the from domain operation for this node query instance. */
	static from<T extends ExpressionNode>(items: Iterable<NodeRef<T>>): NodeQuery<T> {
		return new NodeQuery(() => items);
	}

	/** Performs the symbol.iterator domain operation for this node query instance. */
	[Symbol.iterator](): Iterator<NodeRef<T>> {
		return this.create()[Symbol.iterator]();
	}

	/** Performs the where domain operation for this node query instance. */
	where(predicate: (ref: NodeRef<T>, index: number) => boolean): NodeQuery<T> {
		const self = this;
		return new NodeQuery(function* () {
			let index = 0;
			for (const ref of self) if (predicate(ref, index++)) yield ref;
		});
	}

	/** Performs the of kind domain operation for this node query instance. */
	ofKind<K extends ExpressionNode>(guard: (node: ExpressionNode) => node is K): NodeQuery<K>;
	ofKind(kind: string): NodeQuery<T>;
	ofKind<K extends ExpressionNode>(
		kindOrGuard: string | ((node: ExpressionNode) => node is K)
	): NodeQuery<T> | NodeQuery<K> {
		const self = this;
		return new NodeQuery(function* () {
			for (const ref of self) {
				if (
					typeof kindOrGuard === 'string' ? ref.node.kind === kindOrGuard : kindOrGuard(ref.node)
				) {
					yield ref as unknown as NodeRef<K>;
				}
			}
		});
	}

	/** Performs the calls domain operation for this node query instance. */
	calls(): NodeQuery<CallExpressionNode> {
		return this.ofKind(isCallExpression);
	}

	/** Performs the functions domain operation for this node query instance. */
	functions(): NodeQuery<FunctionExpressionNode> {
		return this.ofKind(isFunctionExpression);
	}

	/** Performs the assignments domain operation for this node query instance. */
	assignments(): NodeQuery<AssignmentExpressionNode> {
		return this.ofKind(isAssignmentExpression);
	}

	/** Performs the jsx elements domain operation for this node query instance. */
	jsxElements(): NodeQuery<JsxElementNode> {
		return this.ofKind(isJsxElement);
	}

	/** Performs the jsx attributes domain operation for this node query instance. */
	jsxAttributes(): NodeQuery<JsxAttributeNode> {
		return this.ofKind(isJsxAttribute);
	}

	/** Performs the jsx syntax domain operation for this node query instance. */
	jsxSyntax(): NodeQuery<JsxExpressionNode> {
		return this.ofKind(isJsxExpression);
	}

	/** Performs the member accesses domain operation for this node query instance. */
	memberAccesses(): NodeQuery<T> {
		return this.where((ref) => ref.isMember());
	}

	/** Performs the declarations domain operation for this node query instance. */
	declarations(): NodeQuery<T> {
		return this.where((ref) => ref.node.category === 'declaration');
	}

	/** Performs the references domain operation for this node query instance. */
	references(): NodeQuery<T> {
		return this.where(
			(ref) =>
				(ref.node.kind === 'Identifier' || ref.node.kind === 'ThisKeyword') && !!ref.node.variable
		);
	}

	/** Performs the in scope domain operation for this node query instance. */
	inScope(scopeId: string): NodeQuery<T> {
		return this.where((ref) => {
			let scope = ref.node.scope;
			while (scope) {
				if (scope.id === scopeId) return true;
				if (!scope.parent) break;
				scope = scope.parent;
			}
			return false;
		});
	}

	/** Performs the first domain operation for this node query instance. */
	first(predicate?: (ref: NodeRef<T>) => boolean): NodeRef<T> | undefined {
		for (const ref of this) if (!predicate || predicate(ref)) return ref;
		return undefined;
	}

	/** Performs the single domain operation for this node query instance. */
	single(predicate?: (ref: NodeRef<T>) => boolean): NodeRef<T> {
		const matches = predicate ? this.where((ref) => predicate(ref)) : this;
		let result: NodeRef<T> | undefined;
		for (const ref of matches) {
			if (result) throw new Error('Expression query returned more than one node');
			result = ref;
		}
		if (!result) throw new Error('Expression query returned no nodes');
		return result;
	}

	/** Performs the any domain operation for this node query instance. */
	any(predicate?: (ref: NodeRef<T>) => boolean): boolean {
		return this.first(predicate) !== undefined;
	}

	/** Performs the to array domain operation for this node query instance. */
	toArray(): NodeRef<T>[] {
		return [...this];
	}

	/** Performs the group by domain operation for this node query instance. */
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

/** Creates a parent index. */
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
				if (options.types === false && child.category === 'type') continue;
				if (options.jsx === false && child.category === 'jsx') continue;
				if (options.nestedFunctions === false && isFunctionExpression(child)) continue;
				if (
					options.nestedClasses === false &&
					(child.kind === 'ClassDeclaration' || child.kind === 'ClassExpression')
				)
					continue;
				yield* visit(new NodeRef(child, ref.parentIndex), true);
			}
		};
		yield* visit(root, options.includeSelf ?? true);
	});
}
