import * as ts from '../../native-typescript.js';
import { isIdentifierDeclarationName, isPropertyAccessName } from '../../ast.js';
import { collectExports } from '../../exports.js';
import type { ExpressionJsxPlan } from '../../expression/jsx.js';
import { stableId } from '../../ids.js';
import { generatedComponentName } from '../../names.js';
import type {
	ClientIslandCaptures,
	ClientIslandElementNode,
	ExactPlacement,
	ExactSemanticGraphIR,
	HelperNames
} from '../../types.js';
import { jsxTagIsIntrinsicElement } from './inspection.js';

import type { DerivedReactiveIndex } from './contracts.js';
import { canonicalElementId } from './element-emission.js';
import { expressionEmissionId, identityFilenameFor } from './identity.js';
import { islandProps } from './island-emission.js';
export { clientIslandCaptures } from './island-captures.js';
import {
	addInteractionHydrationMetadata,
	isInteractionHydrationIsland
} from './island-hydration.js';
import { bindingPropertyAssignments } from './form-binding-emission.js';
import { childrenExpressions } from './node-emission.js';
import { propName } from './property-emission.js';
import { tagExpression } from './reactive-emission.js';
/** Creates a client island boundary call. */
export function createClientIslandBoundaryCall(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	componentName: string | undefined,
	islandCounts: Map<string, number>,
	node: ClientIslandElementNode,
	children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	captures: ClientIslandCaptures = emptyClientIslandCaptures(),
	derivedReactiveLocals?: DerivedReactiveIndex,
	serverChildren?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[]
): ts.Expression {
	const factory = context.factory;
	const owner = componentName ?? 'Anonymous';
	const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
	const next = (islandCounts.get(owner) ?? 0) + 1;
	islandCounts.set(owner, next);
	const generatedName = generatedComponentName(owner, 'client-island', next);
	const id = stableId(identityFilenameFor(sourceFile), owner, 'client-island', String(next));
	let props = islandProps(context, attributes, children, captures.values, captures.stateReads);
	if (isInteractionHydrationIsland(node, !!serverChildren)) {
		props = addInteractionHydrationMetadata(
			sourceFile,
			context,
			visitor,
			helpers,
			node,
			props,
			derivedReactiveLocals
		);
	}
	return factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
		factory.createStringLiteral(id),
		factory.createStringLiteral(generatedName),
		props,
		...(serverChildren
			? childrenExpressions(
					context,
					serverChildren,
					visitor,
					helpers,
					sourceFile,
					derivedReactiveLocals
				)
			: [])
	]);
}

/** Performs the record client island definition domain operation. */
export function recordClientIslandDefinition(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	componentName: string | undefined,
	islandCounts: Map<string, number>,
	node: ClientIslandElementNode,
	definitions: ts.FunctionDeclaration[],
	captures: ClientIslandCaptures = emptyClientIslandCaptures(),
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): void {
	const owner = componentName ?? 'Anonymous';
	const next = (islandCounts.get(owner) ?? 0) + 1;
	islandCounts.set(owner, next);
	definitions.push(
		createClientIslandDefinition(
			sourceFile,
			context,
			visitor,
			helpers,
			owner,
			next,
			node,
			captures,
			derivedReactiveLocals,
			expressionJsx
		)
	);
}

