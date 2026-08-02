import { Text, type ComponentInstance, type RootIntroduction } from '@exactjs/core';
import {
	disposeComponentRoot,
	publishComponentRoot,
	publishComponentRootPresentation
} from '@exactjs/core/framework/component-roots';
import { componentMounts } from '../state.js';
import type { Mounted, Root } from '../types.js';

/** Publishes the first intrinsic element in the component's current logical output. */
export function refreshComponentRoot(
	instance: ComponentInstance<any>,
	presented = true,
	introduction: RootIntroduction = 'update'
): void {
	const mounted = componentMounts.get(instance);
	publishComponentRoot(
		instance,
		mounted ? firstHostElement(mounted) : undefined,
		presented,
		introduction
	);
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

/** Releases the private lifecycle record after its owning component has unmounted. */
export function disposeMountedComponentRoot(instance: ComponentInstance<any>): void {
	disposeComponentRoot(instance);
}

/** Finds the first intrinsic element while preserving logical traversal through framework ranges. */
export function firstHostElement(mounted: Mounted): Element | undefined {
	if (typeof mounted.vnode.type === 'string' && mounted.dom instanceof Element) return mounted.dom;
	if (mounted.vnode.type === Text) return undefined;
	for (const child of mounted.children) {
		const element = firstHostElement(child);
		if (element) return element;
	}
	return undefined;
}
