import { type AnyComponentInstance, isVNode, unwrap, type Child, type VNode } from '@exactjs/core';
import {
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback,
	type ExactRenderProgram,
	type ExactRenderProgramInvocation
} from '@exactjs/core/runtime/render';
import { type OwnedRetainedWatch, watchRetained } from '@exactjs/reactive/framework/watch';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import { applyCompiledProps, releaseCompiledProps } from '../compiled-props.js';
import { clearElementOwner, clearNodeOwner, setElementOwner, setNodeOwner } from '../ownership.js';
import { clearElementProps, updateProps } from '../props.js';
import type { Mounted, Root } from '../types.js';
import { countDomWork } from './limits.js';
import { materializeProgramTemplate } from './render-program-template.js';
import {
	adoptProgramChildSlots,
	bindProgramChild,
	bindProgramLists
} from './render-program-children.js';
import {
	claimProgramChildSlot,
	claimProgramTextSlot,
	indexProgramHydration,
	markedProgramRange,
	matchesProgramIdentity,
	programElement,
	programNodeAtPath
} from './render-program-hydration.js';
import { ownProgramNodes, releaseProgramNodeOwners } from './render-program-ownership.js';

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
	const fragment = materializeProgramTemplate(invocation.program, root.container.ownerDocument);
	if (!fragment.firstChild || fragment.firstChild !== fragment.lastChild) return undefined;
	const dom = fragment.firstChild!;
	if (!(dom instanceof Element)) return undefined;
	const programIndex = indexProgramHydration(dom);
	const slotNodes = invocation.program.slots.map((slot) => {
		if (slot[0] === 'text') return programNodeAtPath(dom, slot[2]);
		if (slot[0] === 'child' || slot[0] === 'component')
			return claimProgramChildSlot(programIndex, slot[1]);
		const owner = invocation.program.nodes[slot[1]];
		return owner ? programElement(programIndex, owner[0]) : undefined;
	});
	if (!validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom,
		scope,
		children: [],
		renderProgram: { invocation, programRoot: dom, slotNodes, root, parentInstance }
	};
	if (parentInstance) ownProgramNodes(invocation.program, programIndex, parentInstance);
	if (invocation.program.bindings.length !== 0 && !bindRenderProgram(mounted)) {
		releaseProgramNodeOwners(invocation.program, programIndex);
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
	const rootPlan = invocation.program.nodes[0];
	if (
		!rootPlan ||
		!matchesProgramElement(
			dom,
			rootPlan[0],
			rootPlan[1],
			rootPlan[2] ?? invocation.program.namespace
		)
	)
		return undefined;
	if (!(dom instanceof Element)) return undefined;
	const programIndex = indexProgramHydration(dom);
	for (const plan of invocation.program.nodes) {
		const target = programElement(programIndex, plan[0]);
		if (!matchesProgramElement(target, plan[0], plan[1], plan[2] ?? invocation.program.namespace))
			return undefined;
	}
	const slotNodes = invocation.program.slots.map((slot) => {
		if (slot[0] === 'text') return programNodeAtPath(dom, slot[2]);
		if (slot[0] === 'child' || slot[0] === 'component')
			return claimProgramChildSlot(programIndex, slot[1]);
		const owner = invocation.program.nodes[slot[1]];
		return owner ? programElement(programIndex, owner[0]) : undefined;
	});
	if (!validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom,
		scope,
		children: [],
		renderProgram: { invocation, programRoot: dom, slotNodes, root, parentInstance }
	};
	ownProgramNodes(invocation.program, programIndex, parentInstance);
	if (invocation.program.bindings.length !== 0 && !bindRenderProgram(mounted)) {
		releaseProgramNodeOwners(invocation.program, programIndex);
		return undefined;
	}
	for (const _node of invocation.program.nodes) countDomWork(root);
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
	const range = markedProgramRange(nodes, cursor, end);
	if (!range) return undefined;
	const rootNodePlan = invocation.program.nodes[0];
	let programRoot: Element | undefined;
	for (let index = range.contentStart; index < range.endIndex; index++) {
		const node = nodes[index];
		if (
			node instanceof Element &&
			rootNodePlan &&
			matchesProgramElement(
				node,
				rootNodePlan[0],
				rootNodePlan[1],
				rootNodePlan[2] ?? invocation.program.namespace
			)
		) {
			programRoot = node;
			break;
		}
	}
	if (!programRoot) return undefined;
	const hydrationIndex = indexProgramHydration(programRoot);
	for (const planned of invocation.program.nodes) {
		const plan = planned;
		const element = programElement(hydrationIndex, plan[0]);
		if (!matchesProgramElement(element, plan[0], plan[1], plan[2] ?? invocation.program.namespace))
			return undefined;
	}
	const slotNodes = invocation.program.slots.map((slot) => {
		const plan = slot;
		if (plan[0] === 'text' && plan[1])
			return claimProgramTextSlot(programRoot, hydrationIndex, plan[1]);
		if (plan[0] === 'child' || plan[0] === 'component')
			return claimProgramChildSlot(hydrationIndex, plan[1]);
		if (plan[0] === 'text') return undefined;
		const owner = invocation.program.nodes[plan[1]];
		return owner ? programElement(hydrationIndex, owner[0]) : undefined;
	});
	if (!validSlotNodes(invocation, slotNodes)) return undefined;
	const mounted: Mounted = {
		vnode,
		dom: range.start ?? programRoot,
		...(range.start ? { end: nodes[range.endIndex]! } : {}),
		scope,
		children: [],
		renderProgram: { invocation, programRoot, slotNodes, root, parentInstance }
	};
	if (!adoptProgramChildSlots(mounted, parentInstance, adoptChildren)) return undefined;
	for (const planned of invocation.program.nodes) {
		const element = programElement(hydrationIndex, planned[0])!;
		setNodeOwner(element, parentInstance);
		setElementOwner(element, parentInstance);
		countDomWork(root);
	}
	if (invocation.program.bindings.length !== 0 && !bindRenderProgram(mounted)) {
		for (const planned of invocation.program.nodes) {
			const element = programElement(hydrationIndex, planned[0])!;
			clearNodeOwner(element);
			clearElementOwner(element);
		}
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

function bindRenderProgram(mounted: Mounted): boolean {
	const state = mounted.renderProgram!;
	let previousProps = state.props;
	let released = false;
	let valid = true;
	let initialBinding = true;
	let stopBindings: OwnedRetainedWatch[] = [];
	const stopCurrentBindings = () => {
		for (const binding of stopBindings) binding.stop();
		stopBindings = [];
	};
	const release = () => {
		if (released) return;
		released = true;
		stopCurrentBindings();
		if (previousProps) {
			for (const [element, props] of previousProps) {
				const ref = props.ref as { fulfill(value: unknown): void } | undefined;
				ref?.fulfill(undefined);
				clearElementProps(element);
			}
			previousProps.clear();
			state.props = undefined;
		}
		releaseCompiledProps(mounted);
		mounted.stop = undefined;
		state.refresh = undefined;
	};
	const bind = () => {
		stopCurrentBindings();
		valid = true;
		let propertyGroup = 0;
		for (const binding of state.invocation.program.bindings) {
			if (binding[0] === 'lists') {
				if (!bindProgramLists(mounted, binding[1], initialBinding, stopBindings)) valid = false;
				continue;
			}
			if (binding[0] === 'child' || binding[0] === 'component') {
				if (!bindProgramChild(mounted, binding[1], initialBinding, stopBindings)) valid = false;
				continue;
			}
			if (binding[0] === 'text') {
				const index = binding[1];
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
				const watcher = watchRetained(applyText, undefined, { scope: mounted.scope, owned: true });
				if (watcher) stopBindings.push(watcher);
				continue;
			}
			const indexes = binding[1];
			const writer = state.invocation.propertyWriter ? propertyGroup : undefined;
			propertyGroup++;
			const element = state.slotNodes[indexes[0]!] as Element;
			const applyProps = () => {
				if (writer !== undefined && state.invocation.propertyWriter) {
					applyCompiledProps(mounted, element, writer, initialBinding);
					return;
				}
				state.props = previousProps ??= new Map<Element, Record<string, unknown>>();
				const next: Record<string, unknown> = {};
				for (const index of indexes) {
					const slot = state.invocation.program.slots[index]!;
					if (slot[0] === 'text' || slot[0] === 'child' || slot[0] === 'component') continue;
					next[slot[2]] = unwrap(readRenderProgramSlot(state.invocation, index));
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
			const watcher = watchRetained(applyProps, undefined, { scope: mounted.scope, owned: true });
			if (watcher) stopBindings.push(watcher);
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
	return nodes.every((node, index) => {
		const kind = invocation.program.slots[index]?.[0];
		return kind === 'text'
			? node?.nodeType === textNode
			: kind === 'child' || kind === 'component'
				? node instanceof Comment
				: node?.nodeType === elementNode;
	});
}
