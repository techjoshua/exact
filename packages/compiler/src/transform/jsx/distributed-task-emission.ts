import ts from 'typescript';
import { isThisTaskCall, taskRequestedPlacement } from '../../calls.js';
import type { ExpressionComponentPlan } from '../../expression/contracts.js';
import type { ExpressionTaskPlan, ExpressionTaskSite } from '../../expression/task-contracts.js';
import { stableId } from '../../ids.js';
import type { ExactPlacement, HelperNames, TransformTarget } from '../../types.js';
import { expressionEmissionId } from './identity.js';

/** Adds matching opaque continuation IDs to analyzed task sites in source order. */
export function createDistributedTaskSites(
	tasks: ExpressionTaskPlan,
	components: ExpressionComponentPlan,
	identityFilename: string
): ReadonlyMap<string, ExpressionTaskSite> {
	const taskIndexes = new Map<string, number>();
	return new Map(
		[...tasks.sites.entries()]
			.sort(([, left], [, right]) => left.start - right.start)
			.map(([id, site]) => {
				const component =
					site.component ??
					[...components.sites.values()].find(
						(candidate) => site.start >= candidate.start && site.end <= candidate.end
					)?.name;
				if (!component) return [id, site] as const;
				const index = taskIndexes.get(component) ?? 0;
				taskIndexes.set(component, index + 1);
				return [
					id,
					Object.freeze({
						...site,
						continuationId: stableId(identityFilename, `${component}:task:${index}`)
					})
				] as const;
			})
	);
}

/** Identifies a server task statement that must survive client effect pruning. */
export function isDistributedTaskStatement(
	node: ts.Node,
	target: TransformTarget,
	taskSites: ReadonlyMap<string, ExpressionTaskSite>
): boolean {
	if (
		target !== 'client' ||
		!ts.isExpressionStatement(node) ||
		!ts.isCallExpression(node.expression) ||
		!isThisTaskCall(node.expression)
	)
		return false;
	return (
		resolvedTaskPlacement(node.expression) === 'server' ||
		taskSites.get(expressionEmissionId(node.expression) ?? '')?.placement === 'server'
	);
}

/** Resolves explicit task placement through updated compiler nodes. */
export function resolvedTaskPlacement(node: ts.CallExpression): 'server' | 'client' | undefined {
	const direct = taskRequestedPlacement(node);
	if (direct) return direct;
	const original = ts.getOriginalNode(node);
	return ts.isCallExpression(original) ? taskRequestedPlacement(original) : undefined;
}

/** Reports whether one placed task is absent from the selected runtime artifact. */
export function shouldOmitTaskPlacement(
	requested: 'server' | 'client' | undefined,
	inferred: ExactPlacement,
	target: TransformTarget
): boolean {
	if (target === 'default') return false;
	if (requested) return requested !== target;
	return target === 'client' ? inferred === 'server' : inferred === 'client';
}

/** Reports whether the component has a durable browser machine to own dispatch. */
export function componentOwnsClientMachine(
	component: string | undefined,
	placements: ReadonlyMap<string, ExactPlacement>,
	serverComponents: boolean
): boolean {
	const placement = placements.get(component ?? '');
	return placement === 'client' || (!serverComponents && placement === 'isomorphic');
}

/** Replaces a server task body with the client half of its distributed continuation. */
export function createDistributedTaskCall(
	node: ts.CallExpression,
	continuationId: string,
	context: ts.TransformationContext,
	helpers: HelperNames
): ts.CallExpression {
	const factory = context.factory;
	const dependencies = node.arguments.slice(0, -1);
	const dependencyParameters = dependencies.map((_, index) =>
		factory.createIdentifier(`__exactDependency${index || ''}`)
	);
	const signal = factory.createIdentifier(helpers.taskSignal);
	const work = factory.createArrowFunction(
		undefined,
		undefined,
		[
			...dependencyParameters.map((parameter) =>
				factory.createParameterDeclaration(undefined, undefined, parameter)
			),
			factory.createParameterDeclaration(
				undefined,
				undefined,
				factory.createObjectBindingPattern([
					factory.createBindingElement(undefined, factory.createIdentifier('signal'), signal)
				])
			)
		],
		undefined,
		factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		factory.createCallExpression(
			factory.createIdentifier(helpers.dispatchContinuation),
			undefined,
			[
				factory.createThis(),
				factory.createStringLiteral(continuationId),
				factory.createArrayLiteralExpression(dependencyParameters),
				signal
			]
		)
	);
	return factory.updateCallExpression(
		node,
		factory.createPropertyAccessExpression(factory.createThis(), 'task'),
		node.typeArguments,
		[...dependencies, work]
	);
}
