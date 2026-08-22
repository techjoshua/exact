import { type AnyComponentInstance, type Child, type VNode } from '@exactjs/core';
import {
	readRenderProgram,
	renderProgramFallback,
	type ExactRenderProgram,
	type ExactDomRenderProgram,
	type ExactRenderProgramInvocation,
	type ExactTableRenderProgram
} from '@exactjs/core/runtime/render';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import { clearElementOwner, clearNodeOwner, setElementOwner, setNodeOwner } from '../ownership.js';
import type { Mounted, Root } from '../types.js';
import { countDomWork } from './limits.js';
import { materializeProgramTemplate } from './render-program-template.js';
import { adoptProgramChildSlots } from './render-program-children.js';
import {
	claimProgramChildSlot,
	claimProgramTextSlot,
	indexProgramHydration,
	markedProgramRange,
	matchesProgramIdentity,
	programElement,
	programNodeAtPath,
	type ProgramHydrationIndex
} from './render-program-hydration.js';
import { ownProgramNodes, releaseProgramNodeOwners } from './render-program-ownership.js';
import { bindRenderProgram } from './render-program-bindings.js';
import { claimCompiledRenderProgram } from './render-program-claims.js';

const elementNode = 1;
const textNode = 3;

/** Mounts a branded program, or reports that its generic region fallback is required. */
export function mountRenderProgram(
	root: Root,
	vnode: VNode,
	scope: EffectScope,
	parentInstance?: AnyComponentInstance
): Mounted | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) return undefined;
	// A browser renderer can receive only client or complete compiler artifacts. Server-only
	// descriptors are excluded by artifact partitioning and cannot be authored through the brand.
	const program = invocation.program as ExactDomRenderProgram;
	const fragment = materializeProgramTemplate(program, root.container.ownerDocument);
	if (!fragment.firstChild || fragment.firstChild !== fragment.lastChild) return undefined;
	const dom = fragment.firstChild!;
	if (!(dom instanceof Element)) return undefined;
	const direct = claimCompiledRenderProgram(program, dom, 'template');
	if (program.directClaims && !direct) return undefined;
	const table = tableProgram(invocation);
	const programIndex = direct ? undefined : indexProgramHydration(dom);
	const slotNodes = direct?.slotNodes ?? claimGenericMountSlots(table!, dom, programIndex!);
	if (!direct && !validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom,
		scope,
		children: [],
		renderProgram: {
			invocation,
			programRoot: dom,
			slotNodes,
			...(direct?.componentSlots ? { componentSlots: direct.componentSlots } : {}),
			root,
			parentInstance
		}
	};
	if (parentInstance) {
		if (programIndex) ownProgramNodes(table!, programIndex, parentInstance);
		else ownDirectProgramNodes(direct?.elements, parentInstance);
	}
	if ((program.bind || program.bindings?.length) && !bindRenderProgram(mounted)) {
		if (programIndex) releaseProgramNodeOwners(table!, programIndex);
		else releaseDirectProgramNodeOwners(direct?.elements);
		return undefined;
	}
	countProgramWork(root, program, direct, false);
	return mounted;
}

