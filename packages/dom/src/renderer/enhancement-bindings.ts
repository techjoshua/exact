import { reactive } from '@exactjs/reactive';
import {
	computed,
	registerEffectScopeCleanup,
	withEffectScope,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../types.js';
import type { MountedTarget } from './target-routing.js';

type Binding = {
	revision: { value: number };
	selection: ReactiveValue<MountedTarget | undefined>;
	dependencies: Set<Mounted>;
};
const bindings = new WeakMap<Mounted, Map<string, Binding>>();
const dependents = new WeakMap<Mounted, Set<Binding>>();

/** Retains a namespace selection until its selector values or owned structural path change. */
export function readEnhancementBinding(
	boundary: Mounted,
	identity: string,
	resolve: (dependencies: Set<Mounted>) => MountedTarget | undefined
): MountedTarget | undefined {
	let owned = bindings.get(boundary);
	if (!owned) bindings.set(boundary, (owned = new Map()));
	let binding = owned.get(identity);
	if (!binding) {
		const revision = reactive({ value: 0 });
		const dependencies = new Set<Mounted>();
		const selection = withEffectScope(boundary.scope, () =>
			computed(() => {
				void revision.value;
				for (const dependency of dependencies) dependents.get(dependency)?.delete(record);
				dependencies.clear();
				const selected = resolve(dependencies);
				for (const dependency of dependencies) {
					let readers = dependents.get(dependency);
					if (!readers) dependents.set(dependency, (readers = new Set()));
					readers.add(record);
				}
				return selected;
			})
		);
		const record: Binding = { revision, dependencies, selection };
		binding = record;
		owned.set(identity, binding);
		registerEffectScopeCleanup(boundary.scope, () => {
			for (const dependency of dependencies) dependents.get(dependency)?.delete(record);
			dependencies.clear();
			owned.delete(identity);
		});
	}
	return binding.selection.get();
}

/** Invalidates only routes whose bounded discovery traversed this changed structural owner. */
export function invalidateEnhancementBindings(owner: Mounted): void {
	for (const binding of dependents.get(owner) ?? []) binding.revision.value++;
}
