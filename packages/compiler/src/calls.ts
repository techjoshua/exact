import * as ts from './native-typescript.js';

/** Returns whether a call expression invokes this.<methodName>(). */
export function isThisMethodCall(node: ts.CallExpression, methodName: string): boolean {
	return isThisMethodAccess(node.expression, methodName);
}

/** Describes source task facets in authored order. */
export type TaskCallFacets = {
	readonly names: readonly string[];
	readonly placement?: 'server' | 'client';
	readonly priority: 'normal' | 'deferred';
	readonly readiness: 'blocking' | 'nonblocking';
	readonly diagnostics: readonly string[];
};

/** Returns whether a call expression invokes this.task() or one of its callable facets. */
export function isThisTaskCall(node: ts.CallExpression): boolean {
	return taskCallFacets(node) !== undefined;
}

/** Returns an explicit task placement requested through this.task.server/client(), if present. */
export function taskRequestedPlacement(node: ts.CallExpression): 'server' | 'client' | undefined {
	return taskCallFacets(node)?.placement;
}

/** Resolves and validates the facets applied to an authored component task call. */
export function taskCallFacets(node: ts.CallExpression): TaskCallFacets | undefined {
	const names: string[] = [];
	let expression: ts.Expression = node.expression;
	while (isPropertyAccessLike(expression)) {
		if (isThisMethodAccess(expression, 'task')) {
			names.reverse();
			return normalizeTaskFacetNames(names);
		}
		names.push(expression.name.text);
		expression = expression.expression;
	}
	return undefined;
}

/** Normalizes task facet names gathered by either compiler syntax representation. */
export function normalizeTaskFacetNames(names: readonly string[]): TaskCallFacets {
	let placement: 'server' | 'client' | undefined;
	let priority: TaskCallFacets['priority'] = 'normal';
	let readiness: TaskCallFacets['readiness'] = 'nonblocking';
	const diagnostics: string[] = [];
	const seen = new Set<string>();
	for (const name of names) {
		if (seen.has(name)) {
			diagnostics.push(`error: this.task.${names.join('.')}() repeats the ${name} facet`);
			continue;
		}
		seen.add(name);
		if (name === 'server' || name === 'client') {
			if (placement && placement !== name)
				diagnostics.push(
					`error: this.task.${names.join('.')}() requests both client and server placement`
				);
			placement = name;
			continue;
		}
		if (name === 'deferred') {
			priority = 'deferred';
			continue;
		}
		if (name === 'blocking') {
			readiness = 'blocking';
			continue;
		}
		diagnostics.push(`error: unsupported this.task() facet ${name}`);
	}
	return Object.freeze({
		names: Object.freeze([...names]),
		...(placement ? { placement } : {}),
		priority,
		readiness,
		diagnostics: Object.freeze(diagnostics)
	});
}

/** Returns whether an expression is direct access to this.<methodName>. */
export function isThisMethodAccess(expression: ts.Expression, methodName: string): boolean {
	return (
		isPropertyAccessLike(expression) &&
		expression.name.text === methodName &&
		isThisExpressionLike(expression.expression)
	);
}

/** Narrows an expression to an arrow function or function expression. */
export function isFunctionLikeExpression(
	node: ts.Expression
): node is ts.ArrowFunction | ts.FunctionExpression {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

type PropertyAccessLike = ts.Expression & {
	readonly expression: ts.Expression;
	readonly name: { readonly text: string };
};

function isPropertyAccessLike(expression: ts.Expression): expression is PropertyAccessLike {
	const value = expression as unknown as {
		expression?: unknown;
		name?: { text?: unknown };
		argumentExpression?: unknown;
	};
	return (
		typeof value.expression === 'object' &&
		value.expression !== null &&
		typeof value.name?.text === 'string' &&
		value.argumentExpression === undefined
	);
}

function isThisExpressionLike(expression: ts.Expression): boolean {
	return (
		expression.kind === ts.SyntaxKind.ThisKeyword ||
		(expression as unknown as { kind?: number }).kind === 110
	);
}
