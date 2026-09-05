import type { AnyComponentInstance } from '@exactjs/core';
import {
	compiledReactivePropertyOperand,
	isReactiveValue,
	readIndexedReactiveSource,
	reactiveOwnDependencies,
	ref,
	subscribe,
	subscribeKeys,
	unwrap,
	type CompiledReactivePropertyOperand,
	type StopHandle
} from '@exactjs/reactive/framework/runtime';
import {
	createComponentDependencyGroup,
	visitChangedComponentDependencyGroup,
	type CompiledComponentDependencyGroup
} from './component-update-storage.js';

type CompiledDependencyBinding = readonly [slot: number, ...masks: number[]];

/** Source-qualified subscriptions, including forwarded reactive prop values. */
export class CompiledComponentDependencies {
	readonly g: CompiledComponentDependencyGroup[] = [];
	readonly f: Array<{ readonly value: object; readonly stop: StopHandle } | undefined> = [];
	readonly s: StopHandle[] = [];

	constructor(
		readonly owner: AnyComponentInstance,
		readonly bindings: readonly CompiledDependencyBinding[],
		readonly props: number,
		readonly scope: AnyComponentInstance['scope'],
		readonly publish: (forwardedBinding?: number) => void
	) {}

	/** Releases binder-local source and forwarded-value subscriptions idempotently. */
	stop(): void {
		for (const release of this.s.splice(0)) release();
		for (const forwarded of this.f.splice(0)) forwarded?.stop();
	}
}

/** Resolves generated state/props dependencies and installs one subscription per backing object. */
export function createCompiledComponentDependencies(
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
		result.s.push(subscribeKeys(group.d, group.k, publish, { scope }));
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
	const operand =
		read.present && Array.isArray(read.value) && read.value[0] === compiledReactivePropertyOperand
			? (read.value as unknown as CompiledReactivePropertyOperand)
			: undefined;
	const value = read.present && isReactiveValue(read.value) ? read.value : undefined;
	const sourceValue = operand ?? value;
	const current = dependencies.f[index];
	if (current?.value === sourceValue) return;
	current?.stop();
	dependencies.f[index] = undefined;
	if (!sourceValue) return;
	const notify = () => {
		value?.get();
		dependencies.publish(index);
	};
	const propertyDependencies = operand
		? reactiveOwnDependencies(operand[1], [operand[2]])
		: undefined;
	const stop = operand
		? subscribeKeys(
				propertyDependencies?.target ?? (unwrap(operand[1]) as object),
				propertyDependencies?.keys ?? [operand[2]],
				notify,
				{
					scope: dependencies.scope
				}
			)
		: subscribe(ref(value!)!, notify, { scope: dependencies.scope });
	dependencies.f[index] = { value: sourceValue, stop };
}
