import { type AnyComponentInstance, type Child, type VNode } from '@exactjs/core';
import {
	readRenderProgram,
	type ExactDirectRenderProgram,
	type ExactRenderProgram
} from '@exactjs/core/runtime/render';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { countDomWork } from './limits.js';
import { materializeProgramTemplate } from './render-program-template.js';
import { adoptProgramChildSlots } from './render-program-children.js';
import { markedProgramRange } from './render-program-hydration.js';
import { bindRenderProgram } from './render-program-bindings.js';
import { claimCompiledRenderProgram } from './render-program-claims.js';
import { ownDirectProgramNodes, releaseDirectProgramNodeOwners } from './render-program-slot-claims.js';

/** Mounts one compiler-specialized browser program. */
export function mountRenderProgram(
	root: Root,
	vnode: VNode,
	scope: EffectScope,
	parentInstance?: AnyComponentInstance
): Mounted | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) return undefined;
	const bindingOwner = (invocation.owner as AnyComponentInstance | undefined) ?? parentInstance;
	const program = directProgram(invocation.program);
	const fragment = materializeProgramTemplate(program, root.container.ownerDocument);
	if (!fragment.firstChild || fragment.firstChild !== fragment.lastChild) return undefined;
	const dom = fragment.firstChild!;
	if (!(dom instanceof Element)) return undefined;
	const direct = claimCompiledRenderProgram(program, dom, 'template');
	if (!direct) return undefined;
	const mounted: Mounted = {
		vnode,
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
	if (bindingOwner) {
		ownDirectProgramNodes(direct.elements, bindingOwner);
	}
	if (program.bind && !bindRenderProgram(mounted)) {
		releaseDirectProgramNodeOwners(direct.elements);
		return undefined;
	}
	countProgramWork(root, direct.work, false);
	return mounted;
}

/** Adopts an existing markerless program root with one bounded path cursor. */
export function adoptRenderProgram(
	root: Root,
	vnode: VNode,
	dom: Node,
	scope: EffectScope,
	parentInstance: AnyComponentInstance,
	adoptChildren: (
		children: readonly Child[],
		nodes: readonly Node[],
		parentInstance: AnyComponentInstance,
		scope: EffectScope,
		cursor: number,
		end: number,
		compilerOwnedComponent?: boolean
	) => Mounted[] | undefined
): Mounted | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) return undefined;
	const bindingOwner = (invocation.owner as AnyComponentInstance | undefined) ?? parentInstance;
	const program = directProgram(invocation.program);
	if (!(dom instanceof Element)) return undefined;
	const direct = claimCompiledRenderProgram(program, dom, 'ssr');
	if (!direct) return undefined;
	const mounted: Mounted = {
		vnode,
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
	if (!adoptProgramChildSlots(mounted, parentInstance, adoptChildren)) return undefined;
	ownDirectProgramNodes(direct.elements, bindingOwner);
	if (program.bind && !bindRenderProgram(mounted)) {
		releaseDirectProgramNodeOwners(direct.elements);
		return undefined;
	}
	countProgramWork(root, direct.work, true);
	return mounted;
}

/** Adopts a compiler-specialized program or asks the hydration root to recover. */
export function adoptCompiledRenderProgram(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance,
	scope: EffectScope,
	end: number,
	adoptChildren: (
		children: readonly Child[],
		nodes: readonly Node[],
		parentInstance: AnyComponentInstance,
		scope: EffectScope,
		cursor: number,
		end: number,
		compilerOwnedComponent?: boolean
	) => Mounted[] | undefined
): { mounted: Mounted; next: number } | undefined {
	const marked = adoptMarkedRenderProgram(
		root,
		vnode,
		nodes,
		cursor,
		end,
		scope,
		parentInstance,
		adoptChildren
	);
	if (marked) return marked;
	const adopted = nodes[cursor]
		? adoptRenderProgram(root, vnode, nodes[cursor]!, scope, parentInstance, adoptChildren)
		: undefined;
	if (adopted) return { mounted: adopted, next: cursor + 1 };
	scope.stop();
	// Same-build hydration failures recover at the owning root. A production component does not
	// carry a second VNode topology for region-local recovery.
	return undefined;
}

/** Adopts compiler-addressed program nodes inside the marker ranges required by generic SSR. */
function adoptMarkedRenderProgram(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	end: number,
	scope: EffectScope,
	parentInstance: AnyComponentInstance,
	adoptChildren: (
		children: readonly Child[],
		nodes: readonly Node[],
		parentInstance: AnyComponentInstance,
		scope: EffectScope,
		cursor: number,
		end: number,
		compilerOwnedComponent?: boolean
	) => Mounted[] | undefined
): { mounted: Mounted; next: number } | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) return undefined;
	const program = directProgram(invocation.program);
	const range = markedProgramRange(nodes, cursor, end);
	if (!range) return undefined;
	let programRoot: Element | undefined;
	for (let index = range.contentStart; index < range.endIndex; index++) {
		const node = nodes[index];
		if (node instanceof Element) {
			programRoot = node;
			break;
		}
	}
	if (!programRoot) return undefined;
	const direct = claimCompiledRenderProgram(program, programRoot, 'ssr');
	if (!direct) return undefined;
	const mounted: Mounted = {
		vnode,
		dom: range.start ?? programRoot,
		...(range.start ? { end: nodes[range.endIndex]! } : {}),
		...(range.start ? { rawNodes: [programRoot] } : {}),
		scope,
		children: [],
		renderProgram: {
			invocation,
			programRoot,
			slotNodes: direct.slotNodes,
			...(direct.componentSlots ? { componentSlots: direct.componentSlots } : {}),
			root,
			parentInstance
		}
	};
	if (!adoptProgramChildSlots(mounted, parentInstance, adoptChildren)) return undefined;
	// Compiler-generated claims deliberately omit inert static intrinsics. They remain owned by
	// the enclosing DOM range and need no per-element bookkeeping of their own.
	ownDirectProgramNodes(direct.elements, parentInstance);
	countProgramWork(root, direct.work, true);
	if (program.bind && !bindRenderProgram(mounted)) {
		releaseDirectProgramNodeOwners(direct.elements);
		return undefined;
	}
	return { mounted, next: range.start ? range.endIndex + 1 : range.endIndex };
}

/** Rebinds invocation-local readers when a component publishes the same program again. */
export function patchRenderProgram(mounted: Mounted, vnode: VNode): boolean {
	const invocation = readRenderProgram(vnode);
	if (
		!invocation ||
		!mounted.renderProgram ||
		mounted.renderProgram.invocation.program.id !== invocation.program.id
	)
		return false;
	mounted.vnode = vnode;
	mounted.renderProgram.invocation = invocation;
	mounted.renderProgram.refresh?.();
	return true;
}

function countProgramWork(
	root: Root,
	work: readonly [nodes: number, slots: number],
	includeRoot: boolean
): void {
	const [nodes, slots] = work;
	for (let index = includeRoot ? 0 : 1; index < nodes; index++) countDomWork(root);
	if (!includeRoot) for (let index = 0; index < slots; index++) countDomWork(root);
}

function directProgram(program: ExactRenderProgram): ExactDirectRenderProgram {
	if (!program.directClaims)
		throw new TypeError('Browser rendering requires a compiler-specialized client program');
	return program;
}
