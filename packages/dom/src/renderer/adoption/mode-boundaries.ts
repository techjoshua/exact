import {
	type AnyComponentInstance,
	normalizeActivityMode,
	normalizeRenderResult,
	unwrap,
	type Child
} from '@exactjs/core';
import type {
	ExactActivityReceiptData,
	ExactSuspenseReceiptData
} from '@exactjs/core/runtime/component-operations';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { installActivity, prepareActivity } from '../activity.js';
import { mountChildren, mountDetachedChildren } from '../mounting/children.js';
import { detachMountedRanges } from '../retained-range.js';
import { commitPreparedSuspense, prepareSuspense } from '../suspense.js';
import { unmountMounted } from '../teardown.js';

type AdoptChildren = (
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	start?: number,
	end?: number
) => Mounted[] | undefined;

/** Adopts one SSR-emitted native Activity marker range. */
export function adoptActivityReceiptBoundary(
	root: Root,
	receipt: ExactActivityReceiptData,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	end: number,
	adoptChildren: AdoptChildren
): { mounted: Mounted; next: number } | undefined {
	const scope = createEffectScope(parentScope);
	const start = nodes[cursor];
	if (!(start instanceof Comment) || !start.data.startsWith('exact:activity:')) {
		scope.stop();
		return undefined;
	}
	const endIndex = closingBoundaryIndex(nodes, cursor, start.data, end);
	if (endIndex < 0) {
		scope.stop();
		return undefined;
	}
	const contentScope = createEffectScope(scope);
	const mode = normalizeActivityMode(unwrap(receipt.props.mode));
	const mounted: Mounted = {
		activityReceipt: receipt,
		dom: start,
		end: nodes[endIndex]!,
		scope,
		children: []
	};
	const activityOwner = prepareActivity(root, mounted, parentInstance, contentScope, mode);
	const activity = mounted.activity!;
	if (mode === 'active') {
		const children = adoptChildren(
			root,
			[...receipt.children],
			nodes,
			activityOwner,
			contentScope,
			cursor + 1,
			endIndex
		);
		if (!children) {
			scope.stop();
			return undefined;
		}
		mounted.children = children;
	} else {
		if (endIndex !== cursor + 1) {
			scope.stop();
			return undefined;
		}
		const fragment = document.createDocumentFragment();
		mounted.children = mountChildren(
			root,
			fragment,
			[...receipt.children],
			activityOwner,
			contentScope
		);
		const parent = start.parentNode;
		if (!parent) {
			scope.stop();
			return undefined;
		}
		for (const child of mounted.children) placeMountedBefore(root, parent, child, mounted.end);
		activity.retained = detachMountedRanges(mounted.children);
	}
	installActivity(root, mounted);
	return { mounted, next: endIndex + 1 };
}

/** Adopts one SSR-emitted native Suspense content or fallback marker range. */
export function adoptSuspenseReceiptBoundary(
	root: Root,
	receipt: ExactSuspenseReceiptData,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	end: number,
	adoptChildren: AdoptChildren
): { mounted: Mounted; next: number } | undefined {
	const scope = createEffectScope(parentScope);
	const start = nodes[cursor];
	if (
		!(start instanceof Comment) ||
		(!start.data.startsWith('exact:suspense-content:') &&
			!start.data.startsWith('exact:suspense-fallback:'))
	) {
		scope.stop();
		return undefined;
	}
	const endIndex = closingBoundaryIndex(nodes, cursor, start.data, end);
	if (endIndex < 0) {
		scope.stop();
		return undefined;
	}
	const mounted: Mounted = {
		suspenseReceipt: receipt,
		dom: start,
		end: nodes[endIndex]!,
		scope,
		children: []
	};
	prepareSuspense(root, mounted, parentInstance);
	const suspense = mounted.suspense!;
	if (start.data.startsWith('exact:suspense-content:')) {
		const children = adoptChildren(
			root,
			[...receipt.children],
			nodes,
			suspense.owner,
			scope,
			cursor + 1,
			endIndex
		);
		if (!children || suspense.coordinator.pending) {
			unmountMounted(mounted);
			return undefined;
		}
		mounted.children = children;
		suspense.revealed = true;
	} else {
		const candidate = mountDetachedChildren(
			root,
			[...receipt.children],
			suspense.owner,
			scope,
			start.parentNode ?? undefined
		);
		suspense.candidate = {
			generation: suspense.coordinator.generation,
			children: candidate
		};
		const fallback = adoptChildren(
			root,
			normalizeRenderResult(unwrap(receipt.props.fallback) as Child | Child[]),
			nodes,
			parentInstance,
			scope,
			cursor + 1,
			endIndex
		);
		if (!fallback) {
			unmountMounted(mounted);
			return undefined;
		}
		mounted.children = fallback;
		if (!suspense.coordinator.pending) queueMicrotask(() => commitPreparedSuspense(root, mounted));
	}
	suspense.owner.markMounted();
	return { mounted, next: endIndex + 1 };
}

/** Finds a boundary's closing marker without reading beyond its owning node range. */
function closingBoundaryIndex(
	nodes: readonly Node[],
	cursor: number,
	opening: string,
	end: number
): number {
	const closing = `/${opening}`;
	for (let index = cursor + 1; index < end; index++) {
		const node = nodes[index];
		if (node instanceof Comment && node.data === closing) return index;
	}
	return -1;
}
