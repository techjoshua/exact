import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import { hasWriteAfterDeclaration } from './reevaluation-safety.js';

/** A statically resolvable component value and every component it may select. */
export interface ExpressionComponentValue {
	readonly targets: readonly string[];
	readonly dynamic: boolean;
}

/**
 * Resolves immutable component aliases and finite conditional component values.
 *
 * Arbitrary element access and calls are intentionally excluded because their
 * possible component identities cannot be represented in the render graph.
 */
export function resolveComponentValue(
	module: BoundModule,
	variable: Variable
): ExpressionComponentValue | undefined {
	return resolveVariable(module, variable, new Set());
}

/** Returns the authored binding name for a function-valued component declaration. */
export function componentFunctionName(
	module: BoundModule,
	functionReference: NodeRef
): string | undefined {
	const declaration = functionReference
		.ancestors()
		.ofKind('VariableDeclaration')
		.first((candidate) => candidate.children().toArray().at(-1)?.node === functionReference.node);
	const variable = declaration?.children().first()?.walk().references().first()?.variable;
	return variable?.name ?? functionReference.node.name;
}

/** Finds function expressions assigned directly to immutable component-style bindings. */
export function componentFunctionValues(module: BoundModule): readonly NodeRef[] {
	const functions: NodeRef[] = [];
	for (const declaration of module.walk().ofKind('VariableDeclaration')) {
		const initializer = declaration.children().toArray().at(-1);
		if (!initializer || !['ArrowFunction', 'FunctionExpression'].includes(initializer.node.kind))
			continue;
		const variable = declaration.children().first()?.walk().references().first()?.variable;
		if (
			variable &&
			isComponentName(variable.name) &&
			!hasWriteAfterDeclaration(module, variable, declaration.children().first())
		)
			functions.push(initializer);
	}
	return functions;
}

function resolveVariable(
	module: BoundModule,
	variable: Variable,
	resolving: Set<string>
): ExpressionComponentValue | undefined {
	if (resolving.has(variable.id) || variable.typeOnly) return undefined;
	if (
		variable.importedFrom ||
		variable.declarationKind === 'ImportSpecifier' ||
		variable.declarationKind === 'ImportClause' ||
		variable.declarationKind === 'NamespaceImport' ||
		variable.declarationKind === 'FunctionDeclaration'
	)
		return Object.freeze({ targets: Object.freeze([variable.name]), dynamic: false });
	if (variable.declarationKind !== 'VariableDeclaration') return undefined;
	const declaration = variableDeclaration(module, variable);
	if (!declaration || hasWriteAfterDeclaration(module, variable, declaration.children().first()))
		return undefined;
	const initializer = declaration.children().toArray().at(-1);
	if (!initializer) return undefined;
	const next = new Set(resolving);
	next.add(variable.id);
	return resolveExpression(module, initializer, variable.name, next);
}

function resolveExpression(
	module: BoundModule,
	expression: NodeRef,
	ownName: string,
	resolving: Set<string>
): ExpressionComponentValue | undefined {
	if (expression.node.kind === 'ArrowFunction' || expression.node.kind === 'FunctionExpression')
		return Object.freeze({ targets: Object.freeze([ownName]), dynamic: false });
	if (expression.node.kind === 'ParenthesizedExpression') {
		const inner = expression.children().first((child) => child.node.category === 'expression');
		return inner ? resolveExpression(module, inner, ownName, resolving) : undefined;
	}
	if (expression.node.kind === 'ConditionalExpression') {
		const branches = expression
			.children()
			.where((child) => child.node.category === 'expression')
			.toArray()
			.slice(-2);
		if (branches.length !== 2) return undefined;
		const left = resolveExpression(module, branches[0]!, ownName, resolving);
		const right = resolveExpression(module, branches[1]!, ownName, resolving);
		if (!left || !right) return undefined;
		return Object.freeze({
			targets: Object.freeze([...new Set([...left.targets, ...right.targets])]),
			dynamic: true
		});
	}
	if (expression.node.kind === 'CallExpression') {
		const target = expression.target;
		const targetVariable = target?.rootVariable;
		const wrapper = target?.name ?? targetVariable?.name;
		if (
			targetVariable?.importedFrom === 'react' &&
			(wrapper === 'memo' || wrapper === 'forwardRef' || wrapper === 'lazy')
		) {
			if (wrapper === 'memo' && expression.arguments[0]) {
				const wrapped = resolveExpression(module, expression.arguments[0], ownName, resolving);
				if (wrapped) return wrapped;
			}
			return Object.freeze({ targets: Object.freeze([ownName]), dynamic: false });
		}
	}
	if (expression.node.kind !== 'Identifier' && expression.node.kind !== 'PropertyAccessExpression')
		return undefined;
	const target = expression.rootVariable;
	if (
		expression.node.kind === 'PropertyAccessExpression' &&
		target?.declarationKind === 'NamespaceImport'
	)
		return Object.freeze({
			targets: Object.freeze([expression.node.text?.trim() ?? target.name]),
			dynamic: false
		});
	return target ? resolveVariable(module, target, resolving) : undefined;
}

function variableDeclaration(module: BoundModule, variable: Variable): NodeRef | undefined {
	return module
		.walk()
		.ofKind('VariableDeclaration')
		.first((candidate) =>
			Boolean(
				candidate
					.children()
					.first()
					?.walk()
					.references()
					.any((reference) => reference.variable === variable)
			)
		);
}

function isComponentName(name: string | undefined): boolean {
	return !!name && /^\p{Lu}/u.test(name);
}
