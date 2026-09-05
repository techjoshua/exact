import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactNarrowComponentUpdateContract } from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import {
	createCompiledComponentDependencies,
	type CompiledComponentDependencies,
	visitChangedCompiledComponentDependencies
} from './component-update-dependencies.js';
import {
	bindComponentUpdateTarget,
	compiledComponentUpdateState,
	componentUpdateOwner,
	publishComponentUpdateTargets,
	type CompiledComponentUpdateTargets
} from './component-update-storage.js';

/** Lazily allocated component-owned state for one compiler-generated update program. */
type CompiledComponentUpdateState = {
	readonly d: CompiledComponentDependencies;
	readonly t: CompiledComponentUpdateTargets;
};

type ComponentUpdateOwner = AnyComponentInstance & {
	[compiledComponentUpdateState]?: CompiledComponentUpdateState;
};

/**
 * Joins one finite DOM region to its compiler-generated component update program.
 *
 * The first mounted region allocates one dependency subscription on the durable component scope.
 * Every later region installs only its stable indexed target. Region teardown clears that target;
 * component scope teardown releases the shared subscription.
 */
export function bindCompiledComponentUpdate(
	target: ExactRenderProgramBindingTarget,
	index: number,
	updates: ExactNarrowComponentUpdateContract
): void {
	const owner = componentUpdateOwner(target);
	if (!owner) return;
	const component = owner as ComponentUpdateOwner;
	let state = component[compiledComponentUpdateState];
	if (!state) {
		let initialized: CompiledComponentUpdateState;
		const dependencies = createCompiledComponentDependencies(
			owner,
			updates.bindings,
			updates.props!,
			(binding) => publishCompiledComponentUpdate(updates, initialized, binding)
		);
		if (!dependencies) {
			(target as { valid: boolean }).valid = false;
			return;
		}
		state = initialized = { d: dependencies, t: [] };
		component[compiledComponentUpdateState] = state;
	}
	bindComponentUpdateTarget(target, state.t, index);
}

/** Converts one mutation-version snapshot into the component's generated dirty operation mask. */
function publishCompiledComponentUpdate(
	updates: ExactNarrowComponentUpdateContract,
	state: CompiledComponentUpdateState,
	forwardedBinding?: number
): void {
	let dirtyLow = 0;
	let dirtyHigh = 0;
	visitChangedCompiledComponentDependencies(
		state.d,
		(index) => {
			dirtyLow |= updates.bindings[index]![1];
			dirtyHigh |= updates.bindings[index]![2];
		},
		forwardedBinding
	);
	if (dirtyLow || dirtyHigh)
		publishComponentUpdateTargets(state.t, (targets) =>
			updates.apply(targets, dirtyLow, dirtyHigh)
		);
}
