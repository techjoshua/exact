import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactNarrowComponentUpdateContract } from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';
import type { Mounted } from '../types.js';
import {
	createCompiledComponentDependencies,
	type CompiledComponentDependencies,
	visitChangedCompiledComponentDependencies
} from './component-update-dependencies.js';

/** Lazily allocated component-owned state for one compiler-generated update program. */
type CompiledComponentUpdateState = {
	readonly d: CompiledComponentDependencies;
	readonly t: Array<ExactRenderProgramBindingTarget | undefined>;
};

type ComponentUpdateOwner = AnyComponentInstance & {
	[componentUpdateState]?: CompiledComponentUpdateState;
};

const componentUpdateState = Symbol('exact.dom.component-updates');

type ProgramBindingTarget = {
	readonly mounted: Mounted;
	readonly stopBindings: Array<{ stop(): void }>;
	valid: boolean;
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
	const context = target as ProgramBindingTarget;
	const owner =
		context.mounted.renderProgram?.bindingOwner ?? context.mounted.renderProgram?.parentInstance;
	if (!owner) {
		context.valid = false;
		return;
	}
	const component = owner as ComponentUpdateOwner;
	let state = component[componentUpdateState];
	if (!state) {
		let initialized: CompiledComponentUpdateState;
		const dependencies = createCompiledComponentDependencies(owner, updates.bindings, (binding) =>
			publishCompiledComponentUpdate(updates, initialized, binding)
		);
		if (!dependencies) {
			context.valid = false;
			return;
		}
		state = initialized = { d: dependencies, t: [] };
		component[componentUpdateState] = state;
	}
	state.t[index] = target;

	context.stopBindings.push({
		stop: () => {
			if (state!.t[index] === target) state!.t[index] = undefined;
		}
	});
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
			dirtyLow |= updates.bindings[index]![2];
			dirtyHigh |= updates.bindings[index]![3];
		},
		forwardedBinding
	);
	if (dirtyLow || dirtyHigh) updates.apply(state.t, dirtyLow, dirtyHigh);
}
