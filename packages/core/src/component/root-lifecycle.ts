import { reactiveObjects } from '@exactjs/reactive/framework/objects';
import type {
	AnyComponentInstance,
	RefBinding,
	RootBinding,
	RootLifecycle,
	RootIntroduction,
	RootRelease,
	StructuralReleaseReason
} from './contracts.js';

type RootState = {
	current: object | undefined;
	generation: number;
	introduction: RootIntroduction | undefined;
	presented: boolean;
	release: RootRelease<object> | undefined;
};

type ComponentRootRecord = {
	readonly lifecycle: RootLifecycle<object>;
	readonly state: RootState;
	explicit?: RefBinding<object>;
	observed: boolean;
};

const componentRoots = new WeakMap<AnyComponentInstance, ComponentRootRecord>();
const augmentedBindings = new WeakMap<RefBinding<object>, RootBinding<object>>();

/** Returns the stable reactive intrinsic-root lifecycle for a component. */
export function componentRootLifecycle<T extends object>(
	instance: AnyComponentInstance
): RootLifecycle<T> {
	const record = rootRecord(instance);
	record.observed = true;
	return record.lifecycle as RootLifecycle<T>;
}

/** Selects one stable element ref as the component's explicit intrinsic root. */
export function bindComponentRoot<T extends object>(
	instance: AnyComponentInstance,
	binding: RefBinding<T>
): RootBinding<T> {
	if (binding.owner !== instance)
		throw new Error('A component root binding must be owned by the component selecting it');
	const record = rootRecord(instance);
	record.observed = true;
	if (record.explicit && record.explicit !== binding)
		throw new Error('A component may select only one explicit root binding');
	record.explicit = binding as RefBinding<object>;
	const existing = augmentedBindings.get(binding as RefBinding<object>);
	if (existing) return existing as RootBinding<T>;
	const lifecycle = record.lifecycle;
	const augmented = Object.defineProperties(binding, {
		generation: { enumerable: true, get: () => lifecycle.generation },
		introduction: { enumerable: true, get: () => lifecycle.introduction },
		presented: { enumerable: true, get: () => lifecycle.presented },
		release: { enumerable: true, get: () => lifecycle.release }
	}) as RootBinding<T>;
	augmentedBindings.set(binding as RefBinding<object>, augmented as RootBinding<object>);
	return augmented;
}

/** Publishes the current renderer-discovered intrinsic root for a component. */
export function publishComponentRoot(
	instance: AnyComponentInstance,
	discovered: object | undefined,
	presented = true,
	introduction: RootIntroduction = 'update'
): void {
	const record = rootRecord(instance);
	const selected = record.explicit?.current ?? discovered;
	if (record.state.current !== selected) {
		record.state.current = selected;
		record.state.generation++;
		record.state.introduction = selected ? introduction : undefined;
		record.state.release = undefined;
	}
	record.state.presented = selected !== undefined && presented;
}

/** Publishes whether a retained component root belongs to the presented logical range. */
export function publishComponentRootPresentation(
	instance: AnyComponentInstance,
	presented: boolean
): void {
	const record = componentRoots.get(instance);
	if (record) record.state.presented = record.state.current !== undefined && presented;
}

/** Reports whether authored component work observes this root lifecycle. */
export function componentRootReleaseObserved(instance: AnyComponentInstance): boolean {
	return componentRoots.get(instance)?.observed === true;
}

/** Publishes structural loss of the current root generation without discarding its target. */
export function publishComponentRootRelease(
	instance: AnyComponentInstance,
	reason: StructuralReleaseReason
): RootRelease<object> | undefined {
	const record = componentRoots.get(instance);
	const target = record?.state.current;
	if (!record?.observed || !target) return undefined;
	const release = Object.freeze({
		target,
		generation: record.state.generation,
		reason,
		presented: record.state.presented
	}) satisfies RootRelease<object>;
	record.state.release = release;
	record.state.current = undefined;
	record.state.presented = false;
	return release;
}

/** Restores an exactly retained root generation after its structural release is reversed. */
export function reverseComponentRootRelease(
	instance: AnyComponentInstance,
	generation: number
): boolean {
	const record = componentRoots.get(instance);
	const release = record?.state.release;
	if (!record || !release || release.generation !== generation) return false;
	record.state.current = release.target;
	record.state.presented = release.presented;
	record.state.release = undefined;
	return true;
}

/** Clears a settled release when it still belongs to the specified root generation. */
export function settleComponentRootRelease(
	instance: AnyComponentInstance,
	generation: number
): void {
	const record = componentRoots.get(instance);
	if (record?.state.release?.generation === generation) record.state.release = undefined;
}

/** Discards root lifecycle state after final component disposal. */
export function disposeComponentRoot(instance: AnyComponentInstance): void {
	const record = componentRoots.get(instance);
	if (record) {
		record.state.current = undefined;
		record.state.introduction = undefined;
		record.state.presented = false;
		record.state.release = undefined;
	}
	componentRoots.delete(instance);
}

/** Creates the component-owned reactive record on first observation or renderer publication. */
function rootRecord(instance: AnyComponentInstance): ComponentRootRecord {
	const existing = componentRoots.get(instance);
	if (existing) return existing;
	const state = reactiveObjects(
		{
			current: undefined,
			generation: 0,
			introduction: undefined,
			presented: false,
			release: undefined
		} satisfies RootState,
		{ passthroughKeys: ['current', 'release'] }
	);
	const lifecycle: RootLifecycle<object> = Object.freeze({
		get current() {
			return state.current;
		},
		get generation() {
			return state.generation;
		},
		get introduction() {
			return state.introduction;
		},
		get presented() {
			return state.presented;
		},
		get release() {
			return state.release;
		}
	});
	const record = { lifecycle, state, observed: false };
	componentRoots.set(instance, record);
	return record;
}
