import ts from 'typescript';
import { stableId } from '../../ids.js';
import { clientComponentBoundaryId } from '../../names.js';
import type { ExactImportedComponentIR, HelperNames, StateSnapshotTree } from '../../types.js';
import { componentBoundaryName } from './inspection.js';

import { expressionEmissionId, identityFilenameFor } from './identity.js';
import { childrenExpressions, propName } from './node-emission.js';
/** Creates a component island boundary call. */
export function createComponentIslandBoundaryCall(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	componentInfo: Map<string, ExactImportedComponentIR>,
	node: ts.Node,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children?: ts.Expression,
	serverChildren?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[]
): ts.Expression {
	const factory = context.factory;
	const componentName = componentBoundaryName(tagName, componentInfo, sourceFile);
	const nodeId = expressionEmissionId(node);
	if (!nodeId)
		throw new Error(
			`Missing canonical expression identity for component boundary emission in ${sourceFile.fileName}`
		);
	const id = clientComponentBoundaryId(sourceFile.fileName, componentName, nodeId);
	const props = islandProps(context, attributes);
	return factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
		factory.createStringLiteral(id),
		factory.createStringLiteral(componentName),
		children === undefined ? props : appendObjectProperty(context, props, 'children', children),
		...(serverChildren ? childrenExpressions(context, serverChildren, visitor, helpers) : [])
	]);
}

/** Creates a client component server stub. */
export function createClientComponentServerStub(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	helpers: HelperNames,
	node: ts.FunctionDeclaration
): ts.FunctionDeclaration {
	const factory = context.factory;
	const componentName = node.name!.text;
	const props = factory.createIdentifier('props');
	const id = stableId(identityFilenameFor(sourceFile), componentName, 'component-island');
	return factory.updateFunctionDeclaration(
		node,
		node.modifiers,
		node.asteriskToken,
		node.name,
		undefined,
		[
			factory.createParameterDeclaration(
				undefined,
				undefined,
				props,
				undefined,
				undefined,
				factory.createObjectLiteralExpression([], false)
			)
		],
		undefined,
		factory.createBlock(
			[
				factory.createReturnStatement(
					factory.createArrowFunction(
						undefined,
						undefined,
						[],
						undefined,
						factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
						factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
							factory.createStringLiteral(id),
							factory.createStringLiteral(componentName),
							props
						])
					)
				)
			],
			true
		)
	);
}

/** Performs the island props domain operation. */
export function islandProps(
	context: ts.TransformationContext,
	attributes: ts.JsxAttributes,
	children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	captures: readonly string[] = [],
	plannedStateReads: readonly string[] = []
): ts.ObjectLiteralExpression {
	const props: ts.ObjectLiteralElementLike[] = [];
	const factory = context.factory;
	if (plannedStateReads.length) {
		props.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('__exactState'),
				stateSnapshotObject(factory, plannedStateReads)
			)
		);
	}
	if (captures.length) {
		props.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('__exactCapture'),
				factory.createObjectLiteralExpression(
					captures.map((name) =>
						factory.createPropertyAssignment(propName(name), factory.createIdentifier(name))
					),
					false
				)
			)
		);
	}
	for (const attribute of attributes.properties) {
		if (ts.isJsxSpreadAttribute(attribute)) {
			props.push(factory.createSpreadAssignment(attribute.expression));
			continue;
		}
		const name = attribute.name.getText();
		if (/^on[A-Z]/.test(name) || name === 'ref') continue;
		if (!attribute.initializer) {
			props.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
			continue;
		}
		if (ts.isStringLiteral(attribute.initializer)) {
			props.push(
				factory.createPropertyAssignment(
					propName(name),
					factory.createStringLiteral(attribute.initializer.text)
				)
			);
			continue;
		}
		if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
			const expression = attribute.initializer.expression;
			props.push(factory.createPropertyAssignment(propName(name), expression));
		}
	}
	return factory.createObjectLiteralExpression(props, false);
}

/** Performs the state snapshot object domain operation. */
export function stateSnapshotObject(
	factory: ts.NodeFactory,
	paths: readonly string[]
): ts.ObjectLiteralExpression {
	const root: StateSnapshotTree = new Map();
	for (const path of paths) {
		let cursor = root;
		const segments = path.split('.');
		for (const segment of segments.slice(0, -1)) {
			if (!cursor.has(segment)) cursor.set(segment, new Map());
			const next = cursor.get(segment);
			if (!(next instanceof Map)) break;
			cursor = next;
		}
		cursor.set(segments[segments.length - 1]!, stateAccessExpression(factory, segments));
	}
	return mapToObjectLiteral(factory, root);
}

/** Performs the map to object literal domain operation. */
export function mapToObjectLiteral(
	factory: ts.NodeFactory,
	map: StateSnapshotTree
): ts.ObjectLiteralExpression {
	return factory.createObjectLiteralExpression(
		[...map.entries()].map(([name, value]) =>
			factory.createPropertyAssignment(
				propName(name),
				value instanceof Map ? mapToObjectLiteral(factory, value) : value
			)
		),
		false
	);
}

/** Performs the append object property domain operation. */
export function appendObjectProperty(
	context: ts.TransformationContext,
	object: ts.ObjectLiteralExpression,
	name: string,
	value: ts.Expression
): ts.ObjectLiteralExpression {
	return context.factory.updateObjectLiteralExpression(object, [
		...object.properties,
		context.factory.createPropertyAssignment(propName(name), value)
	]);
}

/** Performs the state access expression domain operation. */
export function stateAccessExpression(
	factory: ts.NodeFactory,
	segments: readonly string[]
): ts.Expression {
	let expression: ts.Expression = factory.createPropertyAccessExpression(
		factory.createThis(),
		'state'
	);
	for (const segment of segments) {
		expression = isIdentifierText(segment)
			? factory.createPropertyAccessExpression(expression, segment)
			: factory.createElementAccessExpression(expression, factory.createStringLiteral(segment));
	}
	return expression;
}

/** Reports whether identifier text. */
export function isIdentifierText(value: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}
