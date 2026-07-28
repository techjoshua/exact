import * as ts from '../../native-typescript.js';
import { isFunctionLikeExpression, isThisTaskCall, taskCallFacets } from '../../calls.js';

/**
 * Lowers top-level awaited task assignments into blocking setup tasks.
 *
 * The authored callback remains the source of dependency, placement, resource, and signal
 * analysis. Its resolved value is assigned inside the generated task generation.
 */
export function lowerAsyncComponentTasks<
	T extends ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction
>(node: T, context: ts.TransformationContext): T {
	if (!node.body || !ts.isBlock(node.body)) return node;
	let lowered = false;
	const statements = node.body.statements.map((statement) => {
		const replacement = lowerAwaitedTaskAssignment(statement, context);
		if (replacement !== statement) lowered = true;
		return replacement;
	});
	if (!lowered) return node;
	const body = context.factory.updateBlock(node.body, statements);
	const originalModifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
	const modifiers = hasDirectAwait(body)
		? originalModifiers
		: originalModifiers?.filter((modifier) => modifier.kind !== ts.SyntaxKind.AsyncKeyword);
	if (ts.isFunctionDeclaration(node)) {
		return context.factory.updateFunctionDeclaration(
			node,
			modifiers,
			node.asteriskToken,
			node.name,
			node.typeParameters,
			node.parameters,
			node.type,
			body
		) as T;
	}
	if (ts.isFunctionExpression(node)) {
		return context.factory.updateFunctionExpression(
			node,
			modifiers,
			node.asteriskToken,
			node.name,
			node.typeParameters,
			node.parameters,
			node.type,
			body
		) as T;
	}
	return context.factory.updateArrowFunction(
		node,
		modifiers,
		node.typeParameters,
		node.parameters,
		node.type,
		node.equalsGreaterThanToken,
		body
	) as T;
}

function lowerAwaitedTaskAssignment(
	statement: ts.Statement,
	context: ts.TransformationContext
): ts.Statement {
	if (!ts.isExpressionStatement(statement)) return statement;
	const assignment = statement.expression;
	if (
		!ts.isBinaryExpression(assignment) ||
		assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
		!ts.isAwaitExpression(assignment.right) ||
		!ts.isCallExpression(assignment.right.expression) ||
		!isThisTaskCall(assignment.right.expression)
	)
		return statement;
	const taskCall = assignment.right.expression;
	const work = taskCall.arguments.at(-1);
	if (!work || !isFunctionLikeExpression(work)) return statement;
	const taskContext = context.factory.createUniqueName('__exactTaskContext');
	const taskValue = context.factory.createUniqueName('__exactTaskValue');
	const invoke = context.factory.createCallExpression(
		context.factory.createParenthesizedExpression(work),
		undefined,
		[taskContext]
	);
	const generatedWork = context.factory.createArrowFunction(
		[context.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
		undefined,
		[context.factory.createParameterDeclaration(undefined, undefined, taskContext)],
		undefined,
		context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		context.factory.createBlock(
			[
				context.factory.createVariableStatement(
					undefined,
					context.factory.createVariableDeclarationList(
						[
							context.factory.createVariableDeclaration(
								taskValue,
								undefined,
								undefined,
								context.factory.createAwaitExpression(invoke)
							)
						],
						ts.NodeFlags.Const
					)
				),
				context.factory.createExpressionStatement(
					context.factory.updateBinaryExpression(
						assignment,
						assignment.left,
						assignment.operatorToken,
						taskValue
					)
				)
			],
			true
		)
	);
	const expression =
		taskCallFacets(taskCall)!.readiness === 'blocking'
			? taskCall.expression
			: context.factory.createPropertyAccessExpression(taskCall.expression, 'blocking');
	return context.factory.createExpressionStatement(
		context.factory.updateCallExpression(taskCall, expression, taskCall.typeArguments, [
			...taskCall.arguments.slice(0, -1),
			generatedWork
		])
	);
}

function hasDirectAwait(body: ts.Block): boolean {
	let found = false;
	const visit = (node: ts.Node): void => {
		if (found) return;
		if (node !== body && ts.isFunctionLike(node)) return;
		if (ts.isAwaitExpression(node)) {
			found = true;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(body);
	return found;
}
