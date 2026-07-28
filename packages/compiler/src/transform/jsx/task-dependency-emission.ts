import * as ts from '../../native-typescript.js';
import type { ExpressionTaskDependency } from '../../expression/task-dependencies.js';
import { expressionEmissionId } from './identity.js';
import { parseTypeNode } from './type-node.js';

/** Adds compiler-generated dependency values before the authored task context parameter. */
export function prependDependencyParameters(
	work: ts.ArrowFunction | ts.FunctionExpression,
	parameters: readonly Readonly<{ name: string; type: string }>[],
	context: ts.TransformationContext
): ts.ArrowFunction | ts.FunctionExpression {
	const declarations = parameters.map((parameter) =>
		context.factory.createParameterDeclaration(
			undefined,
			undefined,
			parameter.name,
			undefined,
			parseTypeNode(parameter.type)
		)
	);
	declarations.push(...work.parameters);
	if (ts.isArrowFunction(work))
		return context.factory.updateArrowFunction(
			work,
			work.modifiers,
			work.typeParameters,
			declarations,
			work.type,
			work.equalsGreaterThanToken,
			work.body
		);
	return context.factory.updateFunctionExpression(
		work,
		work.modifiers,
		work.asteriskToken,
		work.name,
		work.typeParameters,
		declarations,
		work.type,
		work.body
	);
}

/** Allocates collision-free parameter names for inferred task dependencies. */
export function allocateDependencyParameters(
	work: ts.FunctionLikeDeclaration,
	dependencies: readonly ExpressionTaskDependency[]
): ReadonlyArray<Readonly<{ name: string; type: string }>> {
	const used = new Set<string>();
	const collect = (node: ts.Node): void => {
		if (ts.isIdentifier(node)) used.add(node.text);
		ts.forEachChild(node, collect);
	};
	collect(work);
	const parameters: Array<Readonly<{ name: string; type: string }>> = [];
	for (let index = 0; index < dependencies.length; index++) {
		let name = `__exactDependency${index || ''}`;
		while (used.has(name)) name += '_';
		used.add(name);
		parameters.push(Object.freeze({ name, type: dependencies[index]!.type }));
	}
	return parameters;
}

/** Replaces inferred dependency reads with their generated callback parameters. */
export function rewriteTaskDependencyReads(
	work: ts.ArrowFunction | ts.FunctionExpression,
	dependencies: readonly ExpressionTaskDependency[],
	parameters: readonly Readonly<{ name: string; type: string }>[],
	context: ts.TransformationContext
): ts.ArrowFunction | ts.FunctionExpression {
	const replacements = new Map<string, ts.Identifier>();
	dependencies.forEach((dependency, index) => {
		const parameter = context.factory.createIdentifier(parameters[index]!.name);
		for (const nodeId of dependency.readNodeIds) replacements.set(nodeId, parameter);
	});
	const rewrite: ts.Visitor = (node) => {
		const replacement = replacements.get(expressionEmissionId(node) ?? '');
		return replacement ?? ts.visitEachChild(node, rewrite, context);
	};
	return ts.visitNode(work, rewrite) as ts.ArrowFunction | ts.FunctionExpression;
}

/** Finds the authored expression represented by one expression-analysis node identifier. */
export function findTaskExpressionNode(work: ts.Node, nodeId: string): ts.Expression | undefined {
	let found: ts.Expression | undefined;
	const visit = (node: ts.Node): void => {
		if (found) return;
		if (expressionEmissionId(node) === nodeId && ts.isExpression(node)) {
			found = node;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(work);
	return found;
}
