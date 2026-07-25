import ts from 'typescript';
import { isFunctionLikeExpression } from '../../calls.js';
import type { ExpressionDerivedPlan } from '../../expression/derived.js';
import type { ExpressionJsxPlan } from '../../expression/jsx.js';
import { stableId } from '../../ids.js';
import type { HelperNames } from '../../types.js';

import type {
	ComponentLocalInfo,
	DerivedReactiveEntry,
	DerivedReactiveIndex
} from './contracts.js';
import { expressionEmissionId, identityFilenameFor } from './identity.js';
import { callElement, callFragment } from './node-emission.js';
import { tagExpression, visitReactiveSinkExpression } from './reactive-emission.js';
/** Transforms jsx element into its required representation. */
export function transformJsxElement(
	sourceFile: ts.SourceFile,
	node: ts.JsxElement,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	const opening = node.openingElement;
	const tagName = opening.tagName.getText();
	if (tagName === '_') {
		return callFragment(
			context,
			opening.attributes,
			node.children,
			visitor,
			helpers,
			sourceFile,
			derivedReactiveLocals
		);
	}

	const site = expressionJsx?.elements.get(expressionEmissionId(node) ?? '');
	const tag = site?.reactiveTag
		? visitReactiveSinkExpression(
				context,
				opening.tagName as ts.Expression,
				visitor,
				sourceFile,
				derivedReactiveLocals
			)
		: tagExpression(opening.tagName);
	const element = callElement(
		context,
		tag,
		opening.attributes,
		node.children,
		visitor,
		helpers,
		canonicalElementId(sourceFile, node, expressionJsx),
		sourceFile,
		derivedReactiveLocals,
		expressionJsx
	);
	return site?.reactiveTag
		? context.factory.createCallExpression(
				context.factory.createIdentifier(helpers.dynamic),
				undefined,
				[
					context.factory.createArrowFunction(
						undefined,
						undefined,
						[],
						undefined,
						context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
						element
					)
				]
			)
		: element;
}

/** Transforms jsx self closing element into its required representation. */
export function transformJsxSelfClosingElement(
	sourceFile: ts.SourceFile,
	node: ts.JsxSelfClosingElement,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	const tagName = node.tagName.getText();
	if (tagName === '_') {
		return callFragment(
			context,
			node.attributes,
			[],
			visitor,
			helpers,
			sourceFile,
			derivedReactiveLocals
		);
	}

	const site = expressionJsx?.elements.get(expressionEmissionId(node) ?? '');
	const tag = site?.reactiveTag
		? visitReactiveSinkExpression(
				context,
				node.tagName as ts.Expression,
				visitor,
				sourceFile,
				derivedReactiveLocals
			)
		: tagExpression(node.tagName);
	const element = callElement(
		context,
		tag,
		node.attributes,
		[],
		visitor,
		helpers,
		canonicalElementId(sourceFile, node, expressionJsx),
		sourceFile,
		derivedReactiveLocals,
		expressionJsx
	);
	return site?.reactiveTag
		? context.factory.createCallExpression(
				context.factory.createIdentifier(helpers.dynamic),
				undefined,
				[
					context.factory.createArrowFunction(
						undefined,
						undefined,
						[],
						undefined,
						context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
						element
					)
				]
			)
		: element;
}

/** Performs the canonical element id domain operation. */
export function canonicalElementId(
	sourceFile: ts.SourceFile,
	node: ts.Node,
	plan?: ExpressionJsxPlan
): string | undefined {
	const nodeId = expressionEmissionId(node);
	if (!nodeId)
		throw new Error(
			`Missing canonical expression identity for JSX emission in ${sourceFile.fileName}`
		);
	if (plan) return plan.elements.get(nodeId)?.exactId;
	return stableId(identityFilenameFor(sourceFile), 'element', nodeId);
}

/** Transforms jsx fragment into its required representation. */
export function transformJsxFragment(
	node: ts.JsxFragment,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	return callFragment(
		context,
		undefined,
		node.children,
		visitor,
		helpers,
		sourceFile,
		derivedReactiveLocals,
		expressionJsx
	);
}

/** Collects component local info in deterministic order. */
export function collectComponentLocalInfo(node: ts.FunctionLikeDeclaration): ComponentLocalInfo {
	const functions = new Map<string, ts.Statement>();
	function visit(current: ts.Node): void {
		if (current !== node && ts.isFunctionDeclaration(current) && current.name) {
			functions.set(current.name.text, current);
			return;
		}
		if (current !== node && (ts.isFunctionLike(current) || ts.isClassLike(current))) return;
		if (ts.isVariableDeclaration(current)) {
			if (
				ts.isIdentifier(current.name) &&
				current.initializer &&
				isFunctionLikeExpression(current.initializer)
			) {
				functions.set(
					current.name.text,
					cloneableFunctionVariable(current.name, current.initializer)
				);
			}
		}
		ts.forEachChild(current, visit);
	}
	if (node.body) visit(node.body);
	return { functions };
}

/**
 * Materializes source expressions for variables whose reactive provenance was
 * established by @exactjs/expressions. The TypeScript nodes are retained only as
 * emission handles; deciding which declarations are derived is expression-owned.
 */
export function collectExpressionDerivedLocals(
	sourceFile: ts.SourceFile,
	plan: ExpressionDerivedPlan
): DerivedReactiveIndex {
	const initializers = new Map<string, ts.Expression>();
	const requested = new Set([...plan.sites.values()].map((site) => site.initializerNodeId));
	function visit(current: ts.Node): void {
		if (ts.isVariableDeclaration(current) && current.initializer) {
			const key = expressionEmissionId(current.initializer);
			if (key && requested.has(key)) initializers.set(key, current.initializer);
		}
		ts.forEachChild(current, visit);
	}
	visit(sourceFile);
	const references = new Map<string, DerivedReactiveEntry>();
	const declarations = new Map<string, DerivedReactiveEntry>();
	for (const site of plan.sites.values()) {
		const initializer = initializers.get(site.initializerNodeId);
		if (initializer)
			references.set(site.nodeId, {
				variableId: site.variableId,
				initializer,
				cached: site.cached
			});
	}
	for (const declaration of plan.declarations.values()) {
		const initializer = initializers.get(declaration.initializerNodeId);
		if (initializer)
			declarations.set(declaration.nodeId, {
				variableId: declaration.variableId,
				initializer,
				cached: declaration.cached
			});
	}
	return { references, declarations };
}

/** Performs the cloneable function variable domain operation. */
export function cloneableFunctionVariable(
	name: ts.Identifier,
	initializer: ts.Expression
): ts.VariableStatement {
	return ts.factory.createVariableStatement(
		undefined,
		ts.factory.createVariableDeclarationList(
			[ts.factory.createVariableDeclaration(name, undefined, undefined, initializer)],
			ts.NodeFlags.Const
		)
	);
}