/** Creates a client island definition. */
export function createClientIslandDefinition(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	owner: string,
	index: number,
	node: ClientIslandElementNode,
	captures: ClientIslandCaptures,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.FunctionDeclaration {
	const factory = context.factory;
	const props = factory.createIdentifier('props');
	const generatedName = generatedComponentName(owner, 'client-island', index);
	const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
	const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
	const children = captures.serverSlotChildren
		? undefined
		: ts.isJsxElement(node)
			? node.children
			: [];
	return factory.createFunctionDeclaration(
		[factory.createModifier(ts.SyntaxKind.ExportKeyword)],
		undefined,
		factory.createIdentifier(generatedName),
		undefined,
		[
			factory.createParameterDeclaration(
				undefined,
				undefined,
				factory.createIdentifier('this'),
				undefined,
				factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
			),
			factory.createParameterDeclaration(
				undefined,
				undefined,
				props,
				undefined,
				factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
				factory.createObjectLiteralExpression([], false)
			)
		],
		undefined,
		factory.createBlock(
			[
				...capturedFunctionDeclarations(context, captures.functions, props, captures.values),
				createClientIslandStateInit(factory, props),
				factory.createReturnStatement(
					factory.createArrowFunction(
						undefined,
						undefined,
						[],
						undefined,
						factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
						factory.createCallExpression(factory.createIdentifier(helpers.element), undefined, [
							tagExpression(tagName),
							clientIslandElementProps(
								sourceFile,
								context,
								tagName,
								attributes,
								node,
								props,
								captures.values,
								visitor,
								helpers,
								derivedReactiveLocals,
								expressionJsx
							),
							...clientIslandChildrenExpressions(
								context,
								children,
								visitor,
								helpers,
								props,
								captures.values,
								captures.serverSlotChildren
							)
						])
					)
				)
			],
			true
		)
	);
}

/** Creates a client island state init. */
export function createClientIslandStateInit(
	factory: ts.NodeFactory,
	props: ts.Identifier
): ts.Statement {
	return factory.createIfStatement(
		factory.createPropertyAccessExpression(props, '__exactState'),
		factory.createExpressionStatement(
			factory.createCallExpression(
				factory.createPropertyAccessExpression(factory.createIdentifier('Object'), 'assign'),
				undefined,
				[
					factory.createPropertyAccessExpression(factory.createThis(), 'state'),
					factory.createPropertyAccessExpression(props, '__exactState')
				]
			)
		)
	);
}

/** Performs the append server part export aliases domain operation. */
export function appendServerPartExportAliases(
	sourceFile: ts.SourceFile,
	transformed: ts.SourceFile,
	factory: ts.NodeFactory,
	islandCounts: Map<string, number>,
	componentPlacements: Map<string, ExactPlacement>,
	semanticGraph: ExactSemanticGraphIR
): ts.SourceFile {
	const exportedNames = collectExports(sourceFile, semanticGraph);
	const aliases: ts.ExportDeclaration[] = [];
	for (const [name, count] of [...islandCounts].sort(([left], [right]) =>
		left.localeCompare(right)
	)) {
		if (count <= 0) continue;
		if (!exportedNames.has(name)) continue;
		if (componentPlacements.get(name) === 'client') continue;
		aliases.push(
			factory.createExportDeclaration(
				undefined,
				false,
				factory.createNamedExports([
					factory.createExportSpecifier(
						false,
						factory.createIdentifier(name),
						factory.createIdentifier(generatedComponentName(name, 'server-part', 1))
					)
				]),
				undefined
			)
		);
	}
	return aliases.length
		? factory.updateSourceFile(transformed, [...transformed.statements, ...aliases])
		: transformed;
}

/** Performs the client island element props domain operation. */
export function clientIslandElementProps(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	node: ts.Node,
	props: ts.Identifier,
	captures: readonly string[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.ObjectLiteralExpression {
	const factory = context.factory;
	const properties: ts.ObjectLiteralElementLike[] = [];
	const exactId = jsxTagIsIntrinsicElement(tagName)
		? canonicalElementId(sourceFile, node)
		: undefined;
	if (exactId) {
		properties.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('data-exact-id'),
				factory.createStringLiteral(exactId)
			)
		);
	}
	for (const attribute of attributes.properties) {
		if (ts.isJsxSpreadAttribute(attribute)) {
			properties.push(factory.createSpreadAssignment(props));
			continue;
		}
		const name = attribute.name.getText(sourceFile);
		const initializer = attribute.initializer;
		const binding =
			initializer && ts.isJsxExpression(initializer) && initializer.expression
				? expressionJsx?.bindings.get(expressionEmissionId(initializer) ?? '')
				: undefined;
		if (binding && initializer && ts.isJsxExpression(initializer) && initializer.expression) {
			const target = ts.visitNode(
				rewriteCapturedNode(context, initializer.expression, props, captures),
				visitor
			) as ts.Expression;
			const valueAttribute = attributes.properties.find(
				(candidate): candidate is ts.JsxAttribute =>
					ts.isJsxAttribute(candidate) && candidate.name.getText(sourceFile) === 'value'
			);
			properties.push(
				...bindingPropertyAssignments(
					context,
					target,
					binding,
					islandBindingValueAttribute(factory, valueAttribute, props),
					visitor,
					helpers,
					sourceFile,
					derivedReactiveLocals
				)
			);
			continue;
		}
		if (!attribute.initializer) {
			properties.push(
				factory.createPropertyAssignment(
					propName(name),
					factory.createPropertyAccessExpression(props, name)
				)
			);
			continue;
		}
		if (/^on[A-Z]/.test(name) || name === 'ref') {
			if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
				properties.push(
					factory.createPropertyAssignment(
						propName(name),
						rewriteCapturedNode(context, attribute.initializer.expression, props, captures)
					)
				);
			}
			continue;
		}
		properties.push(
			factory.createPropertyAssignment(
				propName(name),
				factory.createPropertyAccessExpression(props, name)
			)
		);
	}
	return factory.createObjectLiteralExpression(properties, false);
}

