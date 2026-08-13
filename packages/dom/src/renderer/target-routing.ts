import { Target, type ComponentInstance } from '@exactjs/core';
import type { Mounted } from '../types.js';

/** One mounted semantic target and the logical owner frame that selected it. */
export type MountedTarget = {
	readonly mounted: Mounted;
	readonly owner?: Mounted;
	readonly parentInstance?: ComponentInstance<any>;
	readonly depth: number;
};

/** Target resolution that also retains the component frame exporting the selected root. */
export type RoutedTarget = MountedTarget & { readonly frame: Mounted };

/** Resolves one `_target` boundary's children without treating the boundary itself as output. */
export function resolveTargetBoundary(
	boundary: Mounted,
	parentInstance: ComponentInstance<any> | undefined,
	dependencies?: Set<Mounted>
): MountedTarget | undefined {
	const nested = findFirstTargetExport(boundary, undefined, parentInstance, 0, true, dependencies);
	if (nested) return nested;
	for (const child of boundary.children) {
		const routed = findFirstRoot(child, boundary, parentInstance, 1, boundary, dependencies);
		if (routed) return routed;
	}
	return undefined;
}

/** Finds the first explicit target exported by a mounted logical subtree. */
export function findFirstTargetExport(
	boundary: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	skipBoundary = false,
	dependencies?: Set<Mounted>
): MountedTarget | undefined {
	dependencies?.add(boundary);
	if (!skipBoundary && boundary.vnode.type === Target && boundary.targetBoundary?.selected)
		return locateMountedTarget(
			boundary,
			boundary.targetBoundary.selected,
			owner,
			parentInstance,
			depth,
			dependencies
		);
	const childInstance = boundary.instance ?? parentInstance;
	for (const child of boundary.children) {
		const result = findFirstTargetExport(
			child,
			boundary,
			childInstance,
			depth + 1,
			false,
			dependencies
		);
		if (result) return result;
	}
	return undefined;
}

/** Finds the bounded first-root frame used when a component does not export an explicit target. */
export function findRootBearingFrame(
	boundary: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	dependencies?: Set<Mounted>
): RoutedTarget | undefined {
	dependencies?.add(boundary);
	const frame = typeof boundary.vnode.type === 'function' ? boundary : undefined;
	const children = frame ? boundary.children : [boundary];
	const instance = frame?.instance ?? parentInstance;
	for (const child of children) {
		const result = findFirstRoot(
			child,
			frame ?? owner,
			instance,
			depth + (frame ? 1 : 0),
			frame,
			dependencies
		);
		if (result) return result;
	}
	return undefined;
}

function locateMountedTarget(
	boundary: Mounted,
	target: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	dependencies?: Set<Mounted>
): MountedTarget | undefined {
	dependencies?.add(boundary);
	if (boundary === target) return { mounted: boundary, owner, parentInstance, depth };
	const childInstance = boundary.instance ?? parentInstance;
	for (const child of boundary.children) {
		const result = locateMountedTarget(
			child,
			target,
			boundary,
			childInstance,
			depth + 1,
			dependencies
		);
		if (result) return result;
	}
	return undefined;
}

function findFirstRoot(
	mounted: Mounted,
	owner: Mounted | undefined,
	parentInstance: ComponentInstance<any> | undefined,
	depth: number,
	frame: Mounted | undefined,
	dependencies?: Set<Mounted>
): RoutedTarget | undefined {
	dependencies?.add(mounted);
	if (mounted.enhancement)
		return findFirstRoot(
			mounted.enhancement.target,
			owner,
			parentInstance,
			depth,
			frame,
			dependencies
		);
	if (typeof mounted.vnode.type === 'string') {
		return { mounted, owner, parentInstance, depth, frame: frame ?? owner ?? mounted };
	}
	if (typeof mounted.vnode.type === 'function')
		return findRootBearingFrame(mounted, owner, parentInstance, depth, dependencies);
	const childInstance = mounted.instance ?? parentInstance;
	for (const child of mounted.children) {
		const result = findFirstRoot(child, mounted, childInstance, depth + 1, frame, dependencies);
		if (result) return result;
	}
	return undefined;
}
