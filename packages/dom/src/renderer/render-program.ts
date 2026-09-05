import { type AnyComponentInstance, type Child } from '@exactjs/core';
import {
	readRenderProgram,
	readRenderProgramReceipt
} from '@exactjs/core/runtime/render-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { adoptProgramChildSlots } from './render-program-adoption.js';
import { markedProgramRange } from './render-program-hydration.js';
import { bindRenderProgram } from './render-program-bindings.js';
import { claimCompiledRenderProgram } from './render-program-claims.js';
import {
	ownDirectProgramNodes,
	releaseDirectProgramNodeOwners
} from './render-program-slot-claims.js';
import {
	countProgramWork,
	directProgram,
	renderProgramHasBindings
} from './render-program-operation.js';
import { beginDomProfile, finishDomProfile } from './profiling.js';

/** Adopts an existing markerless program root with one bounded path cursor. */
export function adoptRenderProgram(
	root: Root,
	value: unknown,
	dom: Node,
	scope: EffectScope,
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
): Mounted | undefined {
	const invocation = readRenderProgram(value);
	if (!invocation) return undefined;
	const bindingOwner = (invocation.owner as AnyComponentInstance | undefined) ?? parentInstance;
	const program = directProgram(invocation.program);
	if (!(dom instanceof Element)) return undefined;
	const claimStarted = beginDomProfile(root);
	const direct = claimCompiledRenderProgram(program, dom, 'ssr');
	finishDomProfile(root, 'program-claim', claimStarted);
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
	const childrenStarted = beginDomProfile(root);
	const adoptedChildren = adoptProgramChildSlots(mounted, parentInstance, adoptChildren);
	finishDomProfile(root, 'program-children', childrenStarted);
	if (!adoptedChildren) return undefined;
	ownDirectProgramNodes(direct.elements, bindingOwner);
	const bindingStarted = beginDomProfile(root);
	const bound = !renderProgramHasBindings(program) || bindRenderProgram(mounted);
	finishDomProfile(root, 'program-bind', bindingStarted);
	if (!bound) {
		releaseDirectProgramNodeOwners(direct.elements);
		return undefined;
	}
	countProgramWork(root, direct.work, true);
	return mounted;
}

/** Adopts a compiler-specialized program or asks the hydration root to recover. */
export function adoptCompiledRenderProgram(
	root: Root,
	value: unknown,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	scope: EffectScope,
	end: number,
	adoptChildren: (
		children: readonly Child[],
		nodes: readonly Node[],
		parentInstance: AnyComponentInstance | undefined,
		scope: EffectScope,
		cursor: number,
		end: number,
		compilerOwnedComponent?: boolean
	) => Mounted[] | undefined
): { mounted: Mounted; next: number } | undefined {
	const marked = adoptMarkedRenderProgram(
		root,
		value,
		nodes,
		cursor,
		end,
		scope,
		parentInstance,
		adoptChildren
	);
	if (marked) return marked;
	const adopted = nodes[cursor]
		? adoptRenderProgram(root, value, nodes[cursor]!, scope, parentInstance, adoptChildren)
		: undefined;
	if (adopted) return { mounted: adopted, next: cursor + 1 };
	scope.stop();
	// Same-build hydration failures recover at the owning root. A production component does not
	// carry a second runtime topology for region-local recovery.
	return undefined;
}

/** Adopts compiler-addressed program nodes inside the marker ranges required by generic SSR. */
function adoptMarkedRenderProgram(
	root: Root,
	value: unknown,
	nodes: readonly Node[],
	cursor: number,
	end: number,
	scope: EffectScope,
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
): { mounted: Mounted; next: number } | undefined {
	const invocation = readRenderProgram(value);
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
	const claimStarted = beginDomProfile(root);
	const direct = claimCompiledRenderProgram(program, programRoot, 'ssr');
	finishDomProfile(root, 'program-claim', claimStarted);
	if (!direct) return undefined;
	const receipt = readRenderProgramReceipt(value);
	if (!receipt) return undefined;
	const mounted: Mounted = {
		renderProgramReceipt: receipt,
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
	const childrenStarted = beginDomProfile(root);
	const adoptedChildren = adoptProgramChildSlots(mounted, parentInstance, adoptChildren);
	finishDomProfile(root, 'program-children', childrenStarted);
	if (!adoptedChildren) return undefined;
	// Compiler-generated claims deliberately omit inert static intrinsics. They remain owned by
	// the enclosing DOM range and need no per-element bookkeeping of their own.
	ownDirectProgramNodes(direct.elements, parentInstance);
	countProgramWork(root, direct.work, true);
	const bindingStarted = beginDomProfile(root);
	const bound = !renderProgramHasBindings(program) || bindRenderProgram(mounted);
	finishDomProfile(root, 'program-bind', bindingStarted);
	if (!bound) {
		releaseDirectProgramNodeOwners(direct.elements);
		return undefined;
	}
	return { mounted, next: range.start ? range.endIndex + 1 : range.endIndex };
}
