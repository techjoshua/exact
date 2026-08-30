import { unwrap } from '@exactjs/reactive/framework/values';
import type {
	ExactRenderProgramBindingOperation,
	ExactRenderProgramBindingTarget,
	ExactRenderProgramSlot,
	ExactRenderProgramWiring
} from '@exactjs/core/runtime/render-operations';
import type {
	ExactNarrowComponentUpdateContract,
	ExactWideComponentUpdateContract
} from '@exactjs/core/framework/component-contracts';
import { readRenderProgramSlot } from '@exactjs/core/runtime/render-operations';
import { type OwnedRetainedWatch, watchRetained } from '@exactjs/reactive/framework/watch';
import { currentWorkPriority, scheduleWork } from '@exactjs/reactive/framework/runtime';
import { applyCompiledProps, releaseCompiledProps } from '../compiled-props.js';
import { clearElementProps, updateProps } from '../props.js';
import type { Mounted } from '../types.js';
import {
	applyProgramChild,
	bindProgramChild,
	bindProgramKeyedChild,
	bindProgramLists
} from './render-program-children.js';
import { applyProgramComponent, bindProgramComponent } from './render-program-components.js';
import {
	createCompiledComponentDependencies,
	type CompiledComponentDependencies,
	visitChangedCompiledComponentDependencies
} from './component-update-dependencies.js';
import { componentUpdateOwner } from './component-update-storage.js';
import { bindCompiledComponentUpdate } from './component-update-binding.js';
import { bindCompiledWideComponentUpdate } from './component-update-wide-binding.js';
import {
	bindCompiledStateComponentUpdate,
	bindCompiledWideStateComponentUpdate
} from './component-state-update-binding.js';

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
		state.directChildUpdates = undefined;
		state.componentReceipts = undefined;
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
		const wiring = state.invocation.program.wire;
		const binder = state.invocation.program.bind;
		if (wiring) executeCompiledProgramBindings(wiring, target);
		else if (binder) binder(target);
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

/** Executes one immutable component-local binding sequence against the mounted region. */
function executeCompiledProgramBindings(
	wiring: ExactRenderProgramWiring,
	target: ExactRenderProgramBindingTarget
): void {
	for (const operation of wiring[2]) {
		executeCompiledProgramBinding(operation, target);
		if (!(target as ProgramBindingTarget).valid) return;
	}
}

function executeCompiledProgramBinding(
	operation: ExactRenderProgramBindingOperation,
	target: ExactRenderProgramBindingTarget
): void {
	switch (operation[0]) {
		case 0:
			bindCompiledProgramText(
				target,
				operation[1] as number,
				operation[2] === true ? true : undefined
			);
			return;
		case 1:
			bindCompiledProgramChild(
				target,
				operation[1] as number,
				operation[2] === true ? true : undefined
			);
			return;
		case 2:
			bindCompiledProgramComponent(
				target,
				operation[1] as number,
				operation[2] as readonly (readonly [slot: number])[],
				operation[3] as number
			);
			return;
		case 3:
			bindCompiledProgramKeyedChild(target, operation[1] as number);
			return;
		case 4:
			bindCompiledProgramLists(target, operation[1] as readonly number[]);
			return;
		case 5:
			bindCompiledProgramProperties(
				target,
				operation[1] as number,
				operation[2] as number,
				operation[3] === true ? true : undefined
			);
			return;
		case 6:
			bindCompiledReactiveProgramProperties(target, operation[1] as number, operation[2] as number);
			return;
		case 7:
			bindCompiledComponentUpdate(
				target,
				operation[1] as number,
				operation[2] as ExactNarrowComponentUpdateContract
			);
			return;
		case 8:
			bindCompiledWideComponentUpdate(
				target,
				operation[1] as number,
				operation[2] as ExactWideComponentUpdateContract
			);
			return;
		case 9:
			bindCompiledStateComponentUpdate(
				target,
				operation[1] as number,
				operation[2] as ExactNarrowComponentUpdateContract
			);
			return;
		case 10:
			bindCompiledWideStateComponentUpdate(
				target,
				operation[1] as number,
				operation[2] as ExactWideComponentUpdateContract
			);
			return;
		default:
			(target as ProgramBindingTarget).valid = false;
	}
}

