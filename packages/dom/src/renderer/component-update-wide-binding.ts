import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactWideComponentUpdateContract } from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';
import type { Mounted } from '../types.js';
import {
	createCompiledComponentDependencies,
	type CompiledComponentDependencies,
	visitChangedCompiledComponentDependencies
} from './component-update-dependencies.js';

/** Lazily allocated mask storage for one compiler-generated wide component update program. */
type CompiledWideComponentUpdateState = {
	readonly d: CompiledComponentDependencies;
	readonly t: Array<ExactRenderProgramBindingTarget | undefined>;
	readonly w: Uint32Array;
};

type WideComponentUpdateOwner = AnyComponentInstance & {
	[wideComponentUpdateState]?: CompiledWideComponentUpdateState;
};

const wideComponentUpdateState = Symbol('exact.dom.component-wide-updates');

type ProgramBindingTarget = {
	readonly mounted: Mounted;
	readonly stopBindings: Array<{ stop(): void }>;
	valid: boolean;
};

/** Joins one finite DOM region to a compiler-generated update program wider than 64 operations. */
export function bindCompiledWideComponentUpdate(
	target: ExactRenderProgramBindingTarget,
	index: number,
	updates: ExactWideComponentUpdateContract
): void {
	const context = target as ProgramBindingTarget;
	const owner =
		context.mounted.renderProgram?.bindingOwner ?? context.mounted.renderProgram?.parentInstance;
	if (!owner) {
		context.valid = false;
		return;
	}
	const component = owner as WideComponentUpdateOwner;
	let state = component[wideComponentUpdateState];
	if (!state) {
		let initialized: CompiledWideComponentUpdateState;
		const dependencies = createCompiledComponentDependencies(owner, updates.bindings, (binding) =>
			publishCompiledWideComponentUpdate(updates, initialized, binding)
		);
		if (!dependencies) {
			context.valid = false;
			return;
		}
		state = initialized = {
			d: dependencies,
			t: [],
			w: new Uint32Array(updates.words - 2)
		};
		component[wideComponentUpdateState] = state;
	}
	state.t[index] = target;

	context.stopBindings.push({
		stop: () => {
			if (state!.t[index] === target) state!.t[index] = undefined;
		}
	});
}

/** Publishes every changed compiler-sized mask word through the generated wide updater. */
function publishCompiledWideComponentUpdate(
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
			dirtyLow |= binding[2];
			dirtyHigh |= binding[3];
			const bindingWords = binding as unknown as readonly number[];
			for (let word = 0; word < state.w.length; word++) {
				state.w[word] = state.w[word]! | (bindingWords[word + 4] ?? 0);
			}
		},
		forwardedBinding
	);
	if (!changed) return;
	try {
		updates.apply(state.t, dirtyLow, dirtyHigh, state.w);
	} finally {
		state.w.fill(0);
	}
}
