import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';
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

/** Binding target shape owned by the render-program binder. */
export type CompiledProgramBindingTarget = {
	readonly mounted: Mounted;
	readonly stopBindings: Array<{ stop(): void }>;
	valid: boolean;
};

/** Resolves the durable component that owns a generated finite-region target. */
export function componentUpdateOwner(
	target: ExactRenderProgramBindingTarget
): AnyComponentInstance | undefined {
	const context = target as CompiledProgramBindingTarget;
	const owner =
		context.mounted.renderProgram?.bindingOwner ?? context.mounted.renderProgram?.parentInstance;
	if (owner) return owner;
	context.valid = false;
	return undefined;
}

/** Installs one compiler-indexed region target and clears it when that region is released. */
export function bindComponentUpdateTarget(
	target: ExactRenderProgramBindingTarget,
	targets: Array<ExactRenderProgramBindingTarget | undefined>,
	index: number
): void {
	targets[index] = target;
	(target as CompiledProgramBindingTarget).stopBindings.push({
		stop: () => {
			if (targets[index] === target) targets[index] = undefined;
		}
	});
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
