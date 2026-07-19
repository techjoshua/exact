import {
	createTextVNode,
	getCellVNode,
	isCellVNode,
	isVNode,
	type Child,
	type ListBinding,
	type VNode
} from '@exact/core';
import { peek } from '@exact/reactive';
import type { Mounted } from './types.js';

/** Stops mounted children that cannot be reused by an upcoming replacement patch. */
export function stopReplacedChildren(mounted: Mounted, nextChildren: Child[]): void {
	const nextVNodes = nextChildren.map(childToVNode).filter((vnode): vnode is VNode => !!vnode);

	const plan = planChildReconciliation(mounted.children, nextVNodes);
	const retained = plan.reusable;
	for (const child of mounted.children) if (!retained.has(child)) child.scope.stop();
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
	oldKeyIndices: Map<string, number>;
	reusable: Set<Mounted>;
} {
	const keyed = new Map<string, Mounted>();
	const oldKeyIndices = new Map<string, number>();
	const unkeyed: Mounted[] = [];
	for (let index = 0; index < oldChildren.length; index++) {
		const child = oldChildren[index]!;
		if (child.vnode.key === undefined) unkeyed.push(child);
		else {
			if (keyed.has(child.vnode.key))
				throw new Error(`Duplicate key "${child.vnode.key}" in mounted children`);
			keyed.set(child.vnode.key, child);
			oldKeyIndices.set(child.vnode.key, index);
		}
	}
	const reusable = new Set<Mounted>();
	const matches = new Array<Mounted | undefined>(nextVNodes.length);
	for (let index = 0; index < nextVNodes.length; index++) {
		const next = nextVNodes[index]!;
		if (next.key !== undefined) matches[index] = keyed.get(next.key);
	}
	const nextUnkeyed = nextVNodes
		.map((vnode, index) => ({ vnode, index }))
		.filter((entry) => entry.vnode.key === undefined);
	let oldStart = 0;
	let nextStart = 0;
	while (
		oldStart < unkeyed.length &&
		nextStart < nextUnkeyed.length &&
		canPatchMounted(unkeyed[oldStart]!, nextUnkeyed[nextStart]!.vnode)
	) {
		matches[nextUnkeyed[nextStart]!.index] = unkeyed[oldStart]!;
		oldStart++;
		nextStart++;
	}
	let oldEnd = unkeyed.length - 1;
	let nextEnd = nextUnkeyed.length - 1;
	while (
		oldEnd >= oldStart &&
		nextEnd >= nextStart &&
		canPatchMounted(unkeyed[oldEnd]!, nextUnkeyed[nextEnd]!.vnode)
	) {
		matches[nextUnkeyed[nextEnd]!.index] = unkeyed[oldEnd]!;
		oldEnd--;
		nextEnd--;
	}
	while (oldStart <= oldEnd && nextStart <= nextEnd) {
		matches[nextUnkeyed[nextStart]!.index] = unkeyed[oldStart]!;
		oldStart++;
		nextStart++;
	}
	for (let index = 0; index < nextVNodes.length; index++) {
		const candidate = matches[index];
		if (candidate && canPatchMounted(candidate, nextVNodes[index]!)) reusable.add(candidate);
	}
	return { matches, oldKeyIndices, reusable };
}

/** Stops list children whose keys are not present in the next materialized list. */
export function stopRemovedListChildren<T>(mounted: Mounted, list: ListBinding<T>): void {
	const nextKeys = new Set(
		materializeList(list)
			.map((child) => child.key)
			.filter((key): key is string => key !== undefined)
	);
	for (const child of mounted.children) {
		if (child.vnode.key !== undefined && nextKeys.has(child.vnode.key)) continue;
		child.scope.stop();
	}
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
	if (mounted.vnode.type !== next.type || mounted.vnode.key !== next.key) return false;
	if (isCellVNode(next)) {
		const previousChild = mounted.children[0];
		return previousChild
			? canPatchMounted(
					previousChild,
					peek(() => getCellVNode(next))
				)
			: false;
	}
	return true;
}
