import {
	attemptCleanup,
	attachSuppressedCleanupFailure,
	createCleanupFailure,
	throwCleanupFailure,
	type AnyComponentInstance
} from '@exactjs/core';
import type { RetainedWatchOptions } from '@exactjs/reactive/framework/watch';
import {
	isCompiledReactivePropertyOperand,
	isCompiledExpressionOperand,
	isReactiveValue,
	readIndexedReactiveSource,
	reactiveOwnDependencies,
	ref,
	subscribeKeys,
	unwrap,
	type ReactiveValue,
	type StopHandle
} from '@exactjs/reactive/framework/runtime';
import {
	createComponentDependencyGroup,
	visitChangedComponentDependencyGroup,
	type CompiledComponentDependencyGroup
} from './component-update-storage.js';

type CompiledDependencyBinding = readonly [slot: number, ...masks: number[]];

/** Prepared source identity and the subscription owned by one forwarded prop binding. */
type ForwardedPropDependency = {
	readonly value: object;
	readonly target: object;
	readonly keys: readonly PropertyKey[];
	readonly read?: ReactiveValue<unknown>;
	stop?: StopHandle;
};

/** Source-qualified subscriptions, including forwarded reactive prop values. */
export class CompiledComponentDependencies {
	readonly g: CompiledComponentDependencyGroup[] = [];
	readonly f: Array<ForwardedPropDependency | undefined> = [];
	readonly s: StopHandle[] = [];

	constructor(
		readonly owner: AnyComponentInstance,
		readonly bindings: readonly CompiledDependencyBinding[],
		readonly props: number,
		readonly scope: AnyComponentInstance['scope'],
		readonly publish: (forwardedBinding?: number) => void
	) {}

	/** Acquires the prepared subscriptions after the caller initializes publication state. */
	activate(): void {
		try {
			for (const group of this.g)
				this.s.push(
					subscribeKeys(group.d, group.k, this.publish, compiledComponentUpdateOptions(this.scope))
				);
			for (let index = 0; index < this.f.length; index++) {
				const forwarded = this.f[index];
				if (forwarded) acquireForwardedProp(this, index, forwarded);
			}
		} catch (error) {
			try {
				this.stop();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
	}

	/** Releases every acquired handle even when a cleanup fails. Safe after partial acquisition. */
	stop(): void {
		const groups = this.s.splice(0),
			forwarded = this.f.splice(0);
		const failure = createCleanupFailure();
		for (const release of groups) attemptCleanup(failure, release);
		for (const entry of forwarded) if (entry?.stop) attemptCleanup(failure, entry.stop);
		throwCleanupFailure(failure);
	}
}

/**
 * Prepares all groups and forwarded references without subscriptions. Forwarded evaluation may run
 * authored code, so callers initialize their state before activation, commit the target, then scan
 * versions once through publish. Mutations during preparation are retained by the sampled groups.
 */
export function prepareCompiledComponentDependencies(
	owner: AnyComponentInstance,
	bindings: readonly CompiledDependencyBinding[],
	props: number,
	publish: (forwardedBinding?: number) => void,
	scope = owner.scope
): CompiledComponentDependencies | undefined {
	const result = new CompiledComponentDependencies(owner, bindings, props, scope, publish);
	for (const [source, start, end] of [
		['props', 0, props],
		['state', props, bindings.length]
	] as const) {
		const group = createComponentDependencyGroup(owner, bindings, source, start, end);
		if (group === undefined) return undefined;
		if (!group) continue;
		result.g.push(group);
	}
	for (let index = 0; index < props; index++) result.f[index] = prepareForwardedProp(result, index);
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

/** Acquires replacement ownership before releasing the currently published source. */
function refreshForwardedProp(dependencies: CompiledComponentDependencies, index: number): void {
	const current = dependencies.f[index];
	const next = prepareForwardedProp(dependencies, index);
	if (next === current || !ownsForwardedReplacement(dependencies, index, current, next)) return;
	if (next) {
		acquireForwardedProp(dependencies, index, next);
		if (!ownsForwardedReplacement(dependencies, index, current, next)) {
			next.stop?.();
			return;
		}
	}
	dependencies.f[index] = next;
	current?.stop?.();
}

/**
 * Authored ref evaluation can publish a newer slot or stop this owner. A prepared source may commit
 * only while both its captured record and raw input still belong to it. The raw read never calls get.
 * Record identity also protects an ABA replacement whose final value equals an earlier source.
 */
function ownsForwardedReplacement(
	dependencies: CompiledComponentDependencies,
	index: number,
	current: ForwardedPropDependency | undefined,
	next: ForwardedPropDependency | undefined
): boolean {
	if (
		!dependencies.scope.active ||
		index >= dependencies.f.length ||
		dependencies.f[index] !== current
	)
		return false;
	if (!next) return true;
	const read = readIndexedReactiveSource(
		dependencies.owner.props,
		dependencies.bindings[index]![0]
	);
	return read.present && read.value === next.value;
}

/** Evaluates a forwarded reference before any subscription can publish into its caller. */
function prepareForwardedProp(
	dependencies: CompiledComponentDependencies,
	index: number
): ForwardedPropDependency | undefined {
	const binding = dependencies.bindings[index];
	if (!binding || index >= dependencies.props) return undefined;
	const read = readIndexedReactiveSource(dependencies.owner.props, binding[0]);
	const operand =
		read.present && isCompiledReactivePropertyOperand(read.value) ? read.value : undefined;
	if (read.present && isCompiledExpressionOperand(read.value)) {
		if (dependencies.f[index]?.value === read.value) return dependencies.f[index];
		const cell = read.value[1];
		const reference = ref(cell)!;
		return { value: read.value, target: reference.target, keys: [reference.key], read: cell };
	}
	const value = read.present && isReactiveValue(read.value) ? read.value : undefined;
	const sourceValue = operand ?? value;
	const current = dependencies.f[index];
	if (current?.value === sourceValue) return current;
	if (!sourceValue) return undefined;
	if (operand) {
		const property = reactiveOwnDependencies(operand[1], [operand[2]]);
		return {
			value: sourceValue,
			target: property?.target ?? (unwrap(operand[1]) as object),
			keys: property?.keys ?? [operand[2]]
		};
	}
	const reference = ref(value!)!;
	return { value: sourceValue, target: reference.target, keys: [reference.key], read: value };
}

/** Transfers a fully prepared source subscription into its binding record. */
function acquireForwardedProp(
	dependencies: CompiledComponentDependencies,
	index: number,
	forwarded: ForwardedPropDependency
): void {
	forwarded.stop = subscribeKeys(
		forwarded.target,
		forwarded.keys,
		() => {
			forwarded.read?.get();
			dependencies.publish(index);
		},
		compiledComponentUpdateOptions(dependencies.scope)
	);
}

/** Compiled updates can replace guarded regions, so retire them before ordinary leaf readers run. */
export function compiledComponentUpdateOptions(
	scope: AnyComponentInstance['scope']
): RetainedWatchOptions {
	return { scope, structural: true };
}
