import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';
import type { OwnedRetainedWatch } from '@exactjs/reactive/framework/watch';
import {
	reactiveOwnDependencies,
	readMutationVersion,
	subscribeKeys,
	type StopHandle
} from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../types.js';

/** One compiler-generated region updater registered beneath its durable component owner. */
type ComponentUpdateLane = {
	readonly target: ExactRenderProgramBindingTarget;
	readonly updater: (
		target: ExactRenderProgramBindingTarget,
		dirtyLow: number,
		dirtyHigh: number
	) => void;
	readonly bindings: readonly (readonly [key: PropertyKey, dirtyLow: number, dirtyHigh: number])[];
	dirtyLow: number;
	dirtyHigh: number;
};

/** One state key and the generated update masks it publishes to affected component lanes. */
type ComponentUpdateKey = {
	readonly key: PropertyKey;
	readonly lanes: Array<readonly [lane: ComponentUpdateLane, dirtyLow: number, dirtyHigh: number]>;
};

/** Lazily allocated state shared by every generated update lane in one component instance. */
type ComponentUpdateState = {
	readonly owner: AnyComponentInstance;
	readonly target: object;
	readonly lanes: ComponentUpdateLane[];
	keys: ComponentUpdateKey[];
	versions: number[];
	stop?: StopHandle;
};

let componentUpdates: WeakMap<AnyComponentInstance, ComponentUpdateState> | undefined;

type ProgramBindingTarget = {
	readonly mounted: Mounted;
	readonly stopBindings: OwnedRetainedWatch[];
	valid: boolean;
};

/** Registers a pre-component-ABI program updater with its durable component reaction. */
export function bindCompiledProgramState(
	target: ExactRenderProgramBindingTarget,
	bindings: readonly (readonly [key: string, dirtyLow: number, dirtyHigh: number])[]
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const owner = state.parentInstance;
	const updater = state.invocation.program.update;
	if (!owner || !updater) {
		context.valid = false;
		return;
	}
	const stop = registerComponentUpdateLane(owner, target, bindings, updater);
	if (!stop) {
		context.valid = false;
		return;
	}
	context.stopBindings.push({ stop });
}

/**
 * Registers one generated region updater with its component-owned dirty-state reaction.
 *
 * Every region keeps its own direct operation function, while the durable component owns the
 * single dependency subscription and mutation-version table. The returned release removes only
 * this region and tears down the shared reaction after its final lane leaves.
 */
export function registerComponentUpdateLane(
	owner: AnyComponentInstance,
	target: ExactRenderProgramBindingTarget,
	bindings: readonly (readonly [key: string, dirtyLow: number, dirtyHigh: number])[],
	updater: ComponentUpdateLane['updater']
): StopHandle | undefined {
	const dependencies = reactiveOwnDependencies(
		owner.state,
		bindings.map(([key]) => key)
	);
	if (!dependencies) return undefined;

	const updates = (componentUpdates ??= new WeakMap());
	let state = updates.get(owner);
	if (!state) {
		state = {
			owner,
			target: dependencies.target,
			lanes: [],
			keys: [],
			versions: []
		};
		updates.set(owner, state);
	} else if (state.target !== dependencies.target) {
		return undefined;
	}

	const lane: ComponentUpdateLane = {
		target,
		updater,
		bindings: dependencies.keys.map((key, index) => [
			key,
			bindings[index]![1],
			bindings[index]![2]
		]),
		dirtyLow: 0,
		dirtyHigh: 0
	};
	state.lanes.push(lane);
	restartComponentUpdateReaction(state);

	let active = true;
	return () => {
		if (!active) return;
		active = false;
		const index = state!.lanes.indexOf(lane);
		if (index !== -1) state!.lanes.splice(index, 1);
		if (state!.lanes.length === 0) {
			state!.stop?.();
			updates.delete(owner);
			return;
		}
		restartComponentUpdateReaction(state!);
	};
}

/** Rebuilds the one direct subscription after a generated region enters or leaves the component. */
function restartComponentUpdateReaction(state: ComponentUpdateState): void {
	state.stop?.();
	const keys: ComponentUpdateKey[] = [];
	const indexes = new Map<PropertyKey, number>();
	for (const lane of state.lanes) {
		for (const [key, dirtyLow, dirtyHigh] of lane.bindings) {
			let index = indexes.get(key);
			if (index === undefined) {
				index = keys.length;
				indexes.set(key, index);
				keys.push({ key, lanes: [] });
			}
			keys[index]!.lanes.push([lane, dirtyLow, dirtyHigh]);
		}
	}
	state.keys = keys;
	state.versions = keys.map(({ key }) => readMutationVersion(state.target, key));
	state.stop = subscribeKeys(
		state.target,
		keys.map(({ key }) => key),
		() => publishComponentDirtyState(state),
		{ scope: state.owner.scope }
	);
}

/** Reads one component mutation snapshot and invokes only generated lanes affected by it. */
function publishComponentDirtyState(state: ComponentUpdateState): void {
	for (let index = 0; index < state.keys.length; index++) {
		const update = state.keys[index]!;
		const version = readMutationVersion(state.target, update.key);
		if (version === state.versions[index]) continue;
		state.versions[index] = version;
		for (const [lane, dirtyLow, dirtyHigh] of update.lanes) {
			lane.dirtyLow |= dirtyLow;
			lane.dirtyHigh |= dirtyHigh;
		}
	}

	let failed = false;
	let firstError: unknown;
	for (const lane of state.lanes) {
		const dirtyLow = lane.dirtyLow;
		const dirtyHigh = lane.dirtyHigh;
		lane.dirtyLow = 0;
		lane.dirtyHigh = 0;
		if (!dirtyLow && !dirtyHigh) continue;
		try {
			lane.updater(lane.target, dirtyLow, dirtyHigh);
		} catch (error) {
			if (!failed) firstError = error;
			failed = true;
		}
	}
	if (failed) throw firstError;
}
