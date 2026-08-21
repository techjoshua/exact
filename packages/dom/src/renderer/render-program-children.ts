import {
	type AnyComponentInstance,
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult,
	unwrap,
	type Child
} from '@exactjs/core';
import {
	readRenderProgramSlot,
	type ExactRenderProgramInvocation
} from '@exactjs/core/runtime/render';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import type { EffectScope } from '@exactjs/reactive';
import { placeMountedBefore } from '../placement.js';
import type { Mounted } from '../types.js';
import { mountDetachedChildren } from './mounting/children.js';
import { patchChildren } from './patching/children.js';

/** Adopts every compiler-owned variable-width child range inside one program. */
export function adoptProgramChildSlots(
	mounted: Mounted,
	parentInstance: AnyComponentInstance,
	adoptChildren: (
		children: readonly Child[],
		nodes: readonly Node[],
		parentInstance: AnyComponentInstance,
		scope: EffectScope,
		cursor: number,
		end: number
	) => Mounted[] | undefined
): boolean {
	const state = mounted.renderProgram!;
	for (let index = 0; index < state.invocation.program.slots.length; index++) {
		const slot = state.invocation.program.slots[index]!;
		if (slot[0] !== 'child') continue;
		const start = state.slotNodes[index];
		const end = findProgramChildEnd(start, slot[1]);
		const parent = start?.parentNode;
		if (!(start instanceof Comment) || !end || !parent) return false;
		const nodes = [...parent.childNodes];
		const cursor = nodes.indexOf(start);
		const endIndex = nodes.indexOf(end);
		if (cursor < 0 || endIndex < cursor) return false;
		const value = readProgramChildren(state.invocation, index, parentInstance);
		const children = adoptChildren(
			value,
			nodes,
			parentInstance,
			mounted.scope,
			cursor + 1,
			endIndex
		);
		if (!children) return false;
		const childSlots = (state.childSlots ??= new Map());
		childSlots.set(index, { end, children, value });
	}
	if (state.childSlots)
		mounted.children = [...state.childSlots.values()].flatMap((entry) => entry.children);
	return true;
}

/** Installs one structural slot reaction through the ordinary mounted-child operations. */
export function bindProgramChild(
	mounted: Mounted,
	index: number,
	initialBinding: boolean,
	stopBindings: Array<() => void>
): boolean {
	const state = mounted.renderProgram!;
	const start = state.slotNodes[index];
	const slot = state.invocation.program.slots[index];
	const identity = slot?.[0] === 'child' ? slot[1] : undefined;
	const end = findProgramChildEnd(start, identity);
	if (!(start instanceof Comment) || !end || !start.parentNode) return false;
	const childSlots = (state.childSlots ??= new Map());
	const childState = childSlots.get(index) ?? { end, children: [] };
	childSlots.set(index, childState);
	const applyChildren = () => {
		const next = readProgramChildren(state.invocation, index, state.parentInstance);
		if (sameProgramChildren(childState.value, next)) return;
		const parent = start.parentNode;
		if (!parent) return;
		if (initialBinding && childState.children.length === 0) {
			childState.children = mountDetachedChildren(
				state.root,
				next,
				state.parentInstance,
				mounted.scope,
				parent
			);
			for (const child of childState.children) placeMountedBefore(state.root, parent, child, end);
		} else {
			childState.children = patchChildren(
				state.root,
				parent,
				childState.children,
				next,
				state.parentInstance,
				mounted.scope,
				end,
				mounted
			);
		}
		childState.value = next;
		mounted.children = [...childSlots.values()].flatMap((entry) => entry.children);
	};
	const stop = watchRetained(applyChildren, undefined, { scope: mounted.scope });
	if (stop) stopBindings.push(stop);
	return true;
}

/** Finds the closing marker for one compiler-owned structural child slot. */
export function findProgramChildEnd(
	start: Node | undefined,
	id: string | undefined
): Comment | undefined {
	if (!(start instanceof Comment) || !id) return undefined;
	const identity = id.startsWith('exact:') ? id.slice('exact:'.length) : id;
	for (let node = start.nextSibling; node; node = node.nextSibling) {
		if (node instanceof Comment && node.data === `/exact:dynamic:${identity}`) return node;
	}
	return undefined;
}

function readProgramChildren(
	invocation: ExactRenderProgramInvocation,
	index: number,
	parentInstance: AnyComponentInstance | undefined
): Child[] {
	try {
		return normalizeRenderResult(
			unwrap(readRenderProgramSlot(invocation, index)) as Child | Child[]
		);
	} catch (error) {
		if (isPromiseLike(error)) {
			handleComponentSuspension(parentInstance, error);
			return [];
		}
		const fallback = handleComponentError(
			parentInstance,
			createErrorReport(error, 'render', parentInstance, 'compiled-child-slot')
		);
		return fallback ? normalizeRenderResult(fallback()) : [];
	}
}

function sameProgramChildren(
	previous: readonly Child[] | undefined,
	next: readonly Child[]
): boolean {
	if (!previous || previous.length !== next.length) return false;
	return next.every((value, index) => Object.is(value, previous[index]));
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}
