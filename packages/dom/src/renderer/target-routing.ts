import { isTextTargetOutput } from '@exactjs/core/framework/render-structure';
import { createChildRangeReceipt } from '@exactjs/core/runtime/component-operations';
import { type AnyComponentInstance } from '@exactjs/core';
import type { Mounted } from '../types.js';

/** One mounted semantic target and the logical owner frame that selected it. */
export type MountedTarget = {
	readonly mounted: Mounted;
	readonly owner?: Mounted;
	readonly parentInstance?: AnyComponentInstance;
	readonly depth: number;
};

/** Target resolution that also retains the component frame owning the selected root. */
export type RoutedTarget = MountedTarget & { readonly frame: Mounted };

/** Resolves one `_target` boundary's children without treating the boundary itself as output. */
export function resolveTargetBoundary(
	boundary: Mounted,
	parentInstance: AnyComponentInstance | undefined,
	dependencies?: Set<Mounted>
): MountedTarget | undefined {
	for (const child of boundary.children) {
		const target = findTargetBoundaryChild(child, boundary, parentInstance, 1, dependencies);
		if (target) return target;
	}
	return undefined;
}

/** Resolves one logical target child without searching past an authoritative intrinsic. */
function findTargetBoundaryChild(
	mounted: Mounted,
	owner: Mounted | undefined,
	parentInstance: AnyComponentInstance | undefined,
	depth: number,
	dependencies?: Set<Mounted>
): MountedTarget | undefined {
	dependencies?.add(mounted);
	if (isMountedSemanticIntrinsic(mounted)) return { mounted, owner, parentInstance, depth };
	if (mounted.targetReceipt && mounted.targetBoundary?.selected)
		return locateMountedTarget(
			mounted,
			mounted.targetBoundary.selected,
			owner,
			parentInstance,
			depth,
			dependencies
		);
	if (mounted.fragmentReceipt || mounted.scalar) return { mounted, owner, parentInstance, depth };
	if (mounted.clientArtifact)
		return findRootBearingFrame(mounted, owner, parentInstance, depth, dependencies);

	const childInstance = mounted.instance ?? parentInstance;
	for (const child of mounted.children) {
		const target = findTargetBoundaryChild(child, mounted, childInstance, depth + 1, dependencies);
		if (target) return target;
	}
	return undefined;
}

/** Finds the bounded first-intrinsic path without inheriting nested placement preferences. */
export function findRootBearingFrame(
	boundary: Mounted,
	owner: Mounted | undefined,
	parentInstance: AnyComponentInstance | undefined,
	depth: number,
	dependencies?: Set<Mounted>
): RoutedTarget | undefined {
	dependencies?.add(boundary);
	const frame = boundary.clientArtifact ? boundary : undefined;
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
	for (const child of children) {
		const result = findTextRoot(
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

/** Text-only output and live empty fragments remain valid bounded roots. */
function findTextRoot(
	mounted: Mounted,
	owner: Mounted | undefined,
	parentInstance: AnyComponentInstance | undefined,
	depth: number,
	frame: Mounted | undefined,
	dependencies?: Set<Mounted>
): RoutedTarget | undefined {
	dependencies?.add(mounted);
	if (mounted.enhancement)
		return findTextRoot(
			mounted.enhancement.target,
			owner,
			parentInstance,
			depth,
			frame,
			dependencies
		);
	if (mounted.scalar) {
		mounted.operation ??= createChildRangeReceipt(mounted.scalarSource ?? mounted.scalarValue);
		return { mounted, owner, parentInstance, depth, frame: frame ?? owner ?? mounted };
	}
	if (
		mounted.fragmentReceipt ||
		(mounted.childRangeReceipt && isTextTargetOutput(mounted.childRangeReceipt.value))
	)
		return { mounted, owner, parentInstance, depth, frame: frame ?? owner ?? mounted };
	const instance = mounted.instance ?? parentInstance;
	for (const child of mounted.children) {
		const result = findTextRoot(
			child,
			mounted,
			instance,
			depth + 1,
			mounted.clientArtifact ? mounted : frame,
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
	parentInstance: AnyComponentInstance | undefined,
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
	parentInstance: AnyComponentInstance | undefined,
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
	if (isMountedSemanticIntrinsic(mounted)) {
		return { mounted, owner, parentInstance, depth, frame: frame ?? owner ?? mounted };
	}
	if (mounted.clientArtifact)
		return findRootBearingFrame(mounted, owner, parentInstance, depth, dependencies);
	const childInstance = mounted.instance ?? parentInstance;
	for (const child of mounted.children) {
		const result = findFirstRoot(child, mounted, childInstance, depth + 1, frame, dependencies);
		if (result) return result;
	}
	return undefined;
}

/** A compiled render program is the mounted semantic intrinsic represented by its physical root. */
export function isMountedSemanticIntrinsic(mounted: Mounted): boolean {
	return (
		mounted.intrinsicReceipt !== undefined || mounted.renderProgram?.programRoot instanceof Element
	);
}
