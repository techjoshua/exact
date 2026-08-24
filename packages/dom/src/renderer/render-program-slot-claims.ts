import { type AnyComponentInstance } from '@exactjs/core';
import {
	type ExactRenderProgramInvocation,
	type ExactTableRenderProgram
} from '@exactjs/core/runtime/render';
import { clearElementOwner, clearNodeOwner, setElementOwner, setNodeOwner } from '../ownership.js';
import type { RenderProgramChildAnchor } from '../types.js';
import {
	claimProgramChildSlot,
	claimProgramTextSlot,
	programElement,
	programNodeAtPath,
	type ProgramHydrationIndex
} from './render-program-hydration.js';

const elementNode = 1;
const textNode = 3;

/** Resolves table-driven slot locations after mounting a compiler template. */
export function claimGenericMountSlots(
	program: ExactTableRenderProgram,
	root: Element,
	index: ProgramHydrationIndex
): readonly (Node | undefined)[] {
	return program.slots.map((slot) => {
		if (slot[0] === 'text') return programNodeAtPath(root, slot[2]);
		if (slot[0] === 'child' || slot[0] === 'component')
			return claimProgramChildSlot(index, slot[1]);
		const owner = program.nodes[slot[1]];
		return owner ? programElement(index, owner[0]) : undefined;
	});
}

/** Resolves table-driven slot locations while adopting server-rendered DOM. */
export function claimGenericHydrationSlots(
	program: ExactTableRenderProgram,
	root: Element,
	index: ProgramHydrationIndex
): readonly (Node | undefined)[] {
	return program.slots.map((slot) => {
		if (slot[0] === 'text') return claimProgramTextSlot(root, index, slot[1]);
		if (slot[0] === 'child' || slot[0] === 'component')
			return claimProgramChildSlot(index, slot[1]);
		const owner = program.nodes[slot[1]];
		return owner ? programElement(index, owner[0]) : undefined;
	});
}

/** Releases ownership installed for direct compiler claims after an atomic binding failure. */
export function releaseDirectProgramNodeOwners(
	elements: readonly (Element | undefined)[] | undefined
): void {
	if (!elements) return;
	for (const element of elements) {
		if (!element) continue;
		clearNodeOwner(element);
		clearElementOwner(element);
	}
}

/** Assigns direct compiler-claimed elements to their durable component instance. */
export function ownDirectProgramNodes(
	elements: readonly (Element | undefined)[] | undefined,
	owner: AnyComponentInstance
): void {
	if (!elements) return;
	for (const element of elements) {
		if (!element) continue;
		setNodeOwner(element, owner);
		setElementOwner(element, owner);
	}
}

/** Validates that every claimed slot has the node kind declared by the compiled program. */
export function validRenderProgramSlotNodes(
	invocation: ExactRenderProgramInvocation,
	nodes: readonly (Node | RenderProgramChildAnchor | undefined)[]
): boolean {
	return nodes.every((node, index) => {
		if (!(node instanceof Node)) return false;
		const kind = invocation.program.slots?.[index]?.[0];
		return kind === 'text'
			? node.nodeType === textNode
			: kind === 'child' || kind === 'component'
				? node instanceof Comment
				: node.nodeType === elementNode;
	});
}
