import type { AnyComponentInstance } from '@exactjs/core';
import {
	isReactiveValue,
	reactiveOwnDependencies,
	readMutationVersion,
	readReactiveOwnProperty,
	ref,
	subscribe,
	subscribeKeys,
	type StopHandle
} from '@exactjs/reactive/framework/runtime';

type CompiledDependencyBinding = readonly [
	source: 'state' | 'props',
	key: string,
	...masks: number[]
];

/** One source-qualified dependency group shared by the generated component update lanes. */
export type CompiledComponentDependencyGroup = {
	readonly d: object;
	readonly k: readonly PropertyKey[];
	readonly v: number[];
	readonly b: readonly number[];
};

/** Source-qualified subscriptions, including forwarded reactive prop values. */
export type CompiledComponentDependencies = {
	readonly g: readonly CompiledComponentDependencyGroup[];
	readonly p: Set<number>;
	readonly f: Map<number, { readonly value: object; readonly stop: StopHandle }>;
	readonly owner: AnyComponentInstance;
	readonly bindings: readonly CompiledDependencyBinding[];
	readonly publish: () => void;
};

/** Resolves generated state/props dependencies and installs one subscription per backing object. */
export function createCompiledComponentDependencies(
	owner: AnyComponentInstance,
	bindings: readonly CompiledDependencyBinding[],
	publish: () => void
): CompiledComponentDependencies | undefined {
	const groups: CompiledComponentDependencyGroup[] = [];
	const result: CompiledComponentDependencies = {
		g: groups,
		p: new Set(),
		f: new Map(),
		owner,
		bindings,
		publish
	};
	for (const source of ['state', 'props'] as const) {
		const indexes: number[] = [];
		const keys: string[] = [];
		for (let index = 0; index < bindings.length; index++) {
			const binding = bindings[index]!;
			if (binding[0] !== source) continue;
			indexes.push(index);
			keys.push(binding[1]);
		}
		if (keys.length === 0) continue;
		const dependencies = reactiveOwnDependencies(owner[source], keys);
		if (!dependencies) return undefined;
		const group = {
			d: dependencies.target,
			k: dependencies.keys,
			v: dependencies.keys.map((key) => readMutationVersion(dependencies.target, key)),
			b: indexes
		};
		groups.push(group);
		subscribeKeys(group.d, group.k, publish, { scope: owner.scope });
	}
	for (let index = 0; index < bindings.length; index++) refreshForwardedProp(result, index);
	return result;
}

/** Visits the generated binding identity for every dependency whose mutation version advanced. */
export function visitChangedCompiledComponentDependencies(
	dependencies: CompiledComponentDependencies,
	visit: (binding: number) => void
): boolean {
	let changed = false;
	const visited = new Set(dependencies.p);
	dependencies.p.clear();
	for (const group of dependencies.g) {
		for (let index = 0; index < group.k.length; index++) {
			const version = readMutationVersion(group.d, group.k[index]!);
			if (version === group.v[index]) continue;
			group.v[index] = version;
			const binding = group.b[index]!;
			visited.add(binding);
			refreshForwardedProp(dependencies, binding);
		}
	}
	for (const binding of visited) {
		changed = true;
		visit(binding);
	}
	return changed;
}

function refreshForwardedProp(dependencies: CompiledComponentDependencies, index: number): void {
	const binding = dependencies.bindings[index];
	if (!binding || binding[0] !== 'props') return;
	const read = readReactiveOwnProperty(dependencies.owner.props, binding[1]);
	const value = read.present && isReactiveValue(read.value) ? read.value : undefined;
	const current = dependencies.f.get(index);
	if (current?.value === value) return;
	current?.stop();
	dependencies.f.delete(index);
	if (!value) return;
	const source = ref(value);
	if (!source) return;
	const stop = subscribe(
		source,
		() => {
			value.get();
			dependencies.p.add(index);
			dependencies.publish();
		},
		{ scope: dependencies.owner.scope }
	);
	dependencies.f.set(index, { value, stop });
}
