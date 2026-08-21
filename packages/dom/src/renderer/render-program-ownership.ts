import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactRenderProgram } from '@exactjs/core/runtime/render';
import { clearElementOwner, clearNodeOwner, setElementOwner, setNodeOwner } from '../ownership.js';
import type { ProgramHydrationIndex } from './render-program-hydration.js';

const elementNode = 1;

/** Assigns every compiler-addressed element to its durable component instance. */
export function ownProgramNodes(
	program: ExactRenderProgram,
	index: ProgramHydrationIndex,
	owner: AnyComponentInstance
): void {
	for (const planned of program.nodes) {
		const node = index.elements.get(planned[0]);
		if (!node) continue;
		setNodeOwner(node, owner);
		if (node.nodeType === elementNode) setElementOwner(node as Element, owner);
	}
}

/** Releases ownership when a program cannot complete its binding contract. */
export function releaseProgramNodeOwners(
	program: ExactRenderProgram,
	index: ProgramHydrationIndex
): void {
	for (const planned of program.nodes) {
		const node = index.elements.get(planned[0]);
		if (!node) continue;
		clearNodeOwner(node);
		if (node.nodeType === elementNode) clearElementOwner(node as Element);
	}
}
