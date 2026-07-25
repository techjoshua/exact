import ts from 'typescript';
import type { HelperNames } from '../../types.js';

import type { DerivedReactiveIndex } from './contracts.js';
import { visitReactiveSinkExpression } from './reactive-emission.js';

/** Creates an identifier property name when possible and a string literal otherwise. */
export function propName(name: string): ts.PropertyName {
	return /^[$A-Z_a-z][$\w]*$/.test(name)
		? ts.factory.createIdentifier(name)
		: ts.factory.createStringLiteral(name);
}

/** Wraps a reactive attribute expression in the runtime expression helper. */
export function wrapExpression(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const factory = context.factory;
	return factory.createCallExpression(factory.createIdentifier(helpers.expression), undefined, [
		factory.createArrowFunction(
			undefined,
			undefined,
			[],
			undefined,
			factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
			visitReactiveSinkExpression(context, expression, visitor, sourceFile, derivedReactiveLocals)
		)
	]);
}
