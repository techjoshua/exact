import { isVNode, type AnyComponentInstance, type Child, type VNode } from '@exactjs/core';
import {
	readRenderProgramSlot,
	type ExactRenderProgramInvocation
} from '@exactjs/core/runtime/render';
import { type OwnedRetainedWatch, watchRetained } from '@exactjs/reactive/framework/watch';
import { peek, withEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../placement.js';
import { getListBinding } from '../children.js';
import type { Mounted } from '../types.js';
import { mountDetachedChild, mountDetachedChildren } from './mounting/children.js';
import { patchChildren, patchSingleChild } from './patching/children.js';
import { readDynamicChildren } from './dynamic.js';

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
	const ownsLists = state.invocation.program.bindings.some((binding) => binding[0] === 'lists');
	if (ownsLists) parentInstance.beginRender();
	try {
		for (let index = 0; index < state.invocation.program.slots.length; index++) {
			const slot = state.invocation.program.slots[index]!;
			if (slot[0] !== 'child' && slot[0] !== 'component') continue;
			const start = state.slotNodes[index];
			const end = findProgramChildEnd(start, slot[1]);
			const parent = start?.parentNode;
			if (!(start instanceof Comment) || !end || !parent) return false;
			const nodes: Node[] = [];
			for (let node = parent.firstChild; node; node = node.nextSibling) nodes.push(node);
			const cursor = nodes.indexOf(start);
			const endIndex = nodes.indexOf(end);
			if (cursor < 0 || endIndex < cursor) return false;
			const value = withEffectScope(mounted.scope, () =>
				readProgramChildren(state.invocation, index, parentInstance)
			);
			const children = adoptChildren(
				value,
				nodes,
				parentInstance,
				mounted.scope,
				cursor + 1,
				endIndex
			);
			if (!children) return false;
			const childSlots = (state.childSlots ??= []);
			const componentValue = slot[0] === 'component' ? soleVNode(value) : undefined;
			childSlots.push({
				slot: index,
				end,
				children,
				...(componentValue ? { componentValue } : { value })
			});
		}
	} finally {
		if (ownsLists) parentInstance.endRender();
	}
	refreshMountedChildren(mounted);
	return true;
}

/** Installs one structural slot reaction through the ordinary mounted-child operations. */
export function bindProgramChild(
	mounted: Mounted,
	index: number,
	initialBinding: boolean,
	stopBindings: OwnedRetainedWatch[]
): boolean {
	const applyChildren = prepareProgramChildBinding(mounted, index, initialBinding);
	if (!applyChildren) return false;
	const watcher = watchRetained(applyChildren, undefined, { scope: mounted.scope, owned: true });
	if (watcher) stopBindings.push(watcher);
	return true;
}

/** Refreshes every compiler-owned list lane in one component render transaction. */
export function bindProgramLists(
	mounted: Mounted,
	indexes: readonly number[],
	initialBinding: boolean,
	stopBindings: OwnedRetainedWatch[]
): boolean {
	const apply = indexes.map((index) => prepareProgramChildBinding(mounted, index, initialBinding));
	if (apply.some((binding) => !binding)) return false;
	const refresh = () => {
		const owner = mounted.renderProgram!.parentInstance;
		owner?.beginRender();
		try {
			for (const binding of apply) binding!();
		} finally {
			owner?.endRender();
		}
	};
	const watcher = watchRetained(refresh, undefined, { scope: mounted.scope, owned: true });
	if (watcher) stopBindings.push(watcher);
	return true;
}

function prepareProgramChildBinding(
	mounted: Mounted,
	index: number,
	initialBinding: boolean
): (() => void) | undefined {
	const state = mounted.renderProgram!;
	const start = state.slotNodes[index];
	const slot = state.invocation.program.slots[index];
	const identity = slot?.[0] === 'child' || slot?.[0] === 'component' ? slot[1] : undefined;
	const end = findProgramChildEnd(start, identity);
	if (!(start instanceof Comment) || !end || !start.parentNode) return undefined;
	const childSlots = (state.childSlots ??= []);
	let childState = childSlots.find((candidate) => candidate.slot === index);
	if (!childState) {
		childState = { slot: index, end, children: [] };
		childSlots.push(childState);
	}
	return () => {
		const next = withEffectScope(mounted.scope, () =>
			readProgramChildren(state.invocation, index, state.parentInstance)
		);
		peek(() => {
			const component = slot?.[0] === 'component' ? soleVNode(next) : undefined;
			if (
				component
					? Object.is(childState.componentValue, component)
					: sameProgramChildren(childState.value, next)
			)
				return;
			const parent = start.parentNode;
			if (!parent) return;
			if (component && childState.children.length === 1) {
				childState.children[0] = patchSingleChild(
					state.root,
					parent,
					childState.children[0]!,
					component,
					state.parentInstance,
					mounted.scope,
					mounted
				);
			} else if (component && initialBinding && childState.children.length === 0) {
				const child = mountDetachedChild(
					state.root,
					component,
					state.parentInstance,
					mounted.scope,
					parent
				);
				placeMountedBefore(state.root, parent, child, end);
				childState.children.push(child);
			} else if (initialBinding && childState.children.length === 0) {
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
			if (component) {
				childState.componentValue = component;
				childState.value = undefined;
			} else {
				childState.componentValue = undefined;
				childState.value = next;
			}
			refreshMountedChildren(mounted);
		});
	};
}

function soleVNode(children: readonly Child[]): VNode | undefined {
	return children.length === 1 && isVNode(children[0]) ? (children[0] as VNode) : undefined;
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
	const children = readDynamicChildren(
		() => readRenderProgramSlot(invocation, index),
		parentInstance,
		'compiled-child-slot'
	);
	const owned: Child[] = [];
	for (const child of children) {
		const vnode = isVNode(child) ? (child as VNode) : undefined;
		const list = vnode ? getListBinding(vnode) : undefined;
		if (list) {
			// The compiler-owned lane replaces the Fragment's generic list watcher. Observe the
			// collection reference here so in-place reactive mutations schedule this grouped lane.
			const collection = list.source?.get() ?? list.collection;
			for (const _item of collection) {
				// Iteration records the collection's structural dependency without allocating a copy.
			}
			owned.push({
				...vnode!,
				props: { ...vnode!.props, __exactProgramList: true }
			});
		} else owned.push(child);
	}
	return owned;
}

function sameProgramChildren(
	previous: readonly Child[] | undefined,
	next: readonly Child[]
): boolean {
	if (!previous || previous.length !== next.length) return false;
	return next.every((value, index) => Object.is(value, previous[index]));
}

function refreshMountedChildren(mounted: Mounted): void {
	mounted.children.length = 0;
	for (const slot of mounted.renderProgram!.childSlots ?? [])
		mounted.children.push(...slot.children);
}
