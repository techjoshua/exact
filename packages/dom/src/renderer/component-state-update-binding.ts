import type { AnyComponentInstance } from '@exactjs/core';
import type {
	ExactNarrowComponentUpdateContract,
	ExactWideComponentUpdateContract
} from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import { subscribeKeys } from '@exactjs/reactive/framework/runtime';
import {
	bindComponentUpdateTarget,
	compiledComponentUpdateState,
	componentUpdateOwner,
	createComponentDependencyGroup,
	publishComponentUpdateTargets,
	visitChangedComponentDependencyGroup,
	type CompiledComponentUpdateTargets,
	type CompiledComponentDependencyGroup
} from './component-update-storage.js';

type CompiledStateUpdateState = {
	readonly d: CompiledComponentDependencyGroup;
	readonly t: CompiledComponentUpdateTargets;
};

type CompiledWideStateUpdateState = CompiledStateUpdateState & {
	readonly w: Uint32Array;
};

type StateUpdateOwner = AnyComponentInstance & {
	[compiledComponentUpdateState]?: CompiledStateUpdateState;
	[wideComponentStateUpdate]?: CompiledWideStateUpdateState;
};

const wideComponentStateUpdate = Symbol('exact.dom.component-wide-state-updates');

/** Joins a finite region to an update artifact proven to read only indexed component state. */
export function bindCompiledStateComponentUpdate(
	target: ExactRenderProgramBindingTarget,
	index: number,
	updates: ExactNarrowComponentUpdateContract
): void {
	const owner = componentUpdateOwner(target) as StateUpdateOwner | undefined;
	if (!owner) return;
	let state = owner[compiledComponentUpdateState];
	if (!state) {
		const dependencies = createComponentDependencyGroup(owner, updates.bindings, 'state');
		if (!dependencies) {
			(target as { valid: boolean }).valid = false;
			return;
		}
		state = { d: dependencies, t: [] };
		owner[compiledComponentUpdateState] = state;
		subscribeKeys(state.d.d, state.d.k, () => publishStateUpdate(updates, state!), {
			scope: owner.scope
		});
	}
	bindComponentUpdateTarget(target, state.t, index);
}

/** Joins a finite region to a state-only update artifact wider than 64 operations. */
export function bindCompiledWideStateComponentUpdate(
	target: ExactRenderProgramBindingTarget,
	index: number,
	updates: ExactWideComponentUpdateContract
): void {
	const owner = componentUpdateOwner(target) as StateUpdateOwner | undefined;
	if (!owner) return;
	let state = owner[wideComponentStateUpdate];
	if (!state) {
		const dependencies = createComponentDependencyGroup(owner, updates.bindings, 'state');
		if (!dependencies) {
			(target as { valid: boolean }).valid = false;
			return;
		}
		state = { d: dependencies, t: [], w: new Uint32Array(updates.words - 2) };
		owner[wideComponentStateUpdate] = state;
		subscribeKeys(state.d.d, state.d.k, () => publishWideStateUpdate(updates, state!), {
			scope: owner.scope
		});
	}
	bindComponentUpdateTarget(target, state.t, index);
}

function publishStateUpdate(
	updates: ExactNarrowComponentUpdateContract,
	state: CompiledStateUpdateState
): void {
	let dirtyLow = 0;
	let dirtyHigh = 0;
	visitChangedComponentDependencyGroup(state.d, (index) => {
		dirtyLow |= updates.bindings[index]![1];
		dirtyHigh |= updates.bindings[index]![2];
	});
	if (dirtyLow || dirtyHigh)
		publishComponentUpdateTargets(state.t, (targets) =>
			updates.apply(targets, dirtyLow, dirtyHigh)
		);
}

function publishWideStateUpdate(
	updates: ExactWideComponentUpdateContract,
	state: CompiledWideStateUpdateState
): void {
	let dirtyLow = 0;
	let dirtyHigh = 0;
	let changed = false;
	changed = visitChangedComponentDependencyGroup(state.d, (index) => {
		const binding = updates.bindings[index]!;
		dirtyLow |= binding[1];
		dirtyHigh |= binding[2];
		const bindingWords = binding as unknown as readonly number[];
		for (let word = 0; word < state.w.length; word++)
			state.w[word] = state.w[word]! | (bindingWords[word + 3] ?? 0);
	});
	if (!changed) return;
	try {
		publishComponentUpdateTargets(state.t, (targets) =>
			updates.apply(targets, dirtyLow, dirtyHigh, state.w)
		);
	} finally {
		state.w.fill(0);
	}
}