/** Adopts an existing markerless program root with one bounded path cursor. */
export function adoptRenderProgram(
	root: Root,
	vnode: VNode,
	dom: Node,
	scope: EffectScope,
	parentInstance: AnyComponentInstance
): Mounted | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) return undefined;
	const program = invocation.program as ExactDomRenderProgram;
	if (!(dom instanceof Element)) return undefined;
	const direct = claimCompiledRenderProgram(program, dom, 'ssr');
	if (program.directClaims && !direct) return undefined;
	const table = tableProgram(invocation);
	const rootPlan = table?.nodes[0];
	if (
		!direct &&
		(!rootPlan ||
			!matchesProgramElement(dom, rootPlan[0], rootPlan[1], rootPlan[2] ?? table!.namespace))
	)
		return undefined;
	const programIndex = direct ? undefined : indexProgramHydration(dom);
	if (programIndex && !validateGenericProgramNodes(table!, programIndex)) return undefined;
	const slotNodes = direct?.slotNodes ?? claimGenericMountSlots(table!, dom, programIndex!);
	if (!direct && !validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom,
		scope,
		children: [],
		renderProgram: {
			invocation,
			programRoot: dom,
			slotNodes,
			...(direct?.componentSlots ? { componentSlots: direct.componentSlots } : {}),
			root,
			parentInstance
		}
	};
	if (programIndex) ownProgramNodes(table!, programIndex, parentInstance);
	else ownDirectProgramNodes(direct?.elements, parentInstance);
	if ((program.bind || program.bindings?.length) && !bindRenderProgram(mounted)) {
		if (programIndex) releaseProgramNodeOwners(table!, programIndex);
		else releaseDirectProgramNodeOwners(direct?.elements);
		return undefined;
	}
	countProgramWork(root, program, direct, true);
	return mounted;
}

function matchesProgramElement(
	node: Node | undefined,
	id: string | number,
	tag: string | undefined,
	namespace: ExactRenderProgram['namespace']
): boolean {
	if (node?.nodeType !== elementNode || !tag) return false;
	const element = node as Element;
	const uri =
		namespace === 'svg'
			? 'http://www.w3.org/2000/svg'
			: namespace === 'mathml'
				? 'http://www.w3.org/1998/Math/MathML'
				: 'http://www.w3.org/1999/xhtml';
	return (
		element.localName.toLowerCase() === tag.toLowerCase() &&
		element.namespaceURI === uri &&
		matchesProgramIdentity(element, id)
	);
}

