import ts from 'typescript';
import type { ExpressionJsxPlan } from '../../expression/jsx.js';
import type { HelperNames } from '../../types.js';

import type { DerivedReactiveIndex } from './contracts.js';
import { expressionEmissionId } from './identity.js';
import { visitReactiveSinkExpression } from './reactive-emission.js';
/** Runs element with the supplied execution context. */
export function callElement(
	context: ts.TransformationContext,
	tag: ts.Expression,
	attributes: ts.JsxAttributes | undefined,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	exactId?: string,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.element),
		undefined,
		[
			tag,
			propsObject(
				context,
				attributes,
				visitor,
				helpers,
				exactId,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			),
			...childrenExpressions(
				context,
				children,
				visitor,
				helpers,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			)
		]
	);
}

/** Runs fragment with the supplied execution context. */
export function callFragment(
	context: ts.TransformationContext,
	attributes: ts.JsxAttributes | undefined,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.fragment),
		undefined,
		[
			propsObject(
				context,
				attributes,
				visitor,
				helpers,
				undefined,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			),
			...childrenExpressions(
				context,
				children,
				visitor,
				helpers,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			)
		]
	);
}

/** Performs the props object domain operation. */
export function propsObject(
	context: ts.TransformationContext,
	attributes: ts.JsxAttributes | undefined,
	visitor: ts.Visitor,
	helpers: HelperNames,
	exactId?: string,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	const factory = context.factory;
	const properties: ts.ObjectLiteralElementLike[] = [];
	if (exactId) {
		properties.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('data-exact-id'),
				factory.createStringLiteral(exactId)
			)
		);
	}

	for (const property of attributes?.properties ?? []) {
		if (ts.isJsxSpreadAttribute(property)) {
			properties.push(
				factory.createSpreadAssignment(ts.visitNode(property.expression, visitor) as ts.Expression)
			);
			continue;
		}

		const name = property.name.getText();
		if (!property.initializer) {
			properties.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
			continue;
		}

		if (ts.isStringLiteral(property.initializer)) {
			properties.push(factory.createPropertyAssignment(propName(name), property.initializer));
			continue;
		}

		if (ts.isJsxExpression(property.initializer)) {
			const expression = property.initializer.expression;
			if (!expression) continue;
			const plannedCell = isPlannedJsxCell(
				property.initializer,
				'jsx-attribute',
				sourceFile,
				expressionJsx
			);
			properties.push(
				factory.createPropertyAssignment(
					propName(name),
					shouldWrapAttribute(name, expression) && plannedCell
						? wrapExpression(
								context,
								expression,
								visitor,
								helpers,
								sourceFile,
								derivedReactiveLocals
							)
						: (ts.visitNode(expression, visitor) as ts.Expression)
				)
			);
		}
	}

	return factory.createObjectLiteralExpression(properties, false);
}

/** Performs the prop name domain operation. */
export function propName(name: string): ts.PropertyName {
	return /^[$A-Z_a-z][$\w]*$/.test(name)
		? ts.factory.createIdentifier(name)
		: ts.factory.createStringLiteral(name);
}

/** Performs the children expressions domain operation. */
export function childrenExpressions(
	context: ts.TransformationContext,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression[] {
	const output: ts.Expression[] = [];

	for (const child of children) {
		if (ts.isJsxText(child)) {
			const text = child.text.replace(/\s+/g, ' ');
			if (text.trim()) output.push(context.factory.createStringLiteral(text));
			continue;
		}

		if (ts.isJsxExpression(child)) {
			if (child.expression)
				output.push(
					isPlannedJsxCell(child, 'jsx-child', sourceFile, expressionJsx)
						? wrapDynamicChild(
								context,
								child.expression,
								visitor,
								helpers,
								sourceFile,
								derivedReactiveLocals
							)
						: (ts.visitNode(child.expression, visitor) as ts.Expression)
				);
			continue;
		}

		output.push(ts.visitNode(child, visitor) as ts.Expression);
	}

	return output;
}

/** Reports whether planned jsx cell. */
export function isPlannedJsxCell(
	node: ts.JsxExpression,
	kind: 'jsx-child' | 'jsx-attribute',
	sourceFile?: ts.SourceFile,
	plan?: ExpressionJsxPlan
): boolean {
	if (!plan || !sourceFile) return true;
	const site = plan.cells.get(expressionEmissionId(node) ?? '');
	return site?.kind === kind && !site.preserveNative;
}

/** Reports whether wrap attribute. */
export function shouldWrapAttribute(name: string, expression: ts.Expression): boolean {
	if (name === 'key') return false;
	if (name === 'ref') return false;
	if (/^on[A-Z]/.test(name)) return false;
	if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return false;
	return true;
}

/** Performs the wrap dynamic child domain operation. */
export function wrapDynamicChild(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const factory = context.factory;
	return factory.createCallExpression(factory.createIdentifier(helpers.dynamic), undefined, [
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

/** Performs the wrap expression domain operation. */
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