/** Binds one compiler-proven native component slot to direct target-artifact prop receipt. */
export function bindCompiledProgramComponent(
	target: ExactRenderProgramBindingTarget,
	index: number,
	bindings: readonly (readonly [slot: number])[],
	props: number
): void {
	const context = target as ProgramBindingTarget;
	const owner = componentUpdateOwner(target);
	if (!owner || !bindProgramComponent(context.mounted, index, context.initialBinding)) {
		context.valid = false;
		return;
	}
	if (bindings.length !== 0) {
		const applyReceipt = () => {
			if (!applyProgramComponent(context.mounted, index)) context.valid = false;
		};
		const publish = (forwardedBinding?: number) => {
			if (dependencies)
				visitChangedCompiledComponentDependencies(dependencies, () => undefined, forwardedBinding);
			scheduleWork(applyReceipt, currentWorkPriority(), undefined, context.mounted.scope);
		};
		const dependencies: CompiledComponentDependencies | undefined =
			createCompiledComponentDependencies(owner, bindings, props, publish, context.mounted.scope);
		if (!dependencies) context.valid = false;
		else context.stopBindings.push(dependencies);
	}
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
	index: number,
	direct?: true
): void {
	const context = target as ProgramBindingTarget;
	if (
		!bindProgramChild(context.mounted, index, context.initialBinding, context.stopBindings, direct)
	)
		context.valid = false;
}

/** Applies one compiler-selected structural operation without installing a dynamic watcher. */
export function applyCompiledProgramChild(
	target: ExactRenderProgramBindingTarget,
	index: number
): void {
	const context = target as ProgramBindingTarget;
	if (!applyProgramChild(context.mounted, index)) context.valid = false;
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

/** Binds one compiler-generated keyed child array without a component list controller. */
export function bindCompiledProgramKeyedChild(
	target: ExactRenderProgramBindingTarget,
	index: number
): void {
	const context = target as ProgramBindingTarget;
	if (!bindProgramKeyedChild(context.mounted, index, context.initialBinding, context.stopBindings))
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

/** Binds one compiler-selected arbitrary-JavaScript property reader as a focused reactive update. */
export function bindCompiledReactiveProgramProperties(
	target: ExactRenderProgramBindingTarget,
	group: number,
	firstSlot: number
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const element = state.slotNodes[firstSlot] as Element;
	if (!state.invocation.propertyWriter || !element) {
		context.valid = false;
		return;
	}
	retainBinding(context, () =>
		applyCompiledProps(context.mounted, element, group, context.initialBinding)
	);
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

function applyProgramText(mounted: Mounted, index: number): boolean {
	const state = mounted.renderProgram!;
	const value = unwrap(readRenderProgramSlot(state.invocation, index));
	const node = state.slotNodes[index];
	if (!(node instanceof Text)) return false;
	const text =
		value === null || value === undefined || value === false || value === true
			? ''
			: typeof value === 'string' || typeof value === 'number'
				? String(value)
				: undefined;
	if (text === undefined) return false;
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
	indexes: readonly number[],
	slots: readonly ExactRenderProgramSlot[]
): void {
	const context = target as ProgramBindingTarget;
	const state = context.mounted.renderProgram!;
	const element = state.slotNodes[indexes[0]!] as Element;
	retainBinding(context, () => {
		const previous = (state.props ??= new Map<Element, Record<string, unknown>>());
		const next: Record<string, unknown> = {};
		for (const index of indexes) {
			const slot = slots[index]!;
			if (slot[0] === 'text' || slot[0] === 'child' || slot[0] === 'component') continue;
			const value = unwrap(readRenderProgramSlot(state.invocation, index));
			if (slot[0] === 'spread') {
				if (value !== null && value !== undefined && typeof value === 'object')
					Object.assign(next, value);
			} else next[slot[2]] = value;
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
	indexes: readonly number[],
	slots: readonly ExactRenderProgramSlot[]
): void {
	const context = target as ProgramBindingTarget;
	if (context.mounted.renderProgram!.invocation.propertyWriter)
		bindCompiledProgramProperties(target, group, indexes[0]!);
	else bindGenericProgramProperties(target, indexes, slots);
}