function islandBindingValueAttribute(
	factory: ts.NodeFactory,
	attribute: ts.JsxAttribute | undefined,
	props: ts.Identifier
): ts.JsxAttribute | undefined {
	if (!attribute?.initializer || ts.isStringLiteral(attribute.initializer)) return attribute;
	return factory.updateJsxAttribute(
		attribute,
		attribute.name,
		factory.createJsxExpression(undefined, factory.createPropertyAccessExpression(props, 'value'))
	);
}

/** Performs the client island children expressions domain operation. */
export function clientIslandChildrenExpressions(
	context: ts.TransformationContext,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[] | undefined,
	visitor: ts.Visitor,
	helpers: HelperNames,
	props: ts.Identifier,
	captures: readonly string[],
	serverSlotChildren = false
): ts.Expression[] {
	if (serverSlotChildren) {
		return [context.factory.createPropertyAccessExpression(props, 'children')];
	}
	const rewritten = (children ?? []).map((child) =>
		rewriteCapturedNode(context, child, props, captures)
	);
	return childrenExpressions(context, rewritten, visitor, helpers);
}

function rewriteCapturedNode<T extends ts.Node>(
	context: ts.TransformationContext,
	node: T,
	props: ts.Identifier,
	captures: readonly string[]
): T {
	if (!captures.length) return node;
	const captureSet = new Set(captures);
	const visitor: ts.Visitor = (current) => {
		if (
			ts.isIdentifier(current) &&
			captureSet.has(current.text) &&
			!isIdentifierDeclarationName(current) &&
			!isPropertyAccessName(current)
		) {
			return context.factory.createPropertyAccessExpression(
				context.factory.createPropertyAccessExpression(props, '__exactCapture'),
				current.text
			);
		}
		return ts.visitEachChild(current, visitor, context);
	};
	return ts.visitNode(node, visitor) as T;
}

/** Performs the captured function declarations domain operation. */
export function capturedFunctionDeclarations(
	context: ts.TransformationContext,
	functions: readonly ts.Statement[],
	props: ts.Identifier,
	captures: readonly string[]
): ts.Statement[] {
	return functions.map((fn) => rewriteCapturedNode(context, fn, props, captures));
}

/** Performs the empty client island captures domain operation. */
export function emptyClientIslandCaptures(): ClientIslandCaptures {
	return { values: [], functions: [] };
}
