import { withSuppliedPlacementInputs } from './supplied-placement-capability.js';
import { attachSuppressedCleanupFailure, type AnyComponentInstance } from '@exactjs/core';
import type {
	ExactNarrowComponentUpdateContract,
	ExactWideComponentUpdateContract
} from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import { subscribeKeys, type StopHandle } from '@exactjs/reactive/framework/runtime';
import { compiledComponentUpdateOptions } from './component-update-dependencies.js';
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
	const state = owner[compiledComponentUpdateState];
	if (!state) {
		const dependencies = createComponentDependencyGroup(owner, updates.bindings, 'state');
		if (!dependencies) {
			(target as { valid: boolean }).valid = false;
			return;
		}
		const initialized: CompiledStateUpdateState = { d: dependencies, t: [] };
		let release: StopHandle | undefined;
		try {
			release = subscribeKeys(
				initialized.d.d,
				initialized.d.k,
				() => publishStateUpdate(owner, updates, initialized),
				compiledComponentUpdateOptions(owner.scope)
			);
			bindComponentUpdateTarget(target, initialized.t, index);
			owner[compiledComponentUpdateState] = initialized;
		} catch (error) {
			initialized.t.length = 0;
			try {
				release?.();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
		publishStateUpdate(owner, updates, initialized);
		return;
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
	const state = owner[wideComponentStateUpdate];
	if (!state) {
		const dependencies = createComponentDependencyGroup(owner, updates.bindings, 'state');
		if (!dependencies) {
			(target as { valid: boolean }).valid = false;
			return;
		}
		const initialized: CompiledWideStateUpdateState = {
			d: dependencies,
			t: [],
			w: new Uint32Array(updates.words - 2)
		};
		let release: StopHandle | undefined;
		try {
			release = subscribeKeys(
				initialized.d.d,
				initialized.d.k,
				() => publishWideStateUpdate(owner, updates, initialized),
				compiledComponentUpdateOptions(owner.scope)
			);
			bindComponentUpdateTarget(target, initialized.t, index);
			owner[wideComponentStateUpdate] = initialized;
		} catch (error) {
			initialized.t.length = 0;
			try {
				release?.();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
		publishWideStateUpdate(owner, updates, initialized);
		return;
	}
	bindComponentUpdateTarget(target, state.t, index);
}

function publishStateUpdate(
	owner: AnyComponentInstance,
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
		withSuppliedPlacementInputs(owner, () =>
			publishComponentUpdateTargets(state.t, (targets) =>
				updates.apply(targets, dirtyLow, dirtyHigh)
			)
		);
}

function publishWideStateUpdate(
	owner: AnyComponentInstance,
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
		withSuppliedPlacementInputs(owner, () =>
			publishComponentUpdateTargets(state.t, (targets) =>
				updates.apply(targets, dirtyLow, dirtyHigh, state.w)
			)
		);
	} finally {
		state.w.fill(0);
	}
}
