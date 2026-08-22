import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactCompiledComponentUpdateContract } from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';
import {
	reactiveOwnDependencies,
	readMutationVersion,
	subscribeKeys
} from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../types.js';

/** Lazily allocated component-owned state for one compiler-generated update program. */
type CompiledComponentUpdateState = {
	readonly d: object;
	readonly k: readonly PropertyKey[];
	readonly v: number[];
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
	updates: ExactCompiledComponentUpdateContract
): void {
	const context = target as ProgramBindingTarget;
	const owner = context.mounted.renderProgram?.parentInstance;
	if (!owner) {
		context.valid = false;
		return;
	}
	const component = owner as ComponentUpdateOwner;
	let state = component[componentUpdateState];
	if (!state) {
		const dependencies = reactiveOwnDependencies(
			owner.state,
			updates.bindings.map(([key]) => key)
		);
		if (!dependencies) {
			context.valid = false;
			return;
		}
		state = {
			d: dependencies.target,
			k: dependencies.keys,
			v: dependencies.keys.map((key) => readMutationVersion(dependencies.target, key)),
			t: []
		};
		component[componentUpdateState] = state;
		subscribeKeys(state.d, state.k, () => publishCompiledComponentUpdate(updates, state!), {
			scope: owner.scope
		});
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
	updates: ExactCompiledComponentUpdateContract,
	state: CompiledComponentUpdateState
): void {
	let dirtyLow = 0;
	let dirtyHigh = 0;
	for (let index = 0; index < state.k.length; index++) {
		const version = readMutationVersion(state.d, state.k[index]!);
		if (version === state.v[index]) continue;
		state.v[index] = version;
		dirtyLow |= updates.bindings[index]![1];
		dirtyHigh |= updates.bindings[index]![2];
	}
	if (dirtyLow || dirtyHigh) updates.apply(state.t, dirtyLow, dirtyHigh);
}
