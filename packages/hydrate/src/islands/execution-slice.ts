import { type AnyComponentFunction } from '@exactjs/core';
import {
	exactComponentIdentity,
	readExactComponentContract
} from '@exactjs/core/framework/component-contracts';
import type { ComponentExecutionSlice } from '@exactjs/core/framework/component-execution';

const slices = new WeakMap<AnyComponentFunction, ComponentExecutionSlice>();

/** Prepares and caches the exact setup-transition slice for one loaded island artifact. */
export function prepareClientIslandExecutionSlice(
	component: AnyComponentFunction
): ComponentExecutionSlice {
	const cached = slices.get(component);
	if (cached) return cached;
	const contract = readExactComponentContract(component);
	if (!contract?.execution) return emptySlice;
	assertAcyclic(contract.execution);
	const transitions = new Set(
		contract.execution.transitions
			.filter((transition) => transition.activation === 'setup')
			.map((transition) => transition.id)
	);
	const slice: ComponentExecutionSlice = new Map([
		[exactComponentIdentity(component), transitions]
	]);
	slices.set(component, slice);
	return slice;
}

const emptySlice: ComponentExecutionSlice = new Map();

function assertAcyclic(
	plan: NonNullable<ReturnType<typeof readExactComponentContract>>['execution']
): void {
	if (!plan) return;
	const producers = new Map<number, string[]>();
	for (const transition of plan.transitions)
		for (const output of transition.outputs) {
			const values = producers.get(output) ?? [];
			values.push(transition.id);
			producers.set(output, values);
		}
	const edges = new Map<string, Set<string>>();
	for (const transition of plan.transitions) {
		const dependencies = edges.get(transition.id) ?? new Set<string>();
		for (const input of transition.inputs)
			for (const producer of producers.get(input) ?? [])
				if (producer !== transition.id) dependencies.add(producer);
		edges.set(transition.id, dependencies);
	}
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visiting.has(id))
			throw new Error(`eXact island dependency cycle includes transition ${id}`);
		if (visited.has(id)) return;
		visiting.add(id);
		for (const dependency of edges.get(id) ?? []) visit(dependency);
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of edges.keys()) visit(id);
}
