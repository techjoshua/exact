import type { AnyComponentInstance } from '@exactjs/core';
import type {
	ExactNarrowComponentUpdateContract,
	ExactWideComponentUpdateContract
} from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';
import {
	reactiveOwnDependencies,
	readMutationVersion,
	subscribeKeys
} from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../types.js';

type CompiledStateDependencies = {
	readonly d: object;
	readonly k: readonly PropertyKey[];
	readonly v: number[];
};

type CompiledStateUpdateState = CompiledStateDependencies & {
	readonly t: Array<ExactRenderProgramBindingTarget | undefined>;
};

type CompiledWideStateUpdateState = CompiledStateUpdateState & {
	readonly w: Uint32Array;
};

type StateUpdateOwner = AnyComponentInstance & {
	[componentStateUpdate]?: CompiledStateUpdateState;
	[wideComponentStateUpdate]?: CompiledWideStateUpdateState;
};

const componentStateUpdate = Symbol('exact.dom.component-state-updates');
const wideComponentStateUpdate = Symbol('exact.dom.component-wide-state-updates');

type ProgramBindingTarget = {
	readonly mounted: Mounted;
	readonly stopBindings: Array<{ stop(): void }>;
	valid: boolean;
};

/** Joins a finite region to an update artifact proven to read only indexed component state. */
export function bindCompiledStateComponentUpdate(
	target: ExactRenderProgramBindingTarget,
	index: number,
	updates: ExactNarrowComponentUpdateContract
): void {
	const context = target as ProgramBindingTarget;
	const owner = componentOwner(context);
	if (!owner) return;
	let state = owner[componentStateUpdate];
	if (!state) {
		const dependencies = stateDependencies(owner, updates);
		if (!dependencies) {
			context.valid = false;
			return;
		}
		state = { ...dependencies, t: [] };
		owner[componentStateUpdate] = state;
		subscribeKeys(state.d, state.k, () => publishStateUpdate(updates, state!), {
			scope: owner.scope
		});
	}
	bindTarget(context, state.t, target, index);
}

/** Joins a finite region to a state-only update artifact wider than 64 operations. */
export function bindCompiledWideStateComponentUpdate(
	target: ExactRenderProgramBindingTarget,
	index: number,
	updates: ExactWideComponentUpdateContract
): void {
	const context = target as ProgramBindingTarget;
	const owner = componentOwner(context);
	if (!owner) return;
	let state = owner[wideComponentStateUpdate];
	if (!state) {
		const dependencies = stateDependencies(owner, updates);
		if (!dependencies) {
			context.valid = false;
			return;
		}
		state = { ...dependencies, t: [], w: new Uint32Array(updates.words - 2) };
		owner[wideComponentStateUpdate] = state;
		subscribeKeys(state.d, state.k, () => publishWideStateUpdate(updates, state!), {
			scope: owner.scope
		});
	}
	bindTarget(context, state.t, target, index);
}

function componentOwner(context: ProgramBindingTarget): StateUpdateOwner | undefined {
	const owner =
		context.mounted.renderProgram?.bindingOwner ?? context.mounted.renderProgram?.parentInstance;
	if (owner) return owner as StateUpdateOwner;
	context.valid = false;
	return undefined;
}

function stateDependencies(
	owner: AnyComponentInstance,
	updates: ExactNarrowComponentUpdateContract | ExactWideComponentUpdateContract
): CompiledStateDependencies | undefined {
	const dependencies = reactiveOwnDependencies(
		owner.state,
		updates.bindings.map((binding) => binding[1])
	);
	if (!dependencies) return undefined;
	return {
		d: dependencies.target,
		k: dependencies.keys,
		v: dependencies.keys.map((key) => readMutationVersion(dependencies.target, key))
	};
}

function bindTarget(
	context: ProgramBindingTarget,
	targets: Array<ExactRenderProgramBindingTarget | undefined>,
	target: ExactRenderProgramBindingTarget,
	index: number
): void {
	targets[index] = target;
	context.stopBindings.push({
		stop: () => {
			if (targets[index] === target) targets[index] = undefined;
		}
	});
}

function publishStateUpdate(
	updates: ExactNarrowComponentUpdateContract,
	state: CompiledStateUpdateState
): void {
	let dirtyLow = 0;
	let dirtyHigh = 0;
	for (let index = 0; index < state.k.length; index++) {
		const version = readMutationVersion(state.d, state.k[index]!);
		if (version === state.v[index]) continue;
		state.v[index] = version;
		dirtyLow |= updates.bindings[index]![2];
		dirtyHigh |= updates.bindings[index]![3];
	}
	if (dirtyLow || dirtyHigh) updates.apply(state.t, dirtyLow, dirtyHigh);
}

function publishWideStateUpdate(
	updates: ExactWideComponentUpdateContract,
	state: CompiledWideStateUpdateState
): void {
	let dirtyLow = 0;
	let dirtyHigh = 0;
	let changed = false;
	for (let index = 0; index < state.k.length; index++) {
		const version = readMutationVersion(state.d, state.k[index]!);
		if (version === state.v[index]) continue;
		state.v[index] = version;
		changed = true;
		const binding = updates.bindings[index]!;
		dirtyLow |= binding[2];
		dirtyHigh |= binding[3];
		const bindingWords = binding as unknown as readonly number[];
		for (let word = 0; word < state.w.length; word++)
			state.w[word] = state.w[word]! | (bindingWords[word + 4] ?? 0);
	}
	if (!changed) return;
	try {
		updates.apply(state.t, dirtyLow, dirtyHigh, state.w);
	} finally {
		state.w.fill(0);
	}
}
