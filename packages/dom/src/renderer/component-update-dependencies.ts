import type { AnyComponentInstance } from '@exactjs/core';
import {
	isReactiveValue,
	readIndexedReactiveSource,
	ref,
	subscribe,
	subscribeKeys,
	type StopHandle
} from '@exactjs/reactive/framework/runtime';
import {
	createComponentDependencyGroup,
	visitChangedComponentDependencyGroup,
	type CompiledComponentDependencyGroup
} from './component-update-storage.js';

type CompiledDependencyBinding = readonly [slot: number, ...masks: number[]];

/** Source-qualified subscriptions, including forwarded reactive prop values. */
export type CompiledComponentDependencies = {
	readonly g: readonly CompiledComponentDependencyGroup[];
	readonly f: Array<{ readonly value: object; readonly stop: StopHandle } | undefined>;
	readonly owner: AnyComponentInstance;
	readonly bindings: readonly CompiledDependencyBinding[];
	readonly props: number;
	readonly publish: (forwardedBinding?: number) => void;
};

/** Resolves generated state/props dependencies and installs one subscription per backing object. */
export function createCompiledComponentDependencies(
	owner: AnyComponentInstance,
	bindings: readonly CompiledDependencyBinding[],
	props: number,
	publish: (forwardedBinding?: number) => void
): CompiledComponentDependencies | undefined {
	const groups: CompiledComponentDependencyGroup[] = [];
	const result: CompiledComponentDependencies = {
		g: groups,
		f: [],
		owner,
		bindings,
		props,
		publish
	};
	for (const [source, start, end] of [
		['props', 0, props],
		['state', props, bindings.length]
	] as const) {
		const group = createComponentDependencyGroup(owner, bindings, source, start, end);
		if (group === undefined) return undefined;
		if (!group) continue;
		groups.push(group);
		subscribeKeys(group.d, group.k, publish, { scope: owner.scope });
	}
	for (let index = 0; index < bindings.length; index++) refreshForwardedProp(result, index);
	return result;
}

/** Visits the generated binding identity for every dependency whose mutation version advanced. */
export function visitChangedCompiledComponentDependencies(
	dependencies: CompiledComponentDependencies,
	visit: (binding: number) => void,
	forwardedBinding = -1
): boolean {
	let changed = forwardedBinding >= 0;
	if (changed) visit(forwardedBinding);
	for (const group of dependencies.g) {
		changed =
			visitChangedComponentDependencyGroup(group, (binding) => {
				if (binding !== forwardedBinding) visit(binding);
				refreshForwardedProp(dependencies, binding);
			}) || changed;
	}
	return changed;
}

function refreshForwardedProp(dependencies: CompiledComponentDependencies, index: number): void {
	const binding = dependencies.bindings[index];
	if (!binding || index >= dependencies.props) return;
	const read = readIndexedReactiveSource(dependencies.owner.props, binding[0]);
	const value = read.present && isReactiveValue(read.value) ? read.value : undefined;
	const current = dependencies.f[index];
	if (current?.value === value) return;
	current?.stop();
	dependencies.f[index] = undefined;
	if (!value) return;
	const source = ref(value);
	if (!source) return;
	const stop = subscribe(
		source,
		() => {
			value.get();
			dependencies.publish(index);
		},
		{ scope: dependencies.owner.scope }
	);
	dependencies.f[index] = { value, stop };
}
