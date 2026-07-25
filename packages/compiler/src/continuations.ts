import type { ExpressionComponentPlan } from './expression/contracts.js';
import type {
	ExactBoundaryIR,
	ExactComponentIR,
	ExactComponentResumptionIR,
	ExactContinuationIR
} from './types.js';

/**
 * Creates the canonical continuation model from analyzed components.
 *
 * Context effects remain server lookups and are never included in transported
 * dependency paths. Boundaries are associated by component ownership so a
 * response contract can reject unrelated patches.
 */
export function createExactContinuations(
	components: readonly ExactComponentIR[],
	boundaries: readonly ExactBoundaryIR[],
	contextResidency: (token: string) => 'server' | 'client' | 'shared' = () => 'server'
): ExactContinuationIR[] {
	const output: ExactContinuationIR[] = [];
	for (const component of components) {
		const ownedBoundaries = boundaries
			.filter((boundary) => boundary.ownerComponentId === component.id)
			.map((boundary) => boundary.id)
			.sort();
		for (const task of component.tasks) {
			if (task.placement !== 'server' && task.placement !== 'isomorphic') continue;
			for (const context of task.contexts) {
				if (context.kind === 'write' && !safeContextName(context.token)) {
					throw new Error(
						`Component context write must use a safe stable token binding: ${context.token}`
					);
				}
			}
			output.push({
				id: task.id,
				kind: 'task',
				componentId: component.id,
				taskId: task.id,
				placement: task.placement,
				async: task.async,
				activation: {
					stateReads: [...task.reads],
					dependencies: task.dependencies
						.map((dependency, index) => ({ dependency, index }))
						.filter(({ dependency }) => dependency.source !== 'context')
						.map(({ dependency, index }) => ({
							index,
							source: dependency.source as 'state' | 'props' | 'derived'
						})),
					serverContexts: uniqueContexts([
						...task.contexts.filter(
							(context) => context.kind === 'read' && contextResidency(context.token) !== 'shared'
						),
						...task.dependencies
							.filter(
								(dependency): dependency is typeof dependency & { contextToken: string } =>
									dependency.source === 'context' &&
									!!dependency.contextToken &&
									contextResidency(dependency.contextToken) !== 'shared'
							)
							.map((dependency) => ({
								token: dependency.contextToken,
								kind: 'read' as const,
								confidence: 'exact' as const
							}))
					]),
					publicContexts: uniqueContexts([
						...task.contexts.filter(
							(context) => context.kind === 'read' && contextResidency(context.token) === 'shared'
						),
						...task.dependencies
							.filter(
								(dependency): dependency is typeof dependency & { contextToken: string } =>
									dependency.source === 'context' &&
									!!dependency.contextToken &&
									contextResidency(dependency.contextToken) === 'shared'
							)
							.map((dependency) => ({
								token: dependency.contextToken,
								kind: 'read' as const,
								confidence: 'exact' as const
							}))
					])
				},
				effects: {
					stateWrites: [...task.writes],
					contextWrites: task.contexts.filter(
						(context) => context.kind === 'write' && contextResidency(context.token) === 'shared'
					),
					serverContextWrites: task.contexts.filter(
						(context) => context.kind === 'write' && contextResidency(context.token) !== 'shared'
					),
					boundaries: ownedBoundaries
				},
				ownership: {
					componentId: component.id,
					lifetime: 'component'
				},
				cancellation: 'abort-signal'
			});
		}
	}
	return output.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Derives separate SSR and browser-resumption requirements for every component.
 *
 * The server record may refer to server contexts. The client record contains
 * only values captured by generated client islands and their owned boundaries.
 */
export function createExactComponentResumptions(
	components: readonly ExactComponentIR[],
	boundaries: readonly ExactBoundaryIR[],
	plan: ExpressionComponentPlan,
	contextResidency: (token: string) => 'server' | 'client' | 'shared' = () => 'server'
): ExactComponentResumptionIR[] {
	return components
		.map((component): ExactComponentResumptionIR => {
			const site = plan.sites.get(component.name);
			const islands = site?.clientIslands ?? [];
			return {
				componentId: component.id,
				serverRender: {
					stateReads: uniqueSorted(
						component.tasks
							.filter((task) => task.placement === 'server' || task.placement === 'isomorphic')
							.flatMap((task) => task.reads.map((read) => read.path))
					),
					serverContexts: component.contexts.filter((context) => context.kind === 'read')
				},
				client: {
					statePaths: uniqueSorted([
						...islands.flatMap((island) => island.stateReads),
						...component.tasks
							.filter((task) => task.placement === 'server' || task.placement === 'isomorphic')
							.flatMap((task) =>
								task.writes
									.filter((write) => write.confidence === 'exact' && write.path !== '*')
									.map((write) => write.path)
							)
					]),
					valueCaptures: uniqueSorted(islands.flatMap((island) => island.valueCaptures)),
					contexts: uniqueSorted(
						component.tasks
							.filter((task) => task.placement === 'server' || task.placement === 'isomorphic')
							.flatMap((task) =>
								task.contexts
									.filter(
										(context) =>
											context.kind === 'write' && contextResidency(context.token) === 'shared'
									)
									.map((context) => context.token)
							)
					),
					boundaries: boundaries
						.filter((boundary) => boundary.ownerComponentId === component.id)
						.map((boundary) => boundary.id)
						.sort()
				}
			};
		})
		.sort((left, right) => left.componentId.localeCompare(right.componentId));
}

/** Returns unique strings in protocol-stable lexical order. */
function uniqueSorted(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

/** Deduplicates context lookups without changing their server-side semantics. */
function uniqueContexts(
	values: readonly import('./types.js').ExactContextEffect[]
): import('./types.js').ExactContextEffect[] {
	return [
		...new Map(
			values.map((value) => [`${value.kind}:${value.token}:${value.confidence}`, value])
		).values()
	].sort((left, right) => left.token.localeCompare(right.token));
}

/** Rejects protocol keys that could alter an ordinary JSON object's prototype. */
function safeContextName(name: string): boolean {
	return name.length > 0 && name !== '__proto__' && name !== 'prototype' && name !== 'constructor';
}
