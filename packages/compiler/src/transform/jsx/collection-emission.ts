import * as ts from '../../native-typescript.js';
import { isFunctionLikeExpression } from '../../calls.js';
import type { ExpressionJsxListSite } from '../../expression/jsx.js';
import { stableId } from '../../ids.js';

import type { DerivedReactiveIndex } from './contracts.js';
import { expressionEmissionId, identityFilenameFor } from './identity.js';
import { visitReactiveSinkExpression } from './reactive-emission.js';
/** Transforms map call into its required representation. */
export function transformMapCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex,
	identityOverride?: string
): ts.Expression {
	if (node.arguments.length !== 3) return ts.visitEachChild(node, visitor, context);
	const nodeId = identityOverride ?? expressionEmissionId(node);
	if (!nodeId)
		throw new Error(
			`Missing canonical expression identity for this.map() emission in ${sourceFile.fileName}`
		);
	const id = stableId(identityFilenameFor(sourceFile), 'list', nodeId);
	const source = node.arguments[0]!;
	// Reactive sinks are rewritten before their nested calls are visited.  A
	// derived local therefore reaches this transform either as its identifier
	// (when used directly) or as its already-expanded collection expression.
	// Handle both forms so `const visible = tasks.filter(...); this.map(visible)`
	// remains a live list instead of becoming a one-time array snapshot.
	const sourceDerived = ts.isIdentifier(source)
		? derivedReactiveLocals?.references.get(expressionEmissionId(source) ?? '')
		: undefined;
	const initializer = sourceDerived?.initializer;
	const derivedCollection =
		initializer ?? (isDerivedCollectionExpression(source) ? source : undefined);
	const provenance = derivedCollection ? derivedCollectionSource(derivedCollection) : undefined;
	const keyIdentity = keyExtractorIdentity(node.arguments[1]!);
	const collection = sourceDerived?.cached
		? source
		: derivedCollection
			? context.factory.createCallExpression(
					context.factory.createPropertyAccessExpression(context.factory.createThis(), 'reactive'),
					undefined,
					[captureArgument(context, derivedCollection, visitor, sourceFile, derivedReactiveLocals)]
				)
			: (ts.visitNode(source, visitor) as ts.Expression);
	return context.factory.updateCallExpression(
		node,
		ts.visitNode(node.expression, visitor) as ts.Expression,
		node.typeArguments,
		[
			collection,
			...node.arguments
				.slice(1)
				.map((argument) => ts.visitNode(argument, visitor) as ts.Expression),
			context.factory.createStringLiteral(id),
			...(provenance || keyIdentity
				? [
						provenance
							? (ts.visitNode(provenance, visitor) as ts.Expression)
							: context.factory.createIdentifier('undefined')
					]
				: []),
			...(keyIdentity ? [context.factory.createStringLiteral(keyIdentity)] : [])
		]
	);
}

/** Transforms annotated map call into its required representation. */
export function transformAnnotatedMapCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	list: ExpressionJsxListSite,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const factory = context.factory;
	const item = factory.createUniqueName('__exactItem');
	const keyBody = list.primitive
		? item
		: list.method
			? factory.createCallExpression(
					factory.createPropertyAccessExpression(item, list.member!),
					undefined,
					[]
				)
			: factory.createPropertyAccessExpression(item, list.member!);
	const keyed = factory.createCallExpression(
		factory.createPropertyAccessExpression(factory.createThis(), 'map'),
		undefined,
		[
			(node.expression as ts.PropertyAccessExpression).expression,
			factory.createArrowFunction(
				undefined,
				undefined,
				[factory.createParameterDeclaration(undefined, undefined, item)],
				undefined,
				factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
				keyBody
			),
			node.arguments[0]!
		]
	);
	return transformMapCall(sourceFile, keyed, context, visitor, derivedReactiveLocals, list.nodeId);
}

/** Performs the key extractor identity domain operation. */
export function keyExtractorIdentity(expression: ts.Expression): string | undefined {
	if (!isFunctionLikeExpression(expression) || expression.parameters.length !== 1) return undefined;
	const parameter = expression.parameters[0]!.name;
	if (!ts.isIdentifier(parameter)) return undefined;
	let body: ts.Expression | undefined;
	if (ts.isBlock(expression.body)) {
		const returns = expression.body.statements.filter(ts.isReturnStatement);
		if (returns.length !== 1) return undefined;
		body = returns[0]!.expression;
	} else {
		body = expression.body;
	}
	if (!body) return undefined;
	const segments: string[] = [];
	let current = withoutParentheses(body);
	while (ts.isPropertyAccessExpression(current)) {
		segments.unshift(current.name.text);
		current = withoutParentheses(current.expression);
	}
	if (!ts.isIdentifier(current) || current.text !== parameter.text || !segments.length)
		return undefined;
	return `member:${segments.join('.')}`;
}

/** Reports whether derived collection expression. */
export function isDerivedCollectionExpression(expression: ts.Expression): boolean {
	const current = withoutParentheses(expression);
	return (
		ts.isCallExpression(current) &&
		ts.isPropertyAccessExpression(current.expression) &&
		['filter', 'map', 'flatMap', 'slice', 'concat', 'toSorted', 'toReversed', 'toSpliced'].includes(
			current.expression.name.text
		)
	);
}

/** Performs the derived collection source domain operation. */
export function derivedCollectionSource(expression: ts.Expression): ts.Expression | undefined {
	let current = withoutParentheses(expression);
	while (
		ts.isCallExpression(current) &&
		ts.isPropertyAccessExpression(current.expression) &&
		['filter', 'map', 'flatMap', 'slice', 'concat', 'toSorted', 'toReversed', 'toSpliced'].includes(
			current.expression.name.text
		)
	) {
		current = withoutParentheses(current.expression.expression);
	}
	if (!ts.isPropertyAccessExpression(current)) return undefined;
	if (
		ts.isPropertyAccessExpression(current.expression) &&
		current.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
		current.expression.name.text === 'state'
	)
		return current;
	// Component props preserve the parent collection identity; registering the
	// key against this value reaches the same raw reactive array at runtime.
	return ts.isIdentifier(current.expression) && current.expression.text === 'props'
		? current
		: undefined;
}

/** Performs the without parentheses domain operation. */
export function withoutParentheses(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (ts.isParenthesizedExpression(current)) current = current.expression;
	return current;
}

/** Performs the capture argument domain operation. */
export function captureArgument(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.ArrowFunction {
	return context.factory.createArrowFunction(
		undefined,
		undefined,
		[],
		undefined,
		context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		visitReactiveSinkExpression(context, expression, visitor, sourceFile, derivedReactiveLocals)
	);
}

/** Performs the template to expression domain operation. */
export function templateToExpression(template: ts.TemplateLiteral): ts.Expression {
	if (ts.isNoSubstitutionTemplateLiteral(template)) {
		return ts.factory.createStringLiteral(template.text);
	}

	return ts.factory.createTemplateExpression(
		template.head,
		template.templateSpans.map((span) =>
			ts.factory.createTemplateSpan(span.expression, span.literal)
		)
	);
}
