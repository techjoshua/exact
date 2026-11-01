import { withSuppliedPlacementInputs } from './supplied-placement-capability.js';
import { attachSuppressedCleanupFailure, type AnyComponentInstance } from '@exactjs/core';
import type { ExactWideComponentUpdateContract } from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import {
	prepareCompiledComponentDependencies,
	type CompiledComponentDependencies,
	visitChangedCompiledComponentDependencies
} from './component-update-dependencies.js';
import {
	bindComponentUpdateTarget,
	componentUpdateOwner,
	publishComponentUpdateTargets,
	type CompiledComponentUpdateTargets
} from './component-update-storage.js';

/** Lazily allocated mask storage for one compiler-generated wide component update program. */
type CompiledWideComponentUpdateState = {
	readonly d: CompiledComponentDependencies;
	readonly t: CompiledComponentUpdateTargets;
	readonly w: Uint32Array;
};

type WideComponentUpdateOwner = AnyComponentInstance & {
	[wideComponentUpdateState]?: CompiledWideComponentUpdateState;
};

const wideComponentUpdateState = Symbol('exact.dom.component-wide-updates');

/** Joins one finite DOM region to a compiler-generated update program wider than 64 operations. */
export function bindCompiledWideComponentUpdate(
	target: ExactRenderProgramBindingTarget,
	index: number,
	updates: ExactWideComponentUpdateContract
): void {
	const owner = componentUpdateOwner(target);
	if (!owner) return;
	const component = owner as WideComponentUpdateOwner;
	const state = component[wideComponentUpdateState];
	if (!state) {
		const dependencies = prepareCompiledComponentDependencies(
			owner,
			updates.bindings,
			updates.props!,
			(binding) => publishCompiledWideComponentUpdate(owner, updates, initialized, binding)
		);
		if (!dependencies) {
			(target as { valid: boolean }).valid = false;
			return;
		}
		const initialized: CompiledWideComponentUpdateState = {
			d: dependencies,
			t: [],
			w: new Uint32Array(updates.words - 2)
		};
		try {
			dependencies.activate();
			bindComponentUpdateTarget(target, initialized.t, index);
			component[wideComponentUpdateState] = initialized;
		} catch (error) {
			initialized.t.length = 0;
			try {
				dependencies.stop();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
		// Publication starts only after complete acquisition and target commit, including versions
		// advanced by forwarded evaluation before subscriptions existed.
		publishCompiledWideComponentUpdate(owner, updates, initialized);
		return;
	}
	bindComponentUpdateTarget(target, state.t, index);
}

/** Publishes every changed compiler-sized mask word through the generated wide updater. */
function publishCompiledWideComponentUpdate(
	owner: AnyComponentInstance,
	updates: ExactWideComponentUpdateContract,
	state: CompiledWideComponentUpdateState,
	forwardedBinding?: number
): void {
	let dirtyLow = 0;
	let dirtyHigh = 0;
	let changed = false;
	changed = visitChangedCompiledComponentDependencies(
		state.d,
		(index) => {
			const binding = updates.bindings[index]!;
			dirtyLow |= binding[1];
			dirtyHigh |= binding[2];
			const bindingWords = binding as unknown as readonly number[];
			for (let word = 0; word < state.w.length; word++) {
				state.w[word] = state.w[word]! | (bindingWords[word + 3] ?? 0);
			}
		},
		forwardedBinding
	);
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
