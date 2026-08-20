import { createTextVNode, isVNode, type Child, type ListBinding, type VNode } from '@exactjs/core';
import { isCellVNode } from '@exactjs/core/runtime/render';
import { peek } from '@exactjs/reactive';
import { getOwnedCellVNode } from './cells.js';
import type { Mounted } from './types.js';

/** Stops mounted children that cannot be reused by an upcoming replacement patch. */
export function stopReplacedChildren(mounted: Mounted, nextChildren: Child[]): void {
	const nextVNodes = childrenToVNodes(nextChildren);
	if (
		mounted.children.length === 1 &&
		nextVNodes.length === 1 &&
		canPatchMounted(mounted.children[0]!, nextVNodes[0]!)
	)
		return;

	const plan = planChildReconciliation(mounted.children, nextVNodes);
	for (let index = 0; index < plan.matches.length; index++) {
		const candidate = plan.matches[index];
		if (candidate && !canPatchMounted(candidate, nextVNodes[index]!)) candidate.scope.stop();
	}
	for (const child of plan.unmatched) child.scope.stop();
}

/**
 * Creates the single reuse plan used by both pre-stop and DOM patching.
 *
 * Keyed nodes match by key. Unkeyed nodes match in forward positional order;
 * the caller may execute the plan in either direction without changing which
 * scope owns which vnode.
 */
export function planChildReconciliation(
	oldChildren: readonly Mounted[],
	nextVNodes: readonly VNode[]
): {
	matches: Array<Mounted | undefined>;
	oldKeyIndices: ReadonlyMap<string, number>;
	unmatched: readonly Mounted[];
} {
	let nextKeys: Set<string> | undefined;
	for (const vnode of nextVNodes) {
		if (vnode.key === undefined) continue;
		nextKeys ??= new Set();
		if (nextKeys.has(vnode.key))
			throw new Error(`Duplicate key "${vnode.key}" in rendered children`);
		nextKeys.add(vnode.key);
	}

	const oldHasKeys = oldChildren.some((child) => child.vnode.key !== undefined);
	if (!oldHasKeys && !nextKeys) return planUnkeyedChildren(oldChildren, nextVNodes);

	const keyed = new Map<string, Mounted>();
	const oldKeyIndices = new Map<string, number>();
	const unkeyed: Mounted[] = [];
	for (let index = 0; index < oldChildren.length; index++) {
		const child = oldChildren[index]!;
		const key = child.vnode.key;
		if (key === undefined) unkeyed.push(child);
		else {
			if (keyed.has(key)) throw new Error(`Duplicate key "${key}" in mounted children`);
			keyed.set(key, child);
			oldKeyIndices.set(key, index);
		}
	}
	const matches = new Array<Mounted | undefined>(nextVNodes.length);
	const nextUnkeyed: number[] = [];
	for (let index = 0; index < nextVNodes.length; index++) {
		const next = nextVNodes[index]!;
		if (next.key === undefined) nextUnkeyed.push(index);
		else matches[index] = keyed.get(next.key);
	}
	matchUnkeyedChildren(unkeyed, nextVNodes, matches, nextUnkeyed);
	return { matches, oldKeyIndices, unmatched: unmatchedChildren(oldChildren, matches) };
}

function planUnkeyedChildren(
	oldChildren: readonly Mounted[],
	nextVNodes: readonly VNode[]
): {
	matches: Array<Mounted | undefined>;
	oldKeyIndices: ReadonlyMap<string, number>;
	unmatched: readonly Mounted[];
} {
	const matches = new Array<Mounted | undefined>(nextVNodes.length);
	matchUnkeyedChildren(oldChildren, nextVNodes, matches);
	return {
		matches,
		oldKeyIndices: emptyKeyIndices,
		unmatched: unmatchedChildren(oldChildren, matches)
	};
}

const emptyKeyIndices: ReadonlyMap<string, number> = new Map();

