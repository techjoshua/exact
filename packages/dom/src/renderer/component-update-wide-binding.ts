import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactWideComponentUpdateContract } from '@exactjs/core/framework/component-contracts';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';
import {
	reactiveOwnDependencies,
	readMutationVersion,
	subscribeKeys
} from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../types.js';

/** Lazily allocated mask storage for one compiler-generated wide component update program. */
type CompiledWideComponentUpdateState = {
	readonly d: object;
	readonly k: readonly PropertyKey[];
	readonly v: number[];
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
			t: [],
			w: new Uint32Array(updates.words - 2)
		};
		component[wideComponentUpdateState] = state;
		subscribeKeys(state.d, state.k, () => publishCompiledWideComponentUpdate(updates, state!), {
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

/** Publishes every changed compiler-sized mask word through the generated wide updater. */
function publishCompiledWideComponentUpdate(
	updates: ExactWideComponentUpdateContract,
	state: CompiledWideComponentUpdateState
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
		dirtyLow |= binding[1];
		dirtyHigh |= binding[2];
		const bindingWords = binding as unknown as readonly number[];
		for (let word = 0; word < state.w.length; word++) {
			state.w[word] = state.w[word]! | (bindingWords[word + 3] ?? 0);
		}
	}
	if (!changed) return;
	try {
		updates.apply(state.t, dirtyLow, dirtyHigh, state.w);
	} finally {
		state.w.fill(0);
	}
}
