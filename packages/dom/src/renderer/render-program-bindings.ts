import { isVNode, unwrap } from '@exactjs/core';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render';
import { readRenderProgramSlot } from '@exactjs/core/runtime/render';
import { type OwnedRetainedWatch, watchRetained } from '@exactjs/reactive/framework/watch';
import { applyCompiledProps, releaseCompiledProps } from '../compiled-props.js';
import { clearElementProps, updateProps } from '../props.js';
import type { Mounted } from '../types.js';
import { registerComponentUpdateLane } from './component-update-lanes.js';
import { bindProgramChild, bindProgramLists } from './render-program-children.js';

type ProgramBindingTarget = {
	readonly mounted: Mounted;
	readonly initialBinding: boolean;
	readonly stopBindings: OwnedRetainedWatch[];
	valid: boolean;
};

/** Installs and owns the compiler-emitted direct bindings for one mounted program. */
export function bindRenderProgram(mounted: Mounted): boolean {
	const state = mounted.renderProgram!;
	let released = false;
	let initialBinding = true;
	let stopBindings: OwnedRetainedWatch[] = [];
	const stopCurrentBindings = () => {
		for (const binding of stopBindings) binding.stop();
		stopBindings = [];
	};
	const release = () => {
		if (released) return;
		released = true;
		stopCurrentBindings();
		if (state.props) {
			for (const [element, props] of state.props) {
				const ref = props.ref as { fulfill(value: unknown): void } | undefined;
				ref?.fulfill(undefined);
				clearElementProps(element);
			}
			state.props.clear();
			state.props = undefined;
		}
		releaseCompiledProps(mounted);
		mounted.stop = undefined;
		state.refresh = undefined;
	};
	const bind = () => {
		stopCurrentBindings();
		const target: ProgramBindingTarget = {
			mounted,
			initialBinding,
			stopBindings,
			valid: true
		};
		const binder = state.invocation.program.bind;
		if (binder) binder(target);
		else target.valid = false;
		initialBinding = false;
		return target.valid;
	};
	state.refresh = bind;
	mounted.stop = release;
	if (!bind()) {
		release();
		return false;
	}
	return true;
}

/** Binds one compiler-selected scalar text slot. */
export function bindCompiledProgramText(
	target: ExactRenderProgramBindingTarget,
	index: number,
	direct?: true
): void {
	const context = target as ProgramBindingTarget;
	let initialTarget: ProgramBindingTarget | undefined = context;
	const applyText = () => {
		if (!applyProgramText(context.mounted, index)) {
			if (initialTarget) initialTarget.valid = false;
		}
	};
	if (direct) applyText();
	else retainBinding(context, applyText);
	initialTarget = undefined;
}

/** Applies one compiler-selected text operation without installing a dynamic watcher. */
export function applyCompiledProgramText(
	target: ExactRenderProgramBindingTarget,
	index: number
): void {
	const context = target as ProgramBindingTarget;
	if (!applyProgramText(context.mounted, index)) context.valid = false;
}

/** Binds one compiler-selected structural child slot. */
export function bindCompiledProgramChild(
	target: ExactRenderProgramBindingTarget,
	index: number
): void {
	const context = target as ProgramBindingTarget;
	if (!bindProgramChild(context.mounted, index, context.initialBinding, context.stopBindings))
		context.valid = false;
}

/** Binds the compiler-selected keyed-list slots as one render transaction. */
export function bindCompiledProgramLists(
	target: ExactRenderProgramBindingTarget,
	indexes: readonly number[]
): void {
	const context = target as ProgramBindingTarget;
	if (!bindProgramLists(context.mounted, indexes, context.initialBinding, context.stopBindings))
		context.valid = false;
}

/** Binds one compiler-written property group to its exact target slot. */
export function bindCompiledProgramProperties(
	target: ExactRenderProgramBindingTarget,
	group: number,
	firstSlot: number,
	direct?: true
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const element = state.slotNodes[firstSlot] as Element;
	if (!state.invocation.propertyWriter || !element) {
		context.valid = false;
		return;
	}
	const apply = () => applyCompiledProps(context.mounted, element, group, context.initialBinding);
	if (direct) apply();
	else retainBinding(context, apply);
}

/** Applies one compiler-selected property group without installing a dynamic watcher. */
export function applyCompiledProgramProperties(
	target: ExactRenderProgramBindingTarget,
	group: number,
	firstSlot: number
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const element = state.slotNodes[firstSlot];
	if (!(element instanceof Element) || !state.invocation.propertyWriter) {
		context.valid = false;
		return;
	}
	applyCompiledProps(context.mounted, element, group, false);
}

/** Registers compiler-known state fields with the durable component's shared update reaction. */
export function bindCompiledProgramState(
	target: ExactRenderProgramBindingTarget,
	bindings: readonly (readonly [key: string, dirtyLow: number, dirtyHigh: number])[]
): void {
	const context = target as ProgramBindingTarget;
	const mounted = context.mounted;
	const state = mounted.renderProgram!;
	const owner = state.parentInstance;
	const updater = state.invocation.program.update;
	if (!owner || !updater) {
		context.valid = false;
		return;
	}
	const stop = registerComponentUpdateLane(owner, context, bindings, updater);
	if (!stop) {
		context.valid = false;
		return;
	}
	context.stopBindings.push({ stop });
}

function applyProgramText(mounted: Mounted, index: number): boolean {
	const state = mounted.renderProgram!;
	const value = unwrap(readRenderProgramSlot(state.invocation, index));
	const node = state.slotNodes[index];
	if (!(node instanceof Text) || isVNode(value) || Array.isArray(value) || value instanceof Promise)
		return false;
	const text =
		value === null || value === undefined || value === false || value === true ? '' : String(value);
	if (node.data !== text) node.data = text;
	return true;
}

function retainBinding(context: ProgramBindingTarget, apply: () => void): void {
	const watcher = watchRetained(apply, undefined, {
		scope: context.mounted.scope,
		owned: true
	});
	if (watcher) context.stopBindings.push(watcher);
}

/** Binds a fallback property group retained only by explicit generic support artifacts. */
export function bindGenericProgramProperties(
	target: ExactRenderProgramBindingTarget,
	indexes: readonly number[]
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const element = state.slotNodes[indexes[0]!] as Element;
	const slots = state.invocation.program.slots;
	if (!slots) {
		context.valid = false;
		return;
	}
	retainBinding(context, () => {
		const previous = (state.props ??= new Map<Element, Record<string, unknown>>());
		const next: Record<string, unknown> = {};
		for (const index of indexes) {
			const slot = slots[index]!;
			if (slot[0] === 'text' || slot[0] === 'child' || slot[0] === 'component') continue;
			next[slot[2]] = unwrap(readRenderProgramSlot(state.invocation, index));
		}
		updateProps(
			state.root,
			element,
			previous.get(element) ?? {},
			next,
			context.mounted.scope,
			!context.initialBinding
		);
		previous.set(element, next);
	});
}

/** Selects direct or reader-backed properties for an explicit generic support artifact. */
export function bindCompatibleProgramProperties(
	target: ExactRenderProgramBindingTarget,
	group: number,
	indexes: readonly number[]
): void {
	const context = target as ProgramBindingTarget;
	if (context.mounted.renderProgram!.invocation.propertyWriter)
		bindCompiledProgramProperties(target, group, indexes[0]!);
	else bindGenericProgramProperties(target, indexes);
}
