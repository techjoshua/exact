import ts from 'typescript';
import {
	isFunctionLikeExpression,
	isThisTaskCall,
	taskCallFacets,
	taskRequestedPlacement
} from '../../calls.js';
import type { ExpressionComponentPlan } from '../../expression/contracts.js';
import type { ExpressionTaskPlan, ExpressionTaskSite } from '../../expression/task-contracts.js';
import { stableId } from '../../ids.js';
import type {
	ExactContinuationIR,
	ExactPlacement,
	HelperNames,
	TransformTarget
} from '../../types.js';
import { expressionEmissionId } from './identity.js';

type ContinuationContextWrite = Readonly<{ name: string; token: ts.Expression }>;

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

/** Indexes the shared context writes each generated client continuation may receive. */
export function continuationContextWriteContracts(
	continuations: readonly ExactContinuationIR[]
): ReadonlyMap<string, ReadonlySet<string>> {
	return new Map(
		continuations.map(
			(continuation) =>
				[
					continuation.id,
					new Set(continuation.effects.contextWrites.map((effect) => effect.token))
				] as const
		)
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
	contextWrites: readonly ContinuationContextWrite[],
	context: ts.TransformationContext,
	helpers: HelperNames
): ts.Expression {
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
				signal,
				factory.createArrayLiteralExpression(
					contextWrites.map(({ name, token }) =>
						factory.createObjectLiteralExpression([
							factory.createPropertyAssignment('name', factory.createStringLiteral(name)),
							factory.createPropertyAssignment('token', token)
						])
					)
				)
			]
		)
	);
	const taggedWork = markContinuationTask(work, continuationId, context, helpers);
	let taskTarget: ts.Expression = factory.createPropertyAccessExpression(
		factory.createThis(),
		'task'
	);
	for (const facet of taskCallFacets(node)?.names ?? []) {
		if (facet === 'server' || facet === 'client') continue;
		taskTarget = factory.createPropertyAccessExpression(taskTarget, facet);
	}
	const task = factory.updateCallExpression(node, taskTarget, node.typeArguments, [
		...dependencies,
		taggedWork
	]);
	return registerContinuationContextBindings(task, contextWrites, context, helpers);
}

/** Collects direct component-context writes whose token identities must remain client-local. */
export function continuationContextWrites(
	node: ts.CallExpression,
	allowed?: ReadonlySet<string>
): ContinuationContextWrite[] {
	const work = node.arguments.at(-1);
	if (!work || !isFunctionLikeExpression(work)) return [];
	const writes = new Map<string, ts.Expression>();
	const visit = (current: ts.Node): void => {
		if (current !== work && ts.isFunctionLike(current)) return;
		if (
			ts.isCallExpression(current) &&
			ts.isPropertyAccessExpression(current.expression) &&
			current.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
			current.expression.name.text === 'setContext' &&
			current.arguments.length >= 2
		) {
			const token = current.arguments[0]!;
			writes.set(token.getText(), token);
		}
		ts.forEachChild(current, visit);
	};
	visit(work);
	return [...writes]
		.filter(([name]) => !allowed || allowed.has(name))
		.map(([name, token]) => ({ name, token }));
}

/**
 * Registers source contract names against runtime-local token identities before
 * the task can be armed from an SSR resumption record.
 */
export function registerContinuationContextBindings(
	task: ts.Expression,
	contextWrites: readonly ContinuationContextWrite[],
	context: ts.TransformationContext,
	helpers: HelperNames
): ts.Expression {
	if (!contextWrites.length) return task;
	const factory = context.factory;
	return factory.createParenthesizedExpression(
		factory.createCommaListExpression([
			factory.createCallExpression(
				factory.createIdentifier(helpers.registerContinuationContexts),
				undefined,
				[
					factory.createThis(),
					factory.createArrayLiteralExpression(
						contextWrites.map(({ name, token }) =>
							factory.createObjectLiteralExpression([
								factory.createPropertyAssignment('name', factory.createStringLiteral(name)),
								factory.createPropertyAssignment('token', token)
							])
						)
					)
				]
			),
			task
		])
	);
}

/** Tags generated task work with its stable distributed continuation identity. */
export function markContinuationTask(
	work: ts.Expression,
	continuationId: string,
	context: ts.TransformationContext,
	helpers: HelperNames
): ts.CallExpression {
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.taskContinuation),
		undefined,
		[context.factory.createStringLiteral(continuationId), work]
	);
}
