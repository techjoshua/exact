import * as ts from '../../native-typescript.js';
import { componentStateRoot } from '../../emission/state-writes.js';
import type { ExpressionWriteSite } from '../../expression/writes.js';

import type { DerivedReactiveIndex } from './contracts.js';
import { expressionEmissionId } from './identity.js';

/** Resolves the concrete reactive root and relative path for an emitted state write. */
export function stateWriteTarget(
	context: ts.TransformationContext,
	node: ts.Node,
	site: ExpressionWriteSite,
	derivedReactiveLocals: DerivedReactiveIndex
): { root: ts.Expression; path: readonly string[] } {
	if (!site.aliasPath) {
		return { root: componentStateRoot(context), path: site.path };
	}

	const operand = writeOperand(node);
	const alias = operand ? rootIdentifier(operand) : undefined;
	if (!alias) return { root: componentStateRoot(context), path: site.path };

	const derived = derivedReactiveLocals.references.get(expressionEmissionId(alias) ?? '');
	const root = derived?.cached
		? context.factory.createCallExpression(
				context.factory.createPropertyAccessExpression(alias, 'get'),
				undefined,
				[]
			)
		: alias;
	return {
		root,
		path: site.path.slice(site.aliasPath.length)
	};
}

function writeOperand(node: ts.Node): ts.Expression | undefined {
	if (ts.isBinaryExpression(node)) return node.left;
	if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) return node.operand;
	if (ts.isDeleteExpression(node)) return node.expression;
	if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
		return node.expression.expression;
	return undefined;
}

function rootIdentifier(expression: ts.Expression): ts.Identifier | undefined {
	let current = expression;
	while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))
		current = current.expression;
	return ts.isIdentifier(current) ? current : undefined;
}
