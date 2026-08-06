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
import { setElementOwner, setNodeOwner } from '../ownership.js';
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
	if (!invocation || !validScalarReaders(invocation)) return undefined;
	const template = programTemplate(invocation.program, root.container.ownerDocument);
	const fragment = template.content.cloneNode(true) as DocumentFragment;
	if (fragment.childNodes.length !== 1) return undefined;
	const dom = fragment.firstChild!;
	const slotNodes = invocation.program.slots.map((slot) => nodeAtPath(dom, slot.path));
	if (slotNodes.some((node) => node?.nodeType !== textNode)) return undefined;
	for (let index = 1; index < invocation.program.nodes.length; index++) countDomWork(root);
	for (const _slot of invocation.program.slots) countDomWork(root);
	const mounted: Mounted = {
		vnode,
		dom,
		scope,
		children: [],
		renderProgram: { invocation, slotNodes }
	};
	if (parentInstance) ownProgramNodes(invocation.program, dom, parentInstance);
	bindRenderProgram(mounted);
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
	if (!invocation || !validScalarReaders(invocation)) return undefined;
	const rootNode = invocation.program.nodes[0];
	if (!rootNode || dom.nodeType !== elementNode || (dom as Element).localName !== rootNode.tag)
		return undefined;
	for (const node of invocation.program.nodes) {
		const target = nodeAtPath(dom, node.path);
		if (target?.nodeType !== elementNode || (target as Element).localName !== node.tag)
			return undefined;
		countDomWork(root);
	}
	const slotNodes = invocation.program.slots.map((slot) => nodeAtPath(dom, slot.path));
	if (slotNodes.some((node) => node?.nodeType !== textNode)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom,
		scope,
		children: [],
		renderProgram: { invocation, slotNodes }
	};
	ownProgramNodes(invocation.program, dom, parentInstance);
	bindRenderProgram(mounted);
	return mounted;
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
		mounted.renderProgram.invocation.program.id !== invocation.program.id ||
		!validScalarReaders(invocation)
	)
		return false;
	mounted.vnode = vnode;
	mounted.renderProgram.invocation = invocation;
	bindRenderProgram(mounted);
	return true;
}

/** Returns the lazy fallback without exposing its compiler-owned brand. */
export function fallbackRenderProgram(vnode: VNode): VNode {
	return renderProgramFallback(vnode);
}

function bindRenderProgram(mounted: Mounted): void {
	mounted.stop?.();
	const state = mounted.renderProgram!;
	mounted.stop = watchRetained(
		() => {
			for (let index = 0; index < state.slotNodes.length; index++) {
				const value = unwrap(state.invocation.readers[index]!());
				const text =
					value === null || value === undefined || value === false || value === true
						? ''
						: String(value);
				const node = state.slotNodes[index] as Text;
				if (node.data !== text) node.data = text;
			}
		},
		undefined,
		{ scope: mounted.scope, onRelease: () => (mounted.stop = undefined) }
	);
}

function validScalarReaders(invocation: ExactRenderProgramInvocation): boolean {
	for (const read of invocation.readers) {
		const value = unwrap(read());
		if (isVNode(value) || Array.isArray(value) || value instanceof Promise) return false;
	}
	return true;
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
		template.innerHTML = program.template;
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
