import ts from 'typescript';
import type {
	ExpressionComponentPlan,
	ExpressionComponentSite
} from '../../expression/contracts.js';
import type { ExactPlacement, HelperNames, TransformTarget } from '../../types.js';
import { isFunctionLikeExpression } from '../../calls.js';

import { collectComponentLocalInfo } from './element-emission.js';
import { expressionEmissionId } from './identity.js';
import { createClientComponentServerStubExpression } from './island-emission.js';
import { createClientComponentServerStub } from './island-emission.js';
import type { JsxTransformState } from './transform-state.js';

/** Visits a function-valued component while maintaining component ownership stacks. */
export function visitVariableComponent(
	node: ts.FunctionExpression | ts.ArrowFunction,
	site: ExpressionComponentSite,
	state: JsxTransformState,
	visitor: ts.Visitor,
	context: ts.TransformationContext
): ts.FunctionExpression | ts.ArrowFunction {
	state.componentStack.push(site.name);
	state.componentSiteStack.push(site.id);
	state.componentLocalStack.push(collectComponentLocalInfo(node));
	const visited = ts.visitEachChild(node, visitor, context);
	state.componentLocalStack.pop();
	state.componentSiteStack.pop();
	state.componentStack.pop();
	return visited;
}

/** Lowers a function declaration component while preserving artifact placement rules. */
export function transformFunctionComponentDeclaration(
	sourceFile: ts.SourceFile,
	node: ts.FunctionDeclaration,
	components: ExpressionComponentPlan,
	componentPlacements: ReadonlyMap<string, ExactPlacement>,
	state: JsxTransformState,
	visitor: ts.Visitor,
	context: ts.TransformationContext,
	helpers: HelperNames,
	target: TransformTarget,
	serverComponents: boolean
): ts.VisitResult<ts.Node> | undefined {
	if (!node.name) return undefined;
	const site = components.sites.get(expressionEmissionId(node) ?? '');
	if (!site) return undefined;
	if (target === 'server' && componentPlacements.get(node.name.text) === 'client') {
		state.sawBoundary = true;
		return createClientComponentServerStub(sourceFile, context, helpers, node);
	}
	state.componentStack.push(node.name.text);
	state.componentSiteStack.push(site.id);
	state.componentLocalStack.push(collectComponentLocalInfo(node));
	if (target === 'client' && serverComponents && site.serverEffects) {
		ts.visitEachChild(node, visitor, context);
		state.componentLocalStack.pop();
		state.componentStack.pop();
		state.componentSiteStack.pop();
		return context.factory.createEmptyStatement();
	}
	const visited = ts.visitEachChild(node, visitor, context);
	state.componentLocalStack.pop();
	state.componentStack.pop();
	state.componentSiteStack.pop();
	return visited;
}

/**
 * Handles function-valued server components removed from a client artifact.
 *
 * The component body is still visited so nested client islands are published
 * before the declaration itself is omitted.
 */
export function retainVariableComponentInClientArtifact(
	initializer: ts.Expression,
	components: ExpressionComponentPlan,
	state: JsxTransformState,
	visitor: ts.Visitor,
	context: ts.TransformationContext,
	target: TransformTarget,
	serverComponents: boolean
): boolean | undefined {
	const site = components.sites.get(expressionEmissionId(initializer) ?? '');
	if (!site) return undefined;
	if (
		target === 'client' &&
		serverComponents &&
		site.serverEffects &&
		isFunctionLikeExpression(initializer)
	) {
		visitVariableComponent(initializer, site, state, visitor, context);
		return false;
	}
	return true;
}

/** Lowers a function-valued component declaration for the selected artifact target. */
export function transformVariableComponentDeclaration(
	sourceFile: ts.SourceFile,
	node: ts.VariableDeclaration,
	components: ExpressionComponentPlan,
	componentPlacements: ReadonlyMap<string, ExactPlacement>,
	state: JsxTransformState,
	visitor: ts.Visitor,
	context: ts.TransformationContext,
	helpers: HelperNames,
	target: TransformTarget
): ts.VariableDeclaration | undefined {
	const initializer = node.initializer;
	if (!initializer || !isFunctionLikeExpression(initializer)) return undefined;
	const site = components.sites.get(expressionEmissionId(initializer) ?? '');
	if (!site) return undefined;
	if (target === 'server' && componentPlacements.get(site.name) === 'client') {
		state.sawBoundary = true;
		return context.factory.updateVariableDeclaration(
			node,
			node.name,
			node.exclamationToken,
			node.type,
			createClientComponentServerStubExpression(sourceFile, context, helpers, site.name)
		);
	}
	return context.factory.updateVariableDeclaration(
		node,
		node.name,
		node.exclamationToken,
		node.type,
		visitVariableComponent(initializer, site, state, visitor, context)
	);
}
