import type { ExpressionNode } from '../model.js';

/** Performs the may throw domain operation. */
export function mayThrow(node: ExpressionNode): boolean {
	switch (node.kind) {
		case 'BreakStatement':
		case 'ContinueStatement':
		case 'EmptyStatement':
		case 'DebuggerStatement':
		case 'FunctionDeclaration':
			return false;
		case 'ReturnStatement':
			return node.children.some(
				(child) => child.category === 'expression' && expressionMayThrow(child)
			);
		default:
			return true;
	}
}

function expressionMayThrow(node: ExpressionNode): boolean {
	switch (node.kind) {
		case 'ThisKeyword':
		case 'TrueKeyword':
		case 'FalseKeyword':
		case 'NullKeyword':
		case 'NumericLiteral':
		case 'BigIntLiteral':
		case 'StringLiteral':
		case 'NoSubstitutionTemplateLiteral':
		case 'ArrowFunction':
		case 'FunctionExpression':
			return false;
		case 'ParenthesizedExpression':
			return node.children.some(expressionMayThrow);
		default:
			// Property reads may invoke accessors, and operators may invoke user
			// coercion hooks; stay conservative unless non-throwing is guaranteed.
			return true;
	}
}

/** Performs the jump label domain operation. */
export function jumpLabel(node: ExpressionNode): { label?: string } {
	const match = node.text?.match(/^\s*(?:break|continue)\s+([A-Za-z_$][\w$]*)/);
	return match?.[1] ? { label: match[1] } : {};
}

/** Performs the function body domain operation. */
export function functionBody(owner: ExpressionNode): ExpressionNode | undefined {
	if (
		![
			'FunctionDeclaration',
			'FunctionExpression',
			'ArrowFunction',
			'MethodDeclaration',
			'GetAccessor',
			'SetAccessor'
		].includes(owner.kind)
	)
		return undefined;
	return [...owner.children]
		.reverse()
		.find((child) => child.kind === 'Block' || child.category === 'expression');
}

/** Reports whether executable. */
export function isExecutable(node: ExpressionNode): boolean {
	return (
		node.category === 'statement' ||
		node.category === 'declaration' ||
		node.kind === 'Block' ||
		node.kind === 'CaseClause' ||
		node.kind === 'DefaultClause' ||
		node.kind === 'CatchClause'
	);
}

/** Reports whether loop. */
export function isLoop(kind: string): boolean {
	return (
		kind === 'ForStatement' ||
		kind === 'ForInStatement' ||
		kind === 'ForOfStatement' ||
		kind === 'WhileStatement' ||
		kind === 'DoStatement'
	);
}

/** Performs the readonly map domain operation. */
export function readonlyMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
	const values = new Map(entries);
	return Object.freeze({
		get size() {
			return values.size;
		},
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
