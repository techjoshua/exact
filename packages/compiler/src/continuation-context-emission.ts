import * as ts from './native-typescript.js';
import type { ExactContinuationIR } from './types.js';

/** Rewrites component context effects and receiver access for stateless server execution. */
export function rewriteContinuationContextWork(
	work: ts.ArrowFunction | ts.FunctionExpression,
	continuation: ExactContinuationIR,
	activation: ts.Identifier,
	execution: ts.Identifier,
	component: ts.Identifier,
	contextWrites: ts.Identifier,
	context: ts.TransformationContext,
	filename: string
): ts.ArrowFunction | ts.FunctionExpression {
	const factory = context.factory;
	const visit: ts.Visitor = (node) => {
		if (node !== work && ts.isFunctionExpression(node)) return node;
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.expression.kind === ts.SyntaxKind.ThisKeyword
		) {
			if (node.expression.name.text === 'getContext' && node.arguments.length === 1) {
				const token = node.arguments[0]!;
				return continuationContextValueExpression(
					token,
					token.getText(),
					continuation,
					activation,
					execution,
					factory,
					filename
				);
			}
			if (node.expression.name.text === 'setContext') {
				const token = node.arguments[0];
				const value = node.arguments[1];
				const tokenName = token?.getText();
				const shared = continuation.effects.contextWrites.some(
					(effect) => effect.token === tokenName
				);
				const server = continuation.effects.serverContextWrites.some(
					(effect) => effect.token === tokenName
				);
				if (!token || !value || !tokenName || (!shared && !server))
					throw new Error(
						`Server continuation ${continuation.id} writes undeclared component context in ${filename}`
					);
				const rewrittenValue = ts.visitNode(value, visit) as ts.Expression;
				if (server) {
					return factory.createCallExpression(
						factory.createPropertyAccessExpression(execution, 'setContext'),
						undefined,
						[token, rewrittenValue, factory.createStringLiteral(tokenName)]
					);
				}
				return factory.createBinaryExpression(
					factory.createBinaryExpression(
						factory.createElementAccessExpression(
							contextWrites,
							factory.createStringLiteral(tokenName)
						),
						factory.createToken(ts.SyntaxKind.EqualsToken),
						rewrittenValue
					),
					factory.createToken(ts.SyntaxKind.CommaToken),
					factory.createVoidExpression(factory.createNumericLiteral(0))
				);
			}
		}
		if (
			ts.isPropertyAccessExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ThisKeyword &&
			node.name.text !== 'state' &&
			node.name.text !== 'getContext' &&
			node.name.text !== 'setContext'
		) {
			throw new Error(
				`Server continuation ${continuation.id} uses unsupported component member this.${node.name.text} in ${filename}`
			);
		}
		if (node.kind === ts.SyntaxKind.ThisKeyword) return component;
		return ts.visitEachChild(node, visit, context);
	};
	return ts.visitNode(work, visit) as ts.ArrowFunction | ts.FunctionExpression;
}

/** Resolves one declared public projection or server resource lookup. */
export function continuationContextValueExpression(
	token: ts.Expression,
	tokenName: string,
	continuation: ExactContinuationIR,
	activation: ts.Identifier,
	execution: ts.Identifier,
	factory: ts.NodeFactory,
	filename: string
): ts.Expression {
	if (continuation.activation.publicContexts.some((effect) => effect.token === tokenName)) {
		return factory.createElementAccessExpression(
			factory.createPropertyAccessExpression(activation, 'publicContext'),
			factory.createStringLiteral(tokenName)
		);
	}
	if (continuation.activation.serverContexts.some((effect) => effect.token === tokenName)) {
		return factory.createCallExpression(
			factory.createPropertyAccessExpression(execution, 'getContext'),
			undefined,
			[token, factory.createStringLiteral(tokenName)]
		);
	}
	throw new Error(
		`Server continuation ${continuation.id} reads undeclared context ${tokenName} in ${filename}`
	);
}