/** Adopts a program or transfers the untouched range to its generic fallback. */
export function adoptRenderProgramOrFallback(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance,
	parentScope: EffectScope,
	scope: EffectScope,
	end: number,
	adoptFallback: (
		root: Root,
		vnode: VNode,
		nodes: readonly Node[],
		cursor: number,
		parentInstance: AnyComponentInstance,
		parentScope: EffectScope,
		end?: number
	) => { mounted: Mounted; next: number } | undefined,
	adoptChildren: (
		children: readonly Child[],
		nodes: readonly Node[],
		parentInstance: AnyComponentInstance,
		scope: EffectScope,
		cursor: number,
		end: number
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
		? adoptRenderProgram(root, vnode, nodes[cursor]!, scope, parentInstance)
		: undefined;
	if (adopted) return { mounted: adopted, next: cursor + 1 };
	scope.stop();
	const fallback = fallbackRenderProgram(vnode);
	// Client-closed programs deliberately recover at the hydration-root boundary. Keeping a
	// region-local VNode factory in every successful program costs more than the rare full-root
	// recovery, while the root still preserves the same fail-closed malformed-SSR behavior.
	if (!fallback) return undefined;
	return adoptFallback(root, fallback, nodes, cursor, parentInstance, parentScope, end);
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
		end: number
	) => Mounted[] | undefined
): { mounted: Mounted; next: number } | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) return undefined;
	const program = invocation.program as ExactDomRenderProgram;
	// Universal artifacts retain table-driven bindings for server-safe serialization. The browser
	// runtime intentionally does not activate that generic table. Select the untouched region
	// fallback before claiming scalar sentinels so a failed optimized attempt remains atomic.
	if (!program.bind && program.bindings?.length) return undefined;
	const range = markedProgramRange(nodes, cursor, end);
	if (!range) return undefined;
	const table = tableProgram(invocation);
	const rootNodePlan = table?.nodes[0];
	let programRoot: Element | undefined;
	for (let index = range.contentStart; index < range.endIndex; index++) {
		const node = nodes[index];
		if (
			node instanceof Element &&
			(program.directClaims ||
				(rootNodePlan &&
					matchesProgramElement(
						node,
						rootNodePlan[0],
						rootNodePlan[1],
						rootNodePlan[2] ?? table!.namespace
					)))
		) {
			programRoot = node;
			break;
		}
	}
	if (!programRoot) return undefined;
	const direct = claimCompiledRenderProgram(program, programRoot, 'ssr');
	if (program.directClaims && !direct) return undefined;
	const hydrationIndex = direct ? undefined : indexProgramHydration(programRoot);
	if (hydrationIndex && !validateGenericProgramNodes(table!, hydrationIndex)) return undefined;
	const slotNodes =
		direct?.slotNodes ?? claimGenericHydrationSlots(table!, programRoot, hydrationIndex!);
	if (!direct && !validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom: range.start ?? programRoot,
		...(range.start ? { end: nodes[range.endIndex]! } : {}),
		scope,
		children: [],
		renderProgram: {
			invocation,
			programRoot,
			slotNodes,
			...(direct?.componentSlots ? { componentSlots: direct.componentSlots } : {}),
			root,
			parentInstance
		}
	};
	if (!adoptProgramChildSlots(mounted, parentInstance, adoptChildren)) return undefined;
	const elements =
		direct?.elements ?? table!.nodes.map((planned) => programElement(hydrationIndex!, planned[0]));
	if (direct) {
		// Compiler-generated claims deliberately omit inert static intrinsics. They remain owned by
		// the enclosing DOM range and need no per-element bookkeeping of their own.
		ownDirectProgramNodes(elements, parentInstance);
		countProgramWork(root, program, direct, true);
	} else {
		for (const element of elements) {
			if (!element) return undefined;
			setNodeOwner(element, parentInstance);
			setElementOwner(element, parentInstance);
			countDomWork(root);
		}
	}
	if ((program.bind || program.bindings?.length) && !bindRenderProgram(mounted)) {
		releaseDirectProgramNodeOwners(elements);
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

/** Returns the lazy fallback without exposing its compiler-owned brand. */
export function fallbackRenderProgram(vnode: VNode): VNode | undefined {
	return renderProgramFallback(vnode);
}

function validateGenericProgramNodes(
	program: ExactTableRenderProgram,
	index: ProgramHydrationIndex
): boolean {
	return program.nodes.every((plan) =>
		matchesProgramElement(
			programElement(index, plan[0]),
			plan[0],
			plan[1],
			plan[2] ?? program.namespace
		)
	);
}

function claimGenericMountSlots(
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

function claimGenericHydrationSlots(
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

function releaseDirectProgramNodeOwners(
	elements: readonly (Element | undefined)[] | undefined
): void {
	if (!elements) return;
	for (const element of elements) {
		if (!element) continue;
		clearNodeOwner(element);
		clearElementOwner(element);
	}
}

function ownDirectProgramNodes(
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

function validSlotNodes(
	invocation: ExactRenderProgramInvocation,
	nodes: readonly (Node | undefined)[]
): boolean {
	return nodes.every((node, index) => {
		const kind = invocation.program.slots?.[index]?.[0];
		return kind === 'text'
			? node?.nodeType === textNode
			: kind === 'child' || kind === 'component'
				? node instanceof Comment
				: node?.nodeType === elementNode;
	});
}

function tableProgram(
	invocation: ExactRenderProgramInvocation
): ExactTableRenderProgram | undefined {
	const program = invocation.program;
	return program.directClaims ? undefined : (program as ExactTableRenderProgram);
}

function countProgramWork(
	root: Root,
	program: ExactDomRenderProgram,
	direct: ReturnType<typeof claimCompiledRenderProgram>,
	includeRoot: boolean
): void {
	let work: readonly [number, number];
	if (direct) work = direct.work;
	else {
		if (program.directClaims) return;
		work = [program.nodes.length, program.slots.length];
	}
	const [nodes, slots] = work;
	for (let index = includeRoot ? 0 : 1; index < nodes; index++) countDomWork(root);
	if (!includeRoot) for (let index = 0; index < slots; index++) countDomWork(root);
}
