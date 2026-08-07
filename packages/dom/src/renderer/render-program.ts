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

const templateCaches = new WeakMap<Document, WeakMap<ExactRenderProgram, HTMLTemplateElement>>();
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
		renderProgram: { invocation, slotNodes, root }
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
		renderProgram: { invocation, slotNodes, root }
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
	adoptFallback: (
		root: Root,
		vnode: VNode,
		nodes: readonly Node[],
		cursor: number,
		parentInstance: ComponentInstance<any>,
		parentScope: EffectScope
	) => { mounted: Mounted; next: number } | undefined
): { mounted: Mounted; next: number } | undefined {
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
		parentScope
	);
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
	let released = false;
	let valid = true;
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
	};
	const stop = watchRetained(
		() => {
			const nextProps = new Map<Element, Record<string, unknown>>();
			for (let index = 0; index < state.slotNodes.length; index++) {
				const value = unwrap(state.invocation.readers[index]!());
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
				if (!nextProps.has(element)) updateProps(state.root, element, previous, {}, mounted.scope);
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
				updateProps(state.root, element, previousProps.get(element) ?? {}, next, mounted.scope);
			}
			previousProps.clear();
			for (const [element, props] of nextProps) previousProps.set(element, props);
		},
		undefined,
		{ scope: mounted.scope }
	);
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

function programTemplate(
	program: ExactRenderProgram,
	ownerDocument: Document
): HTMLTemplateElement {
	let cache = templateCaches.get(ownerDocument);
	if (!cache) templateCaches.set(ownerDocument, (cache = new WeakMap()));
	let template = cache.get(program);
	if (!template) {
		template = ownerDocument.createElement('template');
		if (program.namespace === 'html') {
			template.innerHTML = program.template;
		} else {
			const namespace =
				program.namespace === 'svg'
					? 'http://www.w3.org/2000/svg'
					: 'http://www.w3.org/1998/Math/MathML';
			const wrapper = ownerDocument.createElementNS(
				namespace,
				program.namespace === 'svg' ? 'svg' : 'math'
			);
			wrapper.innerHTML = program.template;
			template.content.append(...wrapper.childNodes);
		}
		cache.set(program, template);
	}
	return template;
}

function nodeAtPath(root: Node, path: readonly number[]): Node | undefined {
	let node: Node | undefined = root;
	for (const index of path) node = node?.childNodes[index];
	return node;
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
