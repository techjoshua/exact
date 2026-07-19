import { stableId } from '../ids.js';

import type { ExactComponentIR, ExactContextEffect, ExactTaskIR } from '../types.js';

import type { ExpressionTaskPlan } from './task-contracts.js';

import type { ExpressionComponentPlan } from './contracts.js';

/** Materializes component and task manifest IR without consulting TypeScript syntax nodes. */
export function createExpressionComponents(
	filename: string,
	plan: ExpressionComponentPlan,
	tasks: ExpressionTaskPlan,
	safety: ReadonlyMap<string, readonly string[]>
): ExactComponentIR[] {
	return [...plan.sites.values()]
		.sort((left, right) => left.start - right.start)
		.map((site) => {
			const componentTasks = [...tasks.sites.values()]
				.filter(
					(task) => task.component === site.name && task.start >= site.start && task.end <= site.end
				)
				.sort((left, right) => left.start - right.start)
				.map(
					(task, index): ExactTaskIR => ({
						id: stableId(filename, `${site.name}:task:${index}`),
						placement: task.placement,
						requestedPlacement: task.requestedPlacement,
						async: task.async,
						browserEffects: task.browserEffects,
						reads: [...task.reads],
						writes: [...task.writes],
						contexts: [...task.contexts],
						diagnostics: [...task.diagnostics],
						environmentEffect: task.environmentEffect,
						effectSources: [...task.effectSources]
					})
				);
			const hasServerEffect = site.serverEffects;
			const diagnostics = new Set<string>([
				...(safety.get(site.id) ?? safety.get(site.name) ?? []),
				...site.diagnostics
			]);
			for (const task of componentTasks)
				for (const diagnostic of task.diagnostics) diagnostics.add(diagnostic);
			if (hasServerEffect)
				for (const global of site.browserGlobalsOutsideClientBoundary) {
					diagnostics.add(
						`error: browser-only global ${global} cannot be used in server-rendered component code; move it into a client island or client task`
					);
				}
			const placement =
				site.environmentEffect === 'mixed' || site.environmentEffect === 'unknown'
					? 'unknown'
					: site.clientEffects && site.serverEffects
						? 'isomorphic'
						: site.serverEffects
							? 'server'
							: site.clientEffects
								? 'client'
								: 'isomorphic';
			return {
				id: stableId(filename, site.id),
				name: site.name,
				exported: false,
				placement,
				subgraphPlacement: placement,
				renderEdges: [],
				clientIslandCount: site.clientIslandCount,
				tasks: componentTasks,
				contexts: uniqueContexts(
					[
						...site.contextSites,
						...[...tasks.sites.values()]
							.filter((task) => task.component === site.name)
							.flatMap((task) => task.contextSites)
					]
						.sort((left, right) => left.start - right.start)
						.map((entry) => entry.effect)
				),
				splitBoundaries: [...site.splitBoundaries],
				diagnostics: [...diagnostics],
				environmentEffect: site.environmentEffect,
				artifactTargets:
					placement === 'unknown'
						? []
						: site.serverEffects
							? ['server']
							: site.clientEffects
								? ['client']
								: ['client', 'server']
			};
		});
}

function uniqueContexts(values: readonly ExactContextEffect[]): ExactContextEffect[] {
	return [
		...new Map(
			values.map((value) => [`${value.kind}:${value.token}:${value.confidence}`, value])
		).values()
	].sort((left, right) =>
		`${left.kind}:${left.token}`.localeCompare(`${right.kind}:${right.token}`)
	);
}
