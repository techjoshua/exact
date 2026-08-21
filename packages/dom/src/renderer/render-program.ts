import { type AnyComponentInstance, isVNode, unwrap, type VNode } from '@exactjs/core';
import {
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback,
	type ExactRenderProgram,
	type ExactRenderProgramInvocation
} from '@exactjs/core/runtime/render';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import type { EffectScope } from '@exactjs/reactive';
import { clearElementOwner, clearNodeOwner, setElementOwner, setNodeOwner } from '../ownership.js';
import { clearElementProps, updateProps } from '../props.js';
import type { Mounted, Root } from '../types.js';
import { countDomWork } from './limits.js';
import { programTemplate } from './render-program-template.js';

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
	const template = programTemplate(invocation.program, root.container.ownerDocument);
	const fragment = template.content.cloneNode(true) as DocumentFragment;
	if (fragment.childNodes.length !== 1) return undefined;
	const dom = fragment.firstChild!;
	const slotNodes = invocation.program.slots.map((slot) =>
		nodeAtPath(dom, slot[0] === 'text' ? slot[2] : slot[1])
	);
	if (!validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom,
		scope,
		children: [],
		renderProgram: { invocation, programRoot: dom, slotNodes, root }
	};
	if (parentInstance) ownProgramNodes(invocation.program, dom, parentInstance);
	if (!bindRenderProgram(mounted)) {
		releaseProgramNodeOwners(invocation.program, dom);
		return undefined;
	}
	for (let index = 1; index < invocation.program.nodes.length; index++) countDomWork(root);
	for (const _slot of invocation.program.slots) countDomWork(root);
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
	const rootNode = invocation.program.nodes[0];
	const rootPlan = rootNode;
	if (
		!rootPlan ||
		!matchesProgramElement(
			dom,
			rootPlan[0],
			rootPlan[3],
			rootPlan[4] ?? invocation.program.namespace
		)
	)
		return undefined;
	for (const node of invocation.program.nodes) {
		const plan = node;
		const target = nodeAtPath(dom, plan[1]);
		if (!matchesProgramElement(target, plan[0], plan[3], plan[4] ?? invocation.program.namespace))
			return undefined;
	}
	const slotNodes = invocation.program.slots.map((slot) =>
		nodeAtPath(dom, slot[0] === 'text' ? slot[2] : slot[1])
	);
	if (!validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom,
		scope,
		children: [],
		renderProgram: { invocation, programRoot: dom, slotNodes, root }
	};
	ownProgramNodes(invocation.program, dom, parentInstance);
	if (!bindRenderProgram(mounted)) {
		releaseProgramNodeOwners(invocation.program, dom);
		return undefined;
	}
	for (const _node of invocation.program.nodes) countDomWork(root);
	return mounted;
}

function matchesProgramElement(
	node: Node | undefined,
	id: string,
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
		element.getAttribute('data-exact-id') === id
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
	) => { mounted: Mounted; next: number } | undefined
): { mounted: Mounted; next: number } | undefined {
	const marked = adoptMarkedRenderProgram(root, vnode, nodes, cursor, end, scope, parentInstance);
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
	parentInstance: AnyComponentInstance
): { mounted: Mounted; next: number } | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) return undefined;
	const range = markedProgramRange(nodes, cursor, end);
	if (!range) return undefined;
	const rootPlan = invocation.program.nodes[0];
	const rootNodePlan = rootPlan;
	let programRoot: Element | undefined;
	for (let index = range.contentStart; index < range.endIndex; index++) {
		const node = nodes[index];
		if (
			node instanceof Element &&
			rootNodePlan &&
			matchesProgramElement(
				node,
				rootNodePlan[0],
				rootNodePlan[3],
				rootNodePlan[4] ?? invocation.program.namespace
			)
		) {
			programRoot = node;
			break;
		}
	}
	if (!programRoot) return undefined;
	for (const planned of invocation.program.nodes) {
		const plan = planned;
		const element = nodeAtPath(programRoot, plan[2]);
		if (!matchesProgramElement(element, plan[0], plan[3], plan[4] ?? invocation.program.namespace))
			return undefined;
	}
	const slotNodes = invocation.program.slots.map((slot) => {
		const plan = slot;
		const path = plan[0] === 'text' ? plan[3] : plan[2];
		if (plan[0] === 'text' && plan[1]) return claimProgramTextSlot(programRoot, plan[1], path);
		if (plan[0] === 'text') return undefined;
		return nodeAtPath(programRoot, path);
	});
	if (!validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom: range.start ?? programRoot,
		...(range.start ? { end: nodes[range.endIndex]! } : {}),
		scope,
		children: [],
		renderProgram: { invocation, programRoot, slotNodes, root }
	};
	for (const planned of invocation.program.nodes) {
		const element = nodeAtPath(programRoot, planned[2]) as Element;
		setNodeOwner(element, parentInstance);
		setElementOwner(element, parentInstance);
		countDomWork(root);
	}
	if (!bindRenderProgram(mounted)) {
		for (const planned of invocation.program.nodes) {
			const element = nodeAtPath(programRoot, planned[2]) as Element;
			clearNodeOwner(element);
			clearElementOwner(element);
		}
		return undefined;
	}
	return { mounted, next: range.start ? range.endIndex + 1 : range.endIndex };
}

/** Resolves the optional outer cell range enclosing a marked render program. */
function markedProgramRange(
	nodes: readonly Node[],
	cursor: number,
	end: number
): { start?: Comment; contentStart: number; endIndex: number } | undefined {
	const start = nodes[cursor];
	if (!(start instanceof Comment) || !start.data.startsWith('exact:cell:'))
		return { contentStart: cursor, endIndex: cursor + 1 };
	for (let index = cursor + 1; index < end; index++) {
		const candidate = nodes[index];
		if (candidate instanceof Comment && candidate.data === `/${start.data}`)
			return { start, contentStart: cursor + 1, endIndex: index };
	}
	return undefined;
}

