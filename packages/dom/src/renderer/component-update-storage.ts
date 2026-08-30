import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import {
	reactiveIndexedDependencies,
	readMutationVersion
} from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../types.js';

type CompiledDependencyBinding = readonly [slot: number, ...masks: number[]];

/** One indexed dependency group shared by a generated component update artifact. */
export type CompiledComponentDependencyGroup = {
	readonly d: object;
	readonly k: readonly PropertyKey[];
	readonly v: number[];
	readonly o: number;
};

/** Opaque owner field used by exactly one update ABI for a compiled component definition. */
export const compiledComponentUpdateState = Symbol('exact.dom.component-updates');

/** One generated target index may have several live regions when its source program is repeated. */
export type CompiledComponentUpdateTargets = Array<
	ExactRenderProgramBindingTarget | Set<ExactRenderProgramBindingTarget> | undefined
>;

/** Binding target shape owned by the render-program binder. */
export type CompiledProgramBindingTarget = {
	readonly mounted: Mounted;
	/** Explicit durable owner for non-render-program compiled targets. */
	readonly owner?: AnyComponentInstance;
	readonly stopBindings: Array<{ stop(): void }>;
	valid: boolean;
};

/** Resolves the durable component that owns a generated finite-region target. */
export function componentUpdateOwner(
	target: ExactRenderProgramBindingTarget
): AnyComponentInstance | undefined {
	const context = target as CompiledProgramBindingTarget;
	const owner =
		context.owner ??
		context.mounted.renderProgram?.bindingOwner ??
		context.mounted.renderProgram?.parentInstance;
	if (owner) return owner;
	context.valid = false;
	return undefined;
}

/** Installs one compiler-indexed region target and clears it when that region is released. */
export function bindComponentUpdateTarget(
	target: ExactRenderProgramBindingTarget,
	targets: CompiledComponentUpdateTargets,
	index: number
): void {
	const current = targets[index];
	if (!current) targets[index] = target;
	else if (current instanceof Set) current.add(target);
	else if (current !== target) targets[index] = new Set([current, target]);
	(target as CompiledProgramBindingTarget).stopBindings.push({
		stop: () => {
			const bound = targets[index];
			if (bound === target) targets[index] = undefined;
			else if (bound instanceof Set) {
				bound.delete(target);
				if (bound.size === 0) targets[index] = undefined;
				else if (bound.size === 1) targets[index] = bound.values().next().value;
			}
		}
	});
}

/** Applies a generated update once to singleton regions and once to every repeated region. */
export function publishComponentUpdateTargets(
	targets: CompiledComponentUpdateTargets,
	apply: (targets: Array<ExactRenderProgramBindingTarget | undefined>) => void
): void {
	const singletons: Array<ExactRenderProgramBindingTarget | undefined> = [];
	let hasSingleton = false;
	for (let index = 0; index < targets.length; index++) {
		const target = targets[index];
		if (!target || target instanceof Set) continue;
		singletons[index] = target;
		hasSingleton = true;
	}
	if (hasSingleton) apply(singletons);
	for (let index = 0; index < targets.length; index++) {
		const repeated = targets[index];
		if (!(repeated instanceof Set)) continue;
		for (const target of repeated) {
			const occurrence: Array<ExactRenderProgramBindingTarget | undefined> = [];
			occurrence[index] = target;
			apply(occurrence);
		}
	}
}

/** Resolves the subset of generated dependencies backed by one indexed state or props facade. */
export function createComponentDependencyGroup(
	owner: AnyComponentInstance,
	bindings: readonly CompiledDependencyBinding[],
	source: 'state' | 'props',
	start = 0,
	end = bindings.length
): CompiledComponentDependencyGroup | null | undefined {
	const slots: number[] = [];
	for (let index = start; index < end; index++) {
		const binding = bindings[index]!;
		slots.push(binding[0]);
	}
	if (slots.length === 0) return null;
	const dependencies = reactiveIndexedDependencies(owner[source], slots);
	if (!dependencies) return undefined;
	return {
		d: dependencies.target,
		k: dependencies.keys,
		v: dependencies.keys.map((key) => readMutationVersion(dependencies.target, key)),
		o: start
	};
}

/** Visits every generated binding whose indexed mutation version advanced. */
export function visitChangedComponentDependencyGroup(
	group: CompiledComponentDependencyGroup,
	visit: (binding: number) => void
): boolean {
	let changed = false;
	for (let index = 0; index < group.k.length; index++) {
		const version = readMutationVersion(group.d, group.k[index]!);
		if (version === group.v[index]) continue;
		group.v[index] = version;
		changed = true;
		visit(group.o + index);
	}
	return changed;
}
