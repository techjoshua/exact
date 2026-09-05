import {
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult,
	registerComponentSuspension,
	unwrap,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import type { ExactChildRangeReceiptData } from '@exactjs/core/runtime/component-operations';
import { peek, watchStructural, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { afterMountedChildren } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import { mountDetachedChildren } from './mounting/children.js';
import { patchChildren } from './patching/children.js';
import { createMarker } from './root-support.js';
import { refreshComponentRoot } from './component-roots.js';
import { disposeMounted } from './teardown.js';

/** Mounts one focused compiler-owned child-range operation. */
export function mountChildRangeReceipt(
	root: Root,
	receipt: ExactChildRangeReceiptData,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const mounted: Mounted = {
		childRangeReceipt: receipt,
		dom: createMarker(root, 'dynamic'),
		scope,
		children: []
	};
	const initial = rangeChildren(receipt, parentInstance, (registration) => {
		ownSuspensionRegistration(mounted, registration);
	});
	mounted.dynamicChildren = initial;
	mounted.children = mountDetachedChildren(root, initial, parentInstance, scope, parentNode);
	installRangeWatch(root, mounted, receipt, parentInstance);
	return mounted;
}

/** Rebinds a stable compiler-owned range to its next opaque authored value. */
export function patchChildRangeReceipt(
	root: Root,
	parent: Node,
	mounted: Mounted,
	receipt: ExactChildRangeReceiptData,
	parentInstance: AnyComponentInstance | undefined
): Mounted {
	mounted.stop?.();
	mounted.stop = undefined;
	mounted.childRangeReceipt = receipt;
	mounted.suspensionRegistration?.cancel();
	mounted.suspensionRegistration = undefined;
	const next = rangeChildren(receipt, parentInstance, (registration) => {
		ownSuspensionRegistration(mounted, registration);
	});
	mounted.dynamicChildren = next;
	mounted.children = patchChildren(
		root,
		parent,
		mounted.children,
		next,
		parentInstance,
		mounted.scope,
		afterMountedChildren(mounted),
		mounted
	);
	installRangeWatch(root, mounted, receipt, parentInstance, parent);
	return mounted;
}

function installRangeWatch(
	root: Root,
	mounted: Mounted,
	receipt: ExactChildRangeReceiptData,
	parentInstance: AnyComponentInstance | undefined,
	fallbackParent?: Node
): void {
	let reconciling = false;
	let pending: Child[] | undefined;
	const reconcile = () => {
		const next = rangeChildren(receipt, parentInstance, (registration) => {
			ownSuspensionRegistration(mounted, registration);
		});
		if (reconciling) {
			pending = next;
			return;
		}
		reconciling = true;
		try {
			let candidate: Child[] | undefined = next;
			while (candidate) {
				pending = undefined;
				if (!sameRangeChildren(mounted.dynamicChildren, candidate)) {
					const parent = mounted.dom.parentNode ?? fallbackParent;
					if (!parent) {
						for (const child of mounted.children)
							disposeMounted(document.createDocumentFragment(), child);
						mounted.dynamicChildren = candidate;
						mounted.children = mountDetachedChildren(
							root,
							candidate,
							parentInstance,
							mounted.scope
						);
						candidate = pending;
						continue;
					}
					mounted.dynamicChildren = candidate;
					mounted.children = peek(() =>
						patchChildren(
							root,
							parent,
							mounted.children,
							candidate!,
							parentInstance,
							mounted.scope,
							afterMountedChildren(mounted),
							mounted
						)
					);
					if (parentInstance) refreshComponentRoot(parentInstance);
				}
				candidate = pending;
			}
		} finally {
			reconciling = false;
			pending = undefined;
		}
	};
	mounted.stop = watchStructural(reconcile, {
		scope: mounted.scope,
		// A changed structural computed publishes before sibling binding computations settle. Fence
		// and replace its descendants immediately so queued work in their stopped scopes is skipped.
		onSchedule: reconcile
	});
}

/** Retains one cancellation handle per pending settlement owned by a compiled range. */
function ownSuspensionRegistration(
	mounted: Mounted,
	registration: import('@exactjs/core').ReadinessRegistration
): void {
	const previous = mounted.suspensionRegistration;
	if (previous?.settlement === registration.settlement) {
		registration.cancel();
		return;
	}
	previous?.cancel();
	mounted.suspensionRegistration = registration;
}

/** Installs retained updates after hydration has claimed a compiler-owned child range. */
export function installAdoptedChildRangeReceipt(
	root: Root,
	mounted: Mounted,
	receipt: ExactChildRangeReceiptData,
	parentInstance: AnyComponentInstance | undefined
): void {
	installRangeWatch(root, mounted, receipt, parentInstance, mounted.dom.parentNode ?? undefined);
}

/** Reads a range through the existing component error and suspension ownership. */
export function rangeChildren(
	receipt: ExactChildRangeReceiptData,
	parentInstance: AnyComponentInstance | undefined,
	onSuspension?: (registration: import('@exactjs/core').ReadinessRegistration) => void
): Child[] {
	const dynamic = receipt.dynamicComponent;
	if (dynamic?.inspection.status === 'pending') {
		const pending = dynamic.readiness?.();
		if (pending) {
			const registration = registerComponentSuspension(parentInstance, pending);
			if (registration !== true && registration !== false) onSuspension?.(registration);
		}
		return [];
	}
	if (dynamic?.inspection.status === 'failed') {
		const fallback = handleComponentError(
			parentInstance,
			createErrorReport(dynamic.inspection.error, 'render', parentInstance, 'dynamic-component')
		);
		return fallback ? normalizeRenderResult(fallback()) : [];
	}
	try {
		return normalizeRenderResult(unwrap(receipt.value) as Child | Child[]);
	} catch (error) {
		if (isPromiseLike(error)) {
			handleComponentSuspension(parentInstance, error);
			return [];
		}
		const fallback = handleComponentError(
			parentInstance,
			createErrorReport(error, 'render', parentInstance, 'compiled-child-range')
		);
		return fallback ? normalizeRenderResult(fallback()) : [];
	}
}

function sameRangeChildren(
	previous: readonly Child[] | undefined,
	next: readonly Child[]
): boolean {
	if (!previous || previous.length !== next.length) return false;
	for (let index = 0; index < next.length; index++)
		if (!Object.is(previous[index], next[index])) return false;
	return true;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}