/** Claims one compiler-addressed SSR scalar range without scanning unrelated DOM. */
function claimProgramTextSlot(
	root: Element,
	id: string,
	path: readonly number[]
): Text | undefined {
	const marker = nodeAtPath(root, path);
	const identity = id.startsWith('exact:') ? id.slice('exact:'.length) : id;
	if (!(marker instanceof Comment) || marker.data !== `exact:dynamic:${identity}`) return undefined;
	let text = marker.nextSibling instanceof Text ? marker.nextSibling : undefined;
	const closing = text ? text.nextSibling : marker.nextSibling;
	if (!(closing instanceof Comment) || closing.data !== `/exact:dynamic:${identity}`)
		return undefined;
	if (!text) {
		text = root.ownerDocument.createTextNode('');
		closing.parentNode?.insertBefore(text, closing);
	}
	return text;
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

function bindRenderProgram(mounted: Mounted): boolean {
	const state = mounted.renderProgram!;
	const previousProps = state.props ?? new Map<Element, Record<string, unknown>>();
	state.props = previousProps;
	let released = false;
	let valid = true;
	let initialBinding = true;
	let stopBindings: Array<() => void> = [];
	const propertySlots = new Map<Element, number[]>();
	const textSlots: number[] = [];
	for (let index = 0; index < state.slotNodes.length; index++) {
		const slot = state.invocation.program.slots[index]!;
		if (slot[0] === 'text') {
			textSlots.push(index);
			continue;
		}
		const element = state.slotNodes[index] as Element;
		const indexes = propertySlots.get(element);
		if (indexes) indexes.push(index);
		else propertySlots.set(element, [index]);
	}
	const orderedPropertySlots = [...propertySlots].sort(([left], [right]) => {
		const leftPriority = left instanceof HTMLSelectElement ? 1 : 0;
		const rightPriority = right instanceof HTMLSelectElement ? 1 : 0;
		return leftPriority - rightPriority;
	});
	const stopCurrentBindings = () => {
		for (const stop of stopBindings) stop();
		stopBindings = [];
	};
	const release = () => {
		if (released) return;
		released = true;
		stopCurrentBindings();
		for (const [element, props] of previousProps) {
			const ref = props.ref as { fulfill(value: unknown): void } | undefined;
			ref?.fulfill(undefined);
			clearElementProps(element);
		}
		previousProps.clear();
		mounted.stop = undefined;
		state.refresh = undefined;
	};
	const bind = () => {
		stopCurrentBindings();
		valid = true;
		for (const index of textSlots) {
			const applyText = () => {
				const value = unwrap(readRenderProgramSlot(state.invocation, index));
				const target = state.slotNodes[index];
				if (isVNode(value) || Array.isArray(value) || value instanceof Promise) {
					valid = false;
					return;
				}
				const text =
					value === null || value === undefined || value === false || value === true
						? ''
						: String(value);
				const node = target as Text;
				if (node.data !== text) node.data = text;
			};
			const stop = watchRetained(applyText, undefined, { scope: mounted.scope });
			if (stop) stopBindings.push(stop);
		}
		// Option values must exist before a parent select receives its controlled value. Static
		// render-program templates deliberately omit slotted values, so DOM order alone cannot
		// provide the browser's usual option-selection initialization.
		for (const [element, indexes] of orderedPropertySlots) {
			const applyProps = () => {
				const next: Record<string, unknown> = {};
				for (const index of indexes) {
					const slot = state.invocation.program.slots[index]!;
					if (slot[0] === 'text') continue;
					next[slot[3]] = unwrap(readRenderProgramSlot(state.invocation, index));
				}
				updateProps(
					state.root,
					element,
					previousProps.get(element) ?? {},
					next,
					mounted.scope,
					!initialBinding
				);
				previousProps.set(element, next);
			};
			const stop = watchRetained(applyProps, undefined, { scope: mounted.scope });
			if (stop) stopBindings.push(stop);
		}
		initialBinding = false;
	};
	state.refresh = bind;
	mounted.stop = release;
	bind();
	if (!valid) {
		release();
		return false;
	}
	return true;
}

function validSlotNodes(
	invocation: ExactRenderProgramInvocation,
	nodes: readonly (Node | undefined)[]
): boolean {
	return nodes.every((node, index) =>
		invocation.program.slots[index] && invocation.program.slots[index]![0] === 'text'
			? node?.nodeType === textNode
			: node?.nodeType === elementNode
	);
}

function nodeAtPath(root: Node, path: readonly number[]): Node | undefined {
	let node: Node | undefined = root;
	for (const index of path) node = node?.childNodes[index];
	return node;
}

function ownProgramNodes(
	program: ExactRenderProgram,
	root: Node,
	owner: AnyComponentInstance
): void {
	for (const planned of program.nodes) {
		const node = nodeAtPath(root, planned[1]);
		if (!node) continue;
		setNodeOwner(node, owner);
		if (node.nodeType === elementNode) setElementOwner(node as Element, owner);
	}
}

function releaseProgramNodeOwners(program: ExactRenderProgram, root: Node): void {
	for (const planned of program.nodes) {
		const node = nodeAtPath(root, planned[1]);
		if (!node) continue;
		clearNodeOwner(node);
		if (node.nodeType === elementNode) clearElementOwner(node as Element);
	}
}
