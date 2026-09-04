import type { AnyComponentInstance, Child } from '@exactjs/core';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import type { ExactRenderProgramInvocation } from '@exactjs/core/runtime/render-operations';
import { type OwnedRetainedWatch, watchRetained } from '@exactjs/reactive/framework/watch';
import { peek, withEffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, RenderProgramChildAnchor } from '../types.js';
import { patchChildren } from './patching/children.js';
import { readCompiledDynamicChildren } from './dynamic-children.js';
import { findProgramChildEnd } from './render-program-markers.js';
import { prepareForeignProgramChildren } from './foreign-child-capability.js';

/** Installs one structural slot reaction through the ordinary mounted-child operations. */
export function bindProgramChild(
	mounted: Mounted,
	index: number,
	initialBinding: boolean,
	stopBindings: OwnedRetainedWatch[],
	direct = false
): boolean {
	const applyChildren = prepareProgramChildBinding(mounted, index, initialBinding);
	if (!applyChildren) return false;
	if (direct) {
		(mounted.renderProgram!.directChildUpdates ??= [])[index] = applyChildren;
		applyChildren();
		return true;
	}
	const watcher = watchRetained(applyChildren, undefined, { scope: mounted.scope, owned: true });
	if (watcher) stopBindings.push(watcher);
	return true;
}

/** Applies one compiler-selected structural slot without a retained dependency watcher. */
export function applyProgramChild(mounted: Mounted, index: number): boolean {
	const apply = mounted.renderProgram?.directChildUpdates?.[index];
	if (!apply) return false;
	apply();
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

/** Installs one compiler-keyed array lane without constructing a Fragment/ListBinding wrapper. */
export function bindProgramKeyedChild(
	mounted: Mounted,
	index: number,
	initialBinding: boolean,
	stopBindings: OwnedRetainedWatch[]
): boolean {
	const apply = prepareProgramChildBinding(
		mounted,
		index,
		initialBinding,
		readDirectProgramChildren
	);
	if (!apply) return false;
	const owner = mounted.renderProgram!.parentInstance;
	const refresh = () => {
		owner?.beginRender();
		try {
			apply();
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
	initialBinding: boolean,
	read: typeof readProgramChildren = readProgramChildren
): (() => void) | undefined {
	const state = mounted.renderProgram!;
	let childState = state.childSlots?.[index];
	const start = state.slotNodes[index];
	const identity = structuralProgramSlotIdentity(state, index);
	const componentSlot =
		identity !== undefined && programComponentSlotIncludes(state.componentSlots, index);
	const anchor = isKeyedChildAnchor(start) ? start : undefined;
	const marker = start instanceof Node ? start : undefined;
	const end = childState
		? childState.before
		: anchor
			? undefined
			: findProgramChildEnd(marker, identity);
	const parent = childState?.parent ?? anchor?.[0] ?? marker?.parentNode;
	const before = childState ? childState.before : anchor ? null : end;
	if (!parent || (!anchor && (!(marker instanceof Comment) || !end))) return undefined;
	if (!childState) {
		childState = { parent, before: before ?? null, children: [] };
		(state.childSlots ??= [])[index] = childState;
	}
	let skipAdoptedInitialPatch = initialBinding && childState.children.length !== 0;
	return () => {
		const next = withEffectScope(mounted.scope, () =>
			read(state.invocation, index, state.parentInstance)
		);
		if (skipAdoptedInitialPatch) {
			skipAdoptedInitialPatch = false;
			return;
		}
		peek(() => {
			const component = componentSlot ? soleComponentReceipt(next) : undefined;
			if (
				component
					? Object.is(childState.componentValue, component)
					: sameProgramChildren(childState.value, next)
			)
				return;
			const parent = childState.parent;
			const before = childState.before;
			childState.children = patchChildren(
				state.root,
				parent,
				childState.children,
				next,
				state.parentInstance,
				mounted.scope,
				before,
				mounted
			);
			if (component) {
				childState.componentValue = component;
				childState.value = undefined;
			} else {
				childState.componentValue = undefined;
				childState.value = next;
			}
			refreshProgramMountedChildren(mounted);
		});
	};
}

/** Resolves one compiler-indexed structural slot's bounded marker identity without allocating. */
export function structuralProgramSlotIdentity(
	state: NonNullable<Mounted['renderProgram']>,
	index: number
): string | undefined {
	const marker = state.slotNodes[index];
	if (isKeyedChildAnchor(marker)) return '';
	if (!(marker instanceof Comment) || !marker.data.startsWith('x:')) return undefined;
	return marker.data.slice('x:'.length);
}

/** Narrows the renderer's tuple anchor used by compiler-keyed child slots. */
export function isKeyedChildAnchor(
	value: Node | RenderProgramChildAnchor | undefined
): value is RenderProgramChildAnchor {
	return Array.isArray(value);
}

/** Tests whether a compiler-indexed structural slot owns a component operation. */
export function programComponentSlotIncludes(
	slots: number | ReadonlySet<number> | undefined,
	index: number
): boolean {
	return typeof slots === 'number'
		? index < 31 && (slots & (1 << index)) !== 0
		: slots?.has(index) === true;
}

function soleComponentReceipt(
	children: readonly Child[]
): ReturnType<typeof readCompiledComponentReceipt> {
	return children.length === 1 ? readCompiledComponentReceipt(children[0]) : undefined;
}

/** Resolves a general structural slot and admits only explicitly installed foreign children. */
export function readProgramChildren(
	invocation: ExactRenderProgramInvocation,
	index: number,
	parentInstance: AnyComponentInstance | undefined
): Child[] {
	return prepareForeignProgramChildren(
		readCompiledDynamicChildren(invocation, index, parentInstance, 'compiled-child-slot')
	);
}

/** Resolves a compiler-keyed structural slot without the foreign-child compatibility boundary. */
export function readDirectProgramChildren(
	invocation: ExactRenderProgramInvocation,
	index: number,
	parentInstance: AnyComponentInstance | undefined
): Child[] {
	return readCompiledDynamicChildren(
		invocation,
		index,
		parentInstance,
		'compiled-keyed-child-slot'
	);
}

/** Tests a compact or widened compiler-owned keyed-child slot set. */
export function programKeyedChildIncludes(
	slots: number | readonly number[] | undefined,
	index: number
): boolean {
	return typeof slots === 'number'
		? index < 31 && (slots & (1 << index)) !== 0
		: slots?.includes(index) === true;
}

function sameProgramChildren(
	previous: readonly Child[] | undefined,
	next: readonly Child[]
): boolean {
	if (!previous || previous.length !== next.length) return false;
	return next.every((value, index) => Object.is(value, previous[index]));
}

/** Rebuilds the flattened mounted-child view after one render-program slot changes. */
export function refreshProgramMountedChildren(mounted: Mounted): void {
	mounted.children.length = 0;
	for (const slot of mounted.renderProgram!.childSlots ?? []) {
		if (slot) mounted.children.push(...slot.children);
	}
}
