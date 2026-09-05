import type { AnyComponentInstance } from '@exactjs/core';
import {
	readRenderProgram,
	readRenderProgramReceipt,
	type ExactDirectRenderProgram,
	type ExactRenderProgram
} from '@exactjs/core/runtime/render-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { countDomWork } from './limits.js';
import { bindRenderProgram } from './render-program-bindings.js';
import { claimCompiledRenderProgram } from './render-program-claims.js';
import {
	releaseDirectProgramNodeOwners,
	ownDirectProgramNodes
} from './render-program-slot-claims.js';
import { materializeProgramTemplate } from './render-program-template.js';

/** Mounts one compiler-specialized browser program. */
export function mountRenderProgram(
	root: Root,
	value: unknown,
	scope: EffectScope,
	parentInstance?: AnyComponentInstance,
	parentNode?: Node
): Mounted | undefined {
	const invocation = readRenderProgram(value);
	if (!invocation) return undefined;
	const bindingOwner = (invocation.owner as AnyComponentInstance | undefined) ?? parentInstance;
	const program = directProgram(invocation.program);
	const fragment = materializeProgramTemplate(
		program,
		root.container.ownerDocument,
		parentNode ?? root.container
	);
	if (!fragment.firstChild || fragment.firstChild !== fragment.lastChild) return undefined;
	const dom = fragment.firstChild!;
	if (!(dom instanceof Element)) return undefined;
	const direct = claimCompiledRenderProgram(program, dom, 'template');
	if (!direct) return undefined;
	const receipt = readRenderProgramReceipt(value);
	if (!receipt) return undefined;
	const mounted: Mounted = {
		renderProgramReceipt: receipt,
		dom,
		scope,
		children: [],
		renderProgram: {
			invocation,
			programRoot: dom,
			slotNodes: direct.slotNodes,
			...(direct.componentSlots ? { componentSlots: direct.componentSlots } : {}),
			root,
			bindingOwner,
			parentInstance
		}
	};
	if (bindingOwner) ownDirectProgramNodes(direct.elements, bindingOwner);
	if (renderProgramHasBindings(program) && !bindRenderProgram(mounted)) {
		releaseDirectProgramNodeOwners(direct.elements);
		return undefined;
	}
	countProgramWork(root, direct.work, false);
	return mounted;
}

/** Reports whether a direct program owns any invocation-local client bindings. */
export function renderProgramHasBindings(program: ExactDirectRenderProgram): boolean {
	return program.wire
		? program.wire[2].length !== 0
		: Boolean((program as unknown as { bind?: (target: object) => void }).bind);
}

/** Rebinds invocation-local readers when a component publishes the same program again. */
export function patchRenderProgram(mounted: Mounted, value: unknown): boolean {
	const invocation = readRenderProgram(value);
	if (
		!invocation ||
		!mounted.renderProgram ||
		mounted.renderProgram.invocation.program.id !== invocation.program.id
	)
		return false;
	const receipt = readRenderProgramReceipt(value);
	if (!receipt) return false;
	mounted.renderProgramReceipt = receipt;
	mounted.renderProgram.invocation = invocation;
	mounted.renderProgram.refresh?.();
	return true;
}

/** Charges compiler-proven program work without walking its static DOM. */
export function countProgramWork(
	root: Root,
	work: readonly [nodes: number, slots: number],
	includeRoot: boolean
): void {
	const [nodes, slots] = work;
	for (let index = includeRoot ? 0 : 1; index < nodes; index++) countDomWork(root);
	if (!includeRoot) for (let index = 0; index < slots; index++) countDomWork(root);
}

/** Requires the compiler-closed browser claim contract. */
export function directProgram(program: ExactRenderProgram): ExactDirectRenderProgram {
	if (!program.directClaims)
		throw new TypeError('Browser rendering requires a compiler-specialized client program');
	return program;
}
