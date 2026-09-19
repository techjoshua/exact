import { type AnyComponentInstance, type RootIntroduction } from '@exactjs/core';
import {
	disposeComponentRoot,
	publishComponentRoot,
	publishComponentRootPresentation
} from '@exactjs/core/framework/component-roots';
import { componentMounts } from '../state.js';
import type { Mounted, Root } from '../types.js';

/** Publishes the first intrinsic element in the component's current logical output. */
export function refreshComponentRoot(
	instance: AnyComponentInstance,
	presented = true,
	introduction: RootIntroduction = 'update'
): void {
	const mounted = componentMounts.get(instance);
	const target = mounted ? firstTargetPresentation(mounted) : undefined;
	const host = mounted ? firstHostElement(mounted) : undefined;
	if (mounted) mounted.componentRootCache = { target, host };
	publishComponentRoot(
		instance,
		target ?? host ?? (mounted ? textOrRangePresentation(mounted) : undefined),
		presented,
		introduction
	);
}

/** Local target placements never inherit an unrelated nested component's target preference. */
function firstTargetPresentation(mounted: Mounted): object | undefined {
	if (mounted.targetReceipt) {
		const selected = mounted.targetBoundary?.selected;
		return selected
			? mountedTargetPresentation(selected)
			: (firstHostElement(mounted) ?? textOrRangePresentation(mounted));
	}
	for (const child of mounted.children) {
		if (child.instance) continue;
		const presentation = firstTargetPresentation(child);
		if (presentation) return presentation;
	}
	return undefined;
}

/** Collects authored output nodes while excluding renderer bookkeeping anchors. */
function presentationNodes(mounted: Mounted, nodes: Node[]): void {
	if (mounted.textPresentation) {
		nodes.push(mounted.textPresentation);
		return;
	}
	if (mounted.scalar || mounted.intrinsicReceipt || mounted.renderProgram) {
		nodes.push(mounted.renderProgram?.programRoot ?? mounted.dom);
		return;
	}
	if (mounted.rawNodes) nodes.push(...mounted.rawNodes);
	for (const child of mounted.children) presentationNodes(child, nodes);
}

/** Retains an empty or multi-node logical range separately from its current physical first node. */
function textOrRangePresentation(mounted: Mounted): object | undefined {
	const nodes: Node[] = [];
	presentationNodes(mounted, nodes);
	if (nodes.length === 1 && nodes[0] instanceof Text) return nodes[0];
	if (!nodes.length && !hasFragmentPresentation(mounted)) return undefined;
	return (mounted.componentRootRange ??= Object.freeze({
		kind: 'range' as const,
		get nodes(): readonly Node[] {
			const current: Node[] = [];
			presentationNodes(mounted, current);
			return current;
		}
	}));
}

/** Classifies a newly mounted component root without exposing renderer internals to components. */
export function rootIntroduction(root: Root): RootIntroduction {
	if (root.initialCommitComplete) return 'update';
	return root.mode === 'hydrated' || root.mode === 'document' ? 'hydration' : 'initial';
}

/** Publishes retained-range presentation for a component and all of its descendants. */
export function setMountedRootPresentation(mounted: Mounted, presented: boolean): void {
	const pending = [mounted];
	while (pending.length) {
		const current = pending.pop()!;
		if (current.instance) publishComponentRootPresentation(current.instance, presented);
		for (const child of current.children) pending.push(child);
		for (const child of current.suspense?.candidate?.children ?? []) pending.push(child);
	}
}

/** Applies one renderer-owned activation blocker across a retained logical subtree. */
export function setMountedSubtreeActivity(
	mounted: Mounted,
	token: symbol,
	active: boolean,
	reason: string
): void {
	const pending = [mounted];
	while (pending.length) {
		const current = pending.pop()!;
		current.instance?.setActivity(token, active, reason);
		for (const child of current.children) pending.push(child);
		for (const child of current.suspense?.candidate?.children ?? []) pending.push(child);
	}
}

/** Releases the private lifecycle record after its owning component has unmounted. */
export function disposeMountedComponentRoot(instance: AnyComponentInstance): void {
	disposeComponentRoot(instance);
}

/** Finds the first intrinsic element while preserving logical traversal through framework ranges. */
export function firstHostElement(mounted: Mounted): Element | undefined {
	if (
		(mounted.intrinsicReceipt || mounted.renderProgram) &&
		(mounted.renderProgram?.programRoot ?? mounted.dom) instanceof Element
	)
		return (mounted.renderProgram?.programRoot ?? mounted.dom) as Element;
	if (mounted.scalar) return undefined;
	for (const child of mounted.children) {
		if (child.instance && child.componentRootCache) {
			if (child.componentRootCache.host) return child.componentRootCache.host;
			continue;
		}
		const element = firstHostElement(child);
		if (element) return element;
	}
	return undefined;
}

/** Empty authored fragments remain live ranges; an absent child does not become a root. */
function hasFragmentPresentation(mounted: Mounted): boolean {
	return mounted.fragmentReceipt !== undefined || mounted.children.some(hasFragmentPresentation);
}

/** Returns the local presentation of an already resolved target without selecting a descendant root. */
export function mountedTargetPresentation(mounted: Mounted): object | undefined {
	if (mounted.fragmentReceipt) {
		if (mounted.fragmentReceipt.presentation?.hosts.length) return firstHostElement(mounted);
		return textOrRangePresentation(mounted);
	}
	return mounted.renderProgram?.programRoot ?? mounted.dom;
}
