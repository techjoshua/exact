import type { AnyComponentInstance, Child } from '@exactjs/core';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { readRenderProgramSlot } from '@exactjs/core/runtime/render-operations';
import { withEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../types.js';
import { adoptComponentReceipt } from './adoption/component-receipt.js';
import {
	isKeyedChildAnchor,
	programComponentSlotIncludes,
	programKeyedChildIncludes,
	readDirectProgramChildren,
	readProgramChildren,
	refreshProgramMountedChildren,
	structuralProgramSlotIdentity
} from './render-program-children.js';
import { findProgramChildEnd } from './render-program-markers.js';

/** Adopts every compiler-owned variable-width child range inside one program. */
export function adoptProgramChildSlots(
	mounted: Mounted,
	parentInstance: AnyComponentInstance | undefined,
	adoptChildren: (
		children: readonly Child[],
		nodes: readonly Node[],
		parentInstance: AnyComponentInstance | undefined,
		scope: EffectScope,
		cursor: number,
		end: number,
		compilerOwnedComponent?: boolean
	) => Mounted[] | undefined
): boolean {
	const state = mounted.renderProgram!;
	const ownsLists =
		state.invocation.program.listBindings === true ||
		state.invocation.program.keyedChildren !== undefined;
	if (ownsLists) parentInstance?.beginRender();
	try {
		for (let index = 0; index < state.slotNodes.length; index++) {
			const identity = structuralProgramSlotIdentity(state, index);
			if (identity === undefined) continue;
			const componentSlot = programComponentSlotIncludes(state.componentSlots, index);
			const start = state.slotNodes[index];
			const anchor = isKeyedChildAnchor(start) ? start : undefined;
			const marker = start instanceof Node ? start : undefined;
			const end = anchor ? undefined : findProgramChildEnd(marker, identity);
			const parent = anchor?.[0] ?? marker?.parentNode;
			if (!parent || (!anchor && (!(marker instanceof Comment) || !end))) return false;
			const nodes = Array.from(parent.childNodes, (node): Node => node);
			const cursor = anchor
				? anchor[1]
					? nodes.indexOf(anchor[1])
					: nodes.length
				: nodes.indexOf(marker!) + 1;
			const anchorEnd = anchor?.[2] ?? null;
			const endIndex = anchorEnd
				? nodes.indexOf(anchorEnd)
				: anchor
					? nodes.length
					: nodes.indexOf(end!);
			if (cursor < 0 || endIndex < cursor) return false;
			const componentReceipt = componentSlot
				? readCompiledComponentReceipt(
						withEffectScope(mounted.scope, () => readRenderProgramSlot(state.invocation, index))
					)
				: undefined;
			const value = componentReceipt
				? []
				: withEffectScope(mounted.scope, () =>
						programKeyedChildIncludes(state.invocation.program.keyedChildren, index)
							? readDirectProgramChildren(state.invocation, index, parentInstance)
							: readProgramChildren(state.invocation, index, parentInstance)
					);
			const receiptAdoption = componentReceipt
				? adoptComponentReceipt(
						state.root,
						componentReceipt,
						nodes,
						cursor,
						parentInstance,
						mounted.scope,
						endIndex,
						true
					)
				: undefined;
			const children = componentReceipt
				? receiptAdoption
					? [receiptAdoption.mounted]
					: undefined
				: adoptChildren(value, nodes, parentInstance, mounted.scope, cursor, endIndex, false);
			if (!children) return false;
			(state.childSlots ??= [])[index] = {
				parent,
				before: anchor ? anchorEnd : end!,
				children,
				...(componentReceipt ? { componentValue: componentReceipt } : { value })
			};
		}
	} finally {
		if (ownsLists) parentInstance?.endRender();
	}
	refreshProgramMountedChildren(mounted);
	return true;
}
