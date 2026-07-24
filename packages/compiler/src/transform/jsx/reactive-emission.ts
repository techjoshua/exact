import ts from 'typescript';
import { isIdentifierDeclarationName, isPropertyAccessName } from '../../ast.js';
import {
	isFunctionLikeExpression,
	isThisMethodAccess,
	isThisMethodCall,
	isThisTaskCall
} from '../../calls.js';
import type {
	ExpressionTaskResource,
	ExpressionTaskResourceKind,
	ExpressionTaskSite,
	ExpressionTaskSignalCall
} from '../../expression/task-contracts.js';
import type { HelperNames } from '../../types.js';

import { captureArgument, templateToExpression, transformMapCall } from './collection-emission.js';
import type { DerivedReactiveIndex } from './contracts.js';
import { expressionEmissionId } from './identity.js';
import { transformTaskCall } from './task-emission.js';
/** Performs the visit reactive sink expression domain operation. */
export function visitReactiveSinkExpression(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const rewritten =
		sourceFile && derivedReactiveLocals?.references.size
			? rewriteDerivedReactiveExpression(context, expression, sourceFile, derivedReactiveLocals)
			: expression;
	return ts.visitNode(rewritten, visitor) as ts.Expression;
}

/** Transforms derived reactive expression into its required representation. */
export function rewriteDerivedReactiveExpression(
	context: ts.TransformationContext,
	expression: ts.Expression,
	sourceFile: ts.SourceFile,
	derivedReactiveLocals: DerivedReactiveIndex,
	active = new Set<string>()
): ts.Expression {
	const visitor: ts.Visitor = (node) => {
		if (ts.isCallExpression(node) && (isThisMethodCall(node, 'map') || isThisTaskCall(node))) {
			const preserved = isThisMethodCall(node, 'map')
				? new Set([0])
				: new Set(node.arguments.map((_, index) => index).slice(0, -1));
			return context.factory.updateCallExpression(
				node,
				ts.visitNode(node.expression, visitor) as ts.Expression,
				node.typeArguments,
				node.arguments.map((argument, index) =>
					preserved.has(index) ? argument : (ts.visitNode(argument, visitor) as ts.Expression)
				)
			);
		}
		if (ts.isShorthandPropertyAssignment(node)) {
			const derived = derivedReactiveLocals.references.get(expressionEmissionId(node.name) ?? '');
			if (derived?.cached) {
				return context.factory.createPropertyAssignment(
					context.factory.createIdentifier(node.name.text),
					context.factory.createCallExpression(
						context.factory.createPropertyAccessExpression(
							context.factory.createIdentifier(node.name.text),
							'get'
						),
						undefined,
						[]
					)
				);
			}
		}
		if (
			ts.isIdentifier(node) &&
			!isIdentifierDeclarationName(node) &&
			!isPropertyAccessName(node)
		) {
			const derived = derivedReactiveLocals.references.get(expressionEmissionId(node) ?? '');
			if (derived && !active.has(derived.variableId)) {
				if (derived.cached) {
					return context.factory.createCallExpression(
						context.factory.createPropertyAccessExpression(
							context.factory.createIdentifier(node.text),
							'get'
						),
						undefined,
						[]
					);
				}
				active.add(derived.variableId);
				const rewritten = rewriteDerivedReactiveExpression(
					context,
					derived.initializer,
					sourceFile,
					derivedReactiveLocals,
					active
				);
				active.delete(derived.variableId);
				return context.factory.createParenthesizedExpression(rewritten);
			}
		}
		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(expression, visitor) as ts.Expression;
}

/** Performs the tag expression domain operation. */
export function tagExpression(tagName: ts.JsxTagNameExpression): ts.Expression {
	if (ts.isIdentifier(tagName)) {
		const text = tagName.text;
		return /^[a-z]/.test(text)
			? ts.factory.createStringLiteral(text)
			: ts.factory.createIdentifier(text);
	}

	if (ts.isPropertyAccessExpression(tagName)) {
		return ts.factory.createPropertyAccessExpression(
			tagExpression(tagName.expression as ts.JsxTagNameExpression),
			tagName.name
		);
	}

	return ts.factory.createStringLiteral(tagName.getText());
}

/** Transforms captured call into its required representation. */
export function transformCapturedCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex,
	helpers?: HelperNames,
	markAbortOptions?: () => void,
	resourceFor?: (node: ts.Node) => ExpressionTaskResource | undefined,
	markResource?: (kind: ExpressionTaskResourceKind) => void,
	markAwait?: () => void,
	signalFor?: (node: ts.Node) => ExpressionTaskSignalCall | undefined,
	markSignal?: (mode: ExpressionTaskSignalCall['mode']) => void,
	taskSite?: ExpressionTaskSite
): ts.Expression {
	if (isThisMethodCall(node, 'reactive')) {
		return transformReactiveCall(sourceFile, node, context, visitor, derivedReactiveLocals);
	}

	if (isThisTaskCall(node)) {
		return transformTaskCall(
			sourceFile,
			node,
			context,
			visitor,
			derivedReactiveLocals,
			helpers,
			markAbortOptions,
			resourceFor,
			markResource,
			markAwait,
			signalFor,
			markSignal,
			taskSite
		);
	}

	if (isThisMethodCall(node, 'map')) {
		return transformMapCall(sourceFile, node, context, visitor, derivedReactiveLocals);
	}

	return ts.visitEachChild(node, visitor, context);
}

/** Transforms reactive tagged template into its required representation. */
export function transformReactiveTaggedTemplate(
	node: ts.TaggedTemplateExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor
): ts.Expression {
	if (!isThisMethodAccess(node.tag, 'reactive')) {
		return ts.visitEachChild(node, visitor, context);
	}

	return context.factory.createCallExpression(
		ts.visitNode(node.tag, visitor) as ts.Expression,
		node.typeArguments,
		[captureArgument(context, templateToExpression(node.template), visitor)]
	);
}

/** Transforms reactive call into its required representation. */
export function transformReactiveCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	if (node.arguments.length !== 1) return ts.visitEachChild(node, visitor, context);
	const [argument] = node.arguments;
	if (!argument || isFunctionLikeExpression(argument))
		return ts.visitEachChild(node, visitor, context);

	return context.factory.updateCallExpression(
		node,
		ts.visitNode(node.expression, visitor) as ts.Expression,
		node.typeArguments,
		[captureArgument(context, argument, visitor, sourceFile, derivedReactiveLocals)]
	);
}
