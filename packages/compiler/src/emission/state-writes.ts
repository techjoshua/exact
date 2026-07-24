import ts from 'typescript';
import type { HelperNames } from '../types.js';

/** Lowers a component-state assignment through the transactional runtime API. */
export function transformStateAssignment(
	context: ts.TransformationContext,
	node: ts.BinaryExpression,
	root: ts.Expression,
	path: readonly string[],
	visitor: ts.Visitor,
	helpers: HelperNames
): ts.Expression {
	const value = ts.visitNode(node.right, visitor) as ts.Expression;
	if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
		return context.factory.createCallExpression(
			context.factory.createIdentifier(helpers.write),
			undefined,
			[
				root,
				statePathLiteral(context, path),
				context.factory.createArrowFunction(
					undefined,
					undefined,
					[],
					undefined,
					context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
					value
				)
			]
		);
	}

	const operator = compoundOperator(node.operatorToken.kind);
	if (operator === undefined) return node;
	const previous = context.factory.createIdentifier('previous');
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.update),
		undefined,
		[
			root,
			statePathLiteral(context, path),
			context.factory.createArrowFunction(
				undefined,
				undefined,
				[context.factory.createParameterDeclaration(undefined, undefined, previous)],
				undefined,
				context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
				context.factory.createBinaryExpression(previous, operator, value)
			)
		]
	);
}

/** Lowers prefix and postfix component-state updates while preserving results. */
export function transformStateUpdate(
	context: ts.TransformationContext,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
	root: ts.Expression,
	path: readonly string[],
	helpers: HelperNames
): ts.Expression {
	const previous = context.factory.createIdentifier('previous');
	const operation =
		node.kind === ts.SyntaxKind.PostfixUnaryExpression
			? context.factory.createPostfixUnaryExpression(previous, node.operator)
			: context.factory.createPrefixUnaryExpression(node.operator, previous);
	const result = context.factory.createIdentifier('result');
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.updateResult),
		undefined,
		[
			root,
			statePathLiteral(context, path),
			context.factory.createArrowFunction(
				undefined,
				undefined,
				[context.factory.createParameterDeclaration(undefined, undefined, previous)],
				undefined,
				context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
				context.factory.createBlock(
					[
						context.factory.createVariableStatement(
							undefined,
							context.factory.createVariableDeclarationList(
								[
									context.factory.createVariableDeclaration(result, undefined, undefined, operation)
								],
								ts.NodeFlags.Const
							)
						),
						context.factory.createReturnStatement(
							context.factory.createArrayLiteralExpression([previous, result])
						)
					],
					true
				)
			)
		]
	);
}

/** Returns whether a method mutates an array in place. */
export function isArrayMutator(
	name: string
): name is
	| 'copyWithin'
	| 'fill'
	| 'pop'
	| 'push'
	| 'reverse'
	| 'shift'
	| 'sort'
	| 'splice'
	| 'unshift' {
	return [
		'copyWithin',
		'fill',
		'pop',
		'push',
		'reverse',
		'shift',
		'sort',
		'splice',
		'unshift'
	].includes(name);
}

/** Creates the runtime expression for the active component state root. */
export function componentStateRoot(context: ts.TransformationContext): ts.Expression {
	return context.factory.createPropertyAccessExpression(context.factory.createThis(), 'state');
}

/** Creates the immutable property-path literal consumed by runtime write helpers. */
export function statePathLiteral(
	context: ts.TransformationContext,
	path: readonly string[]
): ts.ArrayLiteralExpression {
	return context.factory.createArrayLiteralExpression(
		path.map((segment) => context.factory.createStringLiteral(segment))
	);
}

function compoundOperator(kind: ts.SyntaxKind): ts.BinaryOperator | undefined {
	return compoundOperators.get(kind);
}

const compoundOperators = new Map<ts.SyntaxKind, ts.BinaryOperator>([
	[ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.PlusToken],
	[ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.MinusToken],
	[ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.AsteriskToken],
	[ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.SlashToken],
	[ts.SyntaxKind.PercentEqualsToken, ts.SyntaxKind.PercentToken],
	[ts.SyntaxKind.AsteriskAsteriskEqualsToken, ts.SyntaxKind.AsteriskAsteriskToken],
	[ts.SyntaxKind.LessThanLessThanEqualsToken, ts.SyntaxKind.LessThanLessThanToken],
	[ts.SyntaxKind.GreaterThanGreaterThanEqualsToken, ts.SyntaxKind.GreaterThanGreaterThanToken],
	[
		ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
		ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken
	],
	[ts.SyntaxKind.AmpersandEqualsToken, ts.SyntaxKind.AmpersandToken],
	[ts.SyntaxKind.BarEqualsToken, ts.SyntaxKind.BarToken],
	[ts.SyntaxKind.CaretEqualsToken, ts.SyntaxKind.CaretToken],
	[ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.AmpersandAmpersandToken],
	[ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.BarBarToken],
	[ts.SyntaxKind.QuestionQuestionEqualsToken, ts.SyntaxKind.QuestionQuestionToken]
]);
