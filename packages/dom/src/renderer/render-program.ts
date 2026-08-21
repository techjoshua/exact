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
	const slotNodes = invocation.program.slots.map((slot) => nodeAtPath(dom, slot.path));
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
	if (
		!rootNode ||
		!matchesProgramElement(
			dom,
			rootNode.id,
			rootNode.tag,
			rootNode.namespace ?? invocation.program.namespace
		)
	)
		return undefined;
	for (const node of invocation.program.nodes) {
		const target = nodeAtPath(dom, node.path);
		if (
			!matchesProgramElement(
				target,
				node.id,
				node.tag,
				node.namespace ?? invocation.program.namespace
			)
		)
			return undefined;
	}
	const slotNodes = invocation.program.slots.map((slot) => nodeAtPath(dom, slot.path));
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
	let programRoot: Element | undefined;
	for (let index = range.contentStart; index < range.endIndex; index++) {
		const node = nodes[index];
		if (
			node instanceof Element &&
			rootPlan &&
			matchesProgramElement(
				node,
				rootPlan.id,
				rootPlan.tag,
				rootPlan.namespace ?? invocation.program.namespace
			)
		) {
			programRoot = node;
			break;
		}
	}
	if (!programRoot) return undefined;
	for (const planned of invocation.program.nodes) {
		const element = nodeAtPath(programRoot, planned.hydrationPath ?? planned.path);
		if (
			!matchesProgramElement(
				element,
				planned.id,
				planned.tag,
				planned.namespace ?? invocation.program.namespace
			)
		)
			return undefined;
	}
	const slotNodes = invocation.program.slots.map((slot) => {
		const path = slot.hydrationPath ?? slot.path;
		if (slot.kind === 'text' && slot.id) return claimProgramTextSlot(programRoot, slot.id, path);
		if (slot.kind === 'text') return undefined;
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
		const element = nodeAtPath(programRoot, planned.hydrationPath ?? planned.path) as Element;
		setNodeOwner(element, parentInstance);
		setElementOwner(element, parentInstance);
		countDomWork(root);
	}
	if (!bindRenderProgram(mounted)) {
		for (const planned of invocation.program.nodes) {
			const element = nodeAtPath(programRoot, planned.hydrationPath ?? planned.path) as Element;
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
	mounted.stop?.();
	const state = mounted.renderProgram!;
	const previousProps = state.props ?? new Map<Element, Record<string, unknown>>();
	state.props = previousProps;
	let released = false;
	let valid = true;
	let initialBinding = true;
	const release = () => {
		if (released) return;
		released = true;
		for (const [element, props] of previousProps) {
			const ref = props.ref as { fulfill(value: unknown): void } | undefined;
			ref?.fulfill(undefined);
			clearElementProps(element);
		}
		previousProps.clear();
		mounted.stop = undefined;
		state.refresh = undefined;
	};
	const apply = () => {
		const nextProps = new Map<Element, Record<string, unknown>>();
		for (let index = 0; index < state.slotNodes.length; index++) {
			const value = unwrap(readRenderProgramSlot(state.invocation, index));
			const slot = state.invocation.program.slots[index]!;
			const target = state.slotNodes[index];
			if (slot.kind !== 'text') {
				const element = target as Element;
				let props = nextProps.get(element);
				if (!props) nextProps.set(element, (props = {}));
				props[slot.name!] = value;
				continue;
			}
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
		}
		for (const [element, previous] of previousProps) {
			if (!nextProps.has(element))
				updateProps(state.root, element, previous, {}, mounted.scope, !initialBinding);
		}
		// Option values must exist before a parent select receives its controlled value. Static
		// render-program templates deliberately omit slotted values, so DOM order alone cannot
		// provide the browser's usual option-selection initialization.
		const orderedProps = [...nextProps].sort(([left], [right]) => {
			const leftPriority = left instanceof HTMLSelectElement ? 1 : 0;
			const rightPriority = right instanceof HTMLSelectElement ? 1 : 0;
			return leftPriority - rightPriority;
		});
		for (const [element, next] of orderedProps) {
			updateProps(
				state.root,
				element,
				previousProps.get(element) ?? {},
				next,
				mounted.scope,
				!initialBinding
			);
		}
		previousProps.clear();
		for (const [element, props] of nextProps) previousProps.set(element, props);
		initialBinding = false;
	};
	state.refresh = apply;
	const stop = watchRetained(apply, undefined, { scope: mounted.scope });
	mounted.stop = () => {
		stop?.();
		release();
	};
	if (!valid) {
		mounted.stop();
		return false;
	}
	return true;
}

function validSlotNodes(
	invocation: ExactRenderProgramInvocation,
	nodes: readonly (Node | undefined)[]
): boolean {
	return nodes.every((node, index) =>
		invocation.program.slots[index]?.kind === 'text'
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
		const node = nodeAtPath(root, planned.path);
		if (!node) continue;
		setNodeOwner(node, owner);
		if (node.nodeType === elementNode) setElementOwner(node as Element, owner);
	}
}

function releaseProgramNodeOwners(program: ExactRenderProgram, root: Node): void {
	for (const planned of program.nodes) {
		const node = nodeAtPath(root, planned.path);
		if (!node) continue;
		clearNodeOwner(node);
		if (node.nodeType === elementNode) clearElementOwner(node as Element);
	}
}