function matchUnkeyedChildren(
	oldChildren: readonly Mounted[],
	nextVNodes: readonly VNode[],
	matches: Array<Mounted | undefined>,
	nextIndices?: readonly number[]
): void {
	const nextLength = nextIndices?.length ?? nextVNodes.length;
	let oldStart = 0;
	let nextStart = 0;
	while (
		oldStart < oldChildren.length &&
		nextStart < nextLength &&
		canPatchMounted(
			oldChildren[oldStart]!,
			nextVNodes[nextIndices ? nextIndices[nextStart]! : nextStart]!
		)
	) {
		matches[nextIndices ? nextIndices[nextStart]! : nextStart] = oldChildren[oldStart]!;
		oldStart++;
		nextStart++;
	}
	let oldEnd = oldChildren.length - 1;
	let nextEnd = nextLength - 1;
	while (
		oldEnd >= oldStart &&
		nextEnd >= nextStart &&
		canPatchMounted(
			oldChildren[oldEnd]!,
			nextVNodes[nextIndices ? nextIndices[nextEnd]! : nextEnd]!
		)
	) {
		matches[nextIndices ? nextIndices[nextEnd]! : nextEnd] = oldChildren[oldEnd]!;
		oldEnd--;
		nextEnd--;
	}
	while (oldStart <= oldEnd && nextStart <= nextEnd) {
		matches[nextIndices ? nextIndices[nextStart]! : nextStart] = oldChildren[oldStart]!;
		oldStart++;
		nextStart++;
	}
}

function unmatchedChildren(
	oldChildren: readonly Mounted[],
	matches: readonly (Mounted | undefined)[]
): readonly Mounted[] {
	let matchedCount = 0;
	for (const match of matches) if (match) matchedCount++;
	if (matchedCount === oldChildren.length) return emptyMounted;
	const matched = new Set(matches.filter((value): value is Mounted => value !== undefined));
	return oldChildren.filter((child) => !matched.has(child));
}

const emptyMounted: readonly Mounted[] = Object.freeze([]);

/** Converts render children into VNodes with one allocation pass. */
export function childrenToVNodes(children: readonly Child[]): VNode[] {
	const vnodes: VNode[] = [];
	for (const child of children) {
		const vnode = childToVNode(child);
		if (vnode) vnodes.push(vnode);
	}
	return vnodes;
}

/** Converts a render child into a vnode, dropping boolean and nullish placeholders. */
export function childToVNode(child: Child): VNode | undefined {
	if (child === null || child === undefined || child === false || child === true) return undefined;
	if (isVNode(child)) return child;
	return createTextVNode(child);
}

/** Builds component props from vnode props and normalized JSX children. */
export function getComponentProps(vnode: VNode): Record<string, unknown> {
	const props = { ...vnode.props };

	if (vnode.children.length === 1) {
		props.children = vnode.children[0];
	} else if (vnode.children.length > 1) {
		props.children = vnode.children;
	}

	return props;
}

/** Returns the list binding stored on a fragment vnode, if it represents a keyed list. */
export function getListBinding(vnode: VNode): ListBinding | undefined {
	return vnode.props.list as ListBinding | undefined;
}

/** Expands a keyed list binding into renderable vnodes with stable keys. */
export function materializeList<T>(list: ListBinding<T>): VNode[] {
	const collection = list.source ? list.source.get() : list.collection;
	const nodes: VNode[] = [];
	const keys = new Set<string>();
	for (const item of collection) {
		const key = String(list.key(item));
		if (keys.has(key)) throw new Error(`Duplicate key "${key}" in this.map()`);
		keys.add(key);
		const cached = list.cache?.get(key);
		const node = cached && Object.is(cached.item, item) ? cached.vnode : list.render(item);
		list.cache?.set(key, { item, vnode: node });
		nodes.push({ ...node, key });
	}
	if (list.cache) {
		for (const cachedKey of list.cache.keys())
			if (!keys.has(cachedKey)) list.cache.delete(cachedKey);
	}
	return nodes;
}

function canPatchMounted(mounted: Mounted, next: VNode): boolean {
	if (
		mounted.vnode.type !== next.type ||
		mounted.vnode.key !== next.key ||
		mounted.vnode.domain !== next.domain
	)
		return false;
	if (isCellVNode(next)) {
		const previousChild = mounted.children[0];
		return previousChild
			? canPatchMounted(
					previousChild,
					peek(() => getOwnedCellVNode(next))
				)
			: false;
	}
	return true;
}
