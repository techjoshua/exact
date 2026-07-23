import type { BoundModule, FunctionExpressionNode, NodeRef, Variable } from '@exact/expressions';

/** Defines the expression component index interface contract. */
export interface ExpressionComponentIndex {
	readonly functions: readonly NodeRef<FunctionExpressionNode>[];
	isComponent(reference: NodeRef | undefined): boolean;
	owner(reference: NodeRef): NodeRef | undefined;
	ownsReceiver(owner: NodeRef | undefined, receiver: Variable | undefined): boolean;
}

const cache = new WeakMap<BoundModule, ExpressionComponentIndex>();
const implicitComponentProtocolCalls = new Set([
	'getContext',
	'map',
	'onMount',
	'onRender',
	'onUnmount',
	'reactive',
	'setContext',
	'task'
]);

/** Builds the single canonical component identity index used by compiler analyses. */
export function expressionComponentIndex(module: BoundModule): ExpressionComponentIndex {
	const existing = cache.get(module);
	if (existing) return existing;
	const componentNodes = new Set<NodeRef['node']>();
	const receiverOwners = new WeakMap<Variable, NodeRef['node']>();
	const declarations = module
		.walk()
		.functions()
		.where((reference) => reference.node.kind === 'FunctionDeclaration' && !!reference.node.span)
		.toArray();

	for (const declaration of declarations) {
		const receiver = declaration.node.parameters.find(isComponentThisVariable);
		if (receiver) {
			componentNodes.add(declaration.node);
			receiverOwners.set(receiver, declaration.node);
		}
	}
	// JavaScript and concise TypeScript components commonly omit an explicit
	// `this: Component` parameter. Treat use of the compiler-owned component
	// protocol as the semantic declaration signal. An explicitly typed,
	// non-Component `this` remains an ordinary function.
	for (const reference of module.walk().references()) {
		const variable = reference.variable;
		if (!isImplicitComponentThisVariable(variable)) continue;
		const member = reference.parent;
		if (
			!member?.isMember() ||
			member.target?.node !== reference.node ||
			!isImplicitProtocolCall(member)
		)
			continue;
		const owner = reference
			.ancestors()
			.functions()
			.first((candidate) => candidate.node.kind === 'FunctionDeclaration');
		if (owner) {
			componentNodes.add(owner.node);
			receiverOwners.set(variable, owner.node);
		}
	}
	for (const element of module.walk().jsxElements()) {
		const owner = element
			.ancestors()
			.functions()
			.first((candidate) => candidate.node.kind === 'FunctionDeclaration');
		// JSX may also live in ordinary render helpers. Only a component-style
		// declaration name is an implicit component signal; explicit Component
		// receivers and component protocol calls were indexed above regardless of
		// name. This keeps helpers such as renderWorkspace() eligible for JSX
		// lowering without applying component-only state and collection rewrites.
		if (owner && isComponentDeclarationName(owner.node.name)) componentNodes.add(owner.node);
	}

	const functions = Object.freeze(
		declarations.filter((declaration) => componentNodes.has(declaration.node))
	);
	const index: ExpressionComponentIndex = Object.freeze({
		functions,
		isComponent(reference: NodeRef | undefined) {
			return !!reference && componentNodes.has(reference.node);
		},
		owner(reference: NodeRef) {
			return reference
				.ancestors()
				.functions()
				.first((candidate: NodeRef<FunctionExpressionNode>) => componentNodes.has(candidate.node));
		},
		ownsReceiver(owner: NodeRef | undefined, receiver: Variable | undefined) {
			return !!owner && !!receiver && receiverOwners.get(receiver) === owner.node;
		}
	});
	cache.set(module, index);
	return index;
}

function isComponentDeclarationName(name: string | undefined): boolean {
	return !!name && /^\p{Lu}/u.test(name);
}

function isImplicitProtocolCall(member: NodeRef): boolean {
	if (!implicitComponentProtocolCalls.has(member.name ?? '')) return false;
	let target = member;
	if (
		member.isMember('task') &&
		member.parent?.isMember() &&
		(member.parent.name === 'client' || member.parent.name === 'server') &&
		member.parent.target?.node === member.node
	)
		target = member.parent;
	return (
		target.parent?.node.kind === 'CallExpression' && target.parent.target?.node === target.node
	);
}

/** Recognizes eXact's component receiver from package-owned semantic type data. */
export function isComponentThisVariable(variable: Variable | undefined): variable is Variable {
	if (
		!variable ||
		variable.name !== 'this' ||
		variable.declarationKind !== 'Parameter' ||
		!variable.type
	)
		return false;
	const properties = new Set(variable.type.properties);
	return (
		/(?:^|\W)Component(?:<|$)/.test(variable.type.display) ||
		['state', 'task', 'map', 'getContext', 'setContext', 'onMount', 'onUnmount'].every((property) =>
			properties.has(property)
		)
	);
}

/** An unannotated function receiver whose component status is established by protocol use. */
export function isImplicitComponentThisVariable(
	variable: Variable | undefined
): variable is Variable {
	return !!variable && variable.name === 'this' && variable.declarationKind === 'ThisKeyword';
}
