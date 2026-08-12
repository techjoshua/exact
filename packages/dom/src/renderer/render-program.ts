import {
	isVNode,
	readRenderProgram,
	renderProgramFallback,
	unwrap,
	type ComponentInstance,
	type ExactRenderProgram,
	type ExactRenderProgramInvocation,
	type VNode
} from '@exactjs/core';
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
	parentInstance?: ComponentInstance<any>
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
	parentInstance: ComponentInstance<any>
): Mounted | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) return undefined;
	const rootNode = invocation.program.nodes[0];
	if (!rootNode || !matchesProgramElement(dom, rootNode.id, rootNode.tag, rootNode.namespace))
		return undefined;
	for (const node of invocation.program.nodes) {
		const target = nodeAtPath(dom, node.path);
		if (!matchesProgramElement(target, node.id, node.tag, node.namespace)) return undefined;
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
	parentInstance: ComponentInstance<any>,
	parentScope: EffectScope,
	scope: EffectScope,
	end: number,
	adoptFallback: (
		root: Root,
		vnode: VNode,
		nodes: readonly Node[],
		cursor: number,
		parentInstance: ComponentInstance<any>,
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
	return adoptFallback(
		root,
		fallbackRenderProgram(vnode),
		nodes,
		cursor,
		parentInstance,
		parentScope,
		end
	);
}

/** Adopts compiler-addressed program nodes inside the marker ranges required by generic SSR. */
function adoptMarkedRenderProgram(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	end: number,
	scope: EffectScope,
	parentInstance: ComponentInstance<any>
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
			matchesProgramElement(node, rootPlan.id, rootPlan.tag, rootPlan.namespace)
		) {
			programRoot = node;
			break;
		}
	}
	if (!programRoot) return undefined;
	const indexedElements = indexProgramElements(programRoot);
	for (const planned of invocation.program.nodes) {
		const element = indexedElements.get(planned.id);
		if (!matchesProgramElement(element, planned.id, planned.tag, planned.namespace))
			return undefined;
	}
	const textSlots = indexProgramTextSlots(programRoot);
	const slotNodes = invocation.program.slots.map((slot) => {
		if (slot.kind === 'text')
			return textSlots.get(slot.id.startsWith('exact:') ? slot.id.slice('exact:'.length) : slot.id);
		const planned = invocation.program.nodes.find((node) => samePath(node.path, slot.path));
		return planned ? indexedElements.get(planned.id) : undefined;
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
		const element = indexedElements.get(planned.id)!;
		setNodeOwner(element, parentInstance);
		setElementOwner(element, parentInstance);
		countDomWork(root);
	}
	if (!bindRenderProgram(mounted)) {
		for (const planned of invocation.program.nodes) {
			const element = indexedElements.get(planned.id)!;
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

/** Indexes compiler-owned intrinsic identities inside one program root. */
function indexProgramElements(root: Element): Map<string, Element> {
	const elements = new Map<string, Element>();
	const rootId = root.getAttribute('data-exact-id');
	if (rootId) elements.set(rootId, root);
	for (const element of root.querySelectorAll('[data-exact-id]')) {
		const id = element.getAttribute('data-exact-id');
		if (id) elements.set(id, element);
	}
	return elements;
}

/** Resolves marked scalar slots and supplies the empty text node omitted by HTML parsing. */
function indexProgramTextSlots(root: Element): Map<string, Text> {
	const slots = new Map<string, Text>();
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const marker = node as Comment;
		if (!marker.data.startsWith('exact:dynamic:')) continue;
		const id = marker.data.slice('exact:dynamic:'.length);
		const closing =
			marker.nextSibling?.nodeType === Node.TEXT_NODE
				? marker.nextSibling.nextSibling
				: marker.nextSibling;
		if (!(closing instanceof Comment) || closing.data !== `/exact:dynamic:${id}`) continue;
		let text = marker.nextSibling instanceof Text ? marker.nextSibling : undefined;
		if (!text) {
			text = root.ownerDocument.createTextNode('');
			closing.parentNode?.insertBefore(text, closing);
		}
		slots.set(id, text);
	}
	return slots;
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
	return bindRenderProgram(mounted);
}

/** Returns the lazy fallback without exposing its compiler-owned brand. */
export function fallbackRenderProgram(vnode: VNode): VNode {
	return renderProgramFallback(vnode);
}

function bindRenderProgram(mounted: Mounted): boolean {
	mounted.stop?.();
	const state = mounted.renderProgram!;
	const previousProps = state.props ?? new Map<Element, Record<string, unknown>>();
	state.props = previousProps;
	const stops: Array<() => void> = [];
	const initialValues: unknown[] = [];
	let initializing = true;
	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		for (const stop of stops) stop();
		for (const [element, props] of previousProps) {
			const ref = props.ref as { fulfill(value: unknown): void } | undefined;
			ref?.fulfill(undefined);
			clearElementProps(element);
		}
		previousProps.clear();
		mounted.stop = undefined;
	};

	for (let index = 0; index < state.slotNodes.length; index++) {
		const stop = watchRetained(
			() => {
				const value = unwrap(state.invocation.readers[index]!());
				if (initializing) {
					initialValues[index] = value;
					return;
				}
				applyRenderProgramSlot(mounted, index, value, previousProps);
			},
			undefined,
			{ scope: mounted.scope }
		);
		if (stop) stops.push(stop);
	}
	initializing = false;

	if (!applyInitialRenderProgramSlots(mounted, initialValues, previousProps)) {
		release();
		return false;
	}
	mounted.stop = release;
	return true;
}

/** Applies initial slots as one plan so option values precede a controlled select value. */
function applyInitialRenderProgramSlots(
	mounted: Mounted,
	values: readonly unknown[],
	propsByElement: Map<Element, Record<string, unknown>>
): boolean {
	const state = mounted.renderProgram!;
	for (let index = 0; index < state.slotNodes.length; index++) {
		if (
			state.invocation.program.slots[index]!.kind === 'text' &&
			!isRenderProgramScalar(values[index])
		)
			return false;
	}
	for (let index = 0; index < state.slotNodes.length; index++) {
		const slot = state.invocation.program.slots[index]!;
		const value = values[index];
		if (slot.kind === 'text') {
			if (!applyRenderProgramText(state.slotNodes[index] as Text, value)) return false;
			continue;
		}
		const element = state.slotNodes[index] as Element;
		let props = propsByElement.get(element);
		if (!props) propsByElement.set(element, (props = {}));
		props[slot.name!] = value;
	}
	const orderedProps = [...propsByElement].sort(([left], [right]) => {
		const leftPriority = left instanceof HTMLSelectElement ? 1 : 0;
		const rightPriority = right instanceof HTMLSelectElement ? 1 : 0;
		return leftPriority - rightPriority;
	});
	for (const [element, props] of orderedProps)
		updateProps(state.root, element, {}, props, mounted.scope, false);
	return true;
}

/** Publishes one invalidated scalar slot without resampling unrelated program readers. */
function applyRenderProgramSlot(
	mounted: Mounted,
	index: number,
	value: unknown,
	propsByElement: Map<Element, Record<string, unknown>>
): void {
	const state = mounted.renderProgram!;
	const slot = state.invocation.program.slots[index]!;
	const target = state.slotNodes[index]!;
	if (slot.kind === 'text') {
		applyRenderProgramText(target as Text, value);
		return;
	}
	const element = target as Element;
	const previous = propsByElement.get(element) ?? {};
	if (Object.is(previous[slot.name!], value)) return;
	const next = { ...previous, [slot.name!]: value };
	updateProps(state.root, element, previous, next, mounted.scope);
	propsByElement.set(element, next);
}

/** Applies the scalar text contract and rejects structural values. */
function applyRenderProgramText(node: Text, value: unknown): boolean {
	if (!isRenderProgramScalar(value)) return false;
	const text =
		value === null || value === undefined || value === false || value === true ? '' : String(value);
	if (node.data !== text) node.data = text;
	return true;
}

/** Reports whether a planned text value can remain inside its scalar DOM slot. */
function isRenderProgramScalar(value: unknown): boolean {
	return !isVNode(value) && !Array.isArray(value) && !(value instanceof Promise);
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

/** Compares compiler-owned node paths without allocating a serialized key. */
function samePath(left: readonly number[], right: readonly number[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function ownProgramNodes(
	program: ExactRenderProgram,
	root: Node,
	owner: ComponentInstance<any>
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
