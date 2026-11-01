import { mountedDomNodes } from '../placement.js';
import { createMountedScope } from '../renderer/component-mount-ownership.js';
import {
	adoptDocumentCompiledComponentInputRoot,
	createComponentRootAdoption,
	type ComponentRootAdoption
} from '../renderer/adoption/component-receipt-root.js';
export {
	admitCompiledComponentInput,
	clientComponentRecipe
} from '../renderer/component-input-admission.js';
import { readClientComponentInput } from '../renderer/component-input-admission.js';
import { mountDetachedOperation } from '../renderer/mounting/children.js';
import type { Child } from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { flushSync, withEffectScope } from '@exactjs/reactive/framework/runtime';
import { profileTimestamp, publishExactProfile } from '@exactjs/instrumentation';
import { placeMountedBefore } from '../placement.js';
import { exactDomInspectionOwner, registerInspectableRoot, roots } from '../state.js';
import type { Mounted, RenderOptions } from '../types.js';
export type { RenderOptions } from '../types.js';
import { withDomWork } from '../renderer/limits.js';
import {
	mountComponentReceipt,
	receiveComponentReceipt
} from '../renderer/mounting/native-component-artifact.js';
import { createRendererRoot, renderRootErrorView } from '../renderer/root-construction.js';
import { disposeMounted, unmountMounted } from '../renderer/teardown.js';
import { createForeignReplacementParking } from '../renderer/patching/replacement-parking.js';
import { applyRootOptions } from './root-policy.js';
export {
	adoptCompiledComponentInputRoot,
	createComponentRootAdoption,
	captureComponentRootOwnership,
	captureComponentRootLifetime,
	type ComponentRootAdoption,
	adoptDocumentCompiledComponentInputRoot,
	adoptMarkerlessCompiledComponentInputRoot
} from '../renderer/adoption/component-receipt-root.js';
export { dispose, disposeOwnedSubtree, unmount } from '../renderer/root-disposal.js';
export { exactDomInspectionOwner } from '../state.js';
export { synchronizeFormBinding } from '../props.js';
export {
	consumeDomWork,
	createDomWorkBudget,
	walkDomSubtree,
	type DomWorkBudget
} from '../work.js';

/**
 * Mounts or updates a compiler-issued native component root without entering the generic child
 * renderer. The operation remains opaque; only the selected artifact's standard ABI is invoked.
 */
export function renderCompiledComponentInputRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {},
	ownership?: ComponentRootAdoption
): void {
	const receipt = readClientComponentInput(operation);
	if (!receipt)
		throw new TypeError('Compiled component root requires a compiler-issued component operation');
	let root = roots.get(container);
	const previousAttempt = root?.componentInputAttempt;
	const rootAttempt = { operation, deliveryStarted: false };
	const restoreUndelivered = () => {
		if (root?.componentInputAttempt === rootAttempt && !rootAttempt.deliveryStarted)
			root.componentInputAttempt = previousAttempt;
	};
	if (root) root.componentInputAttempt = rootAttempt;
	const ownAttempt = () => {
		if (ownership)
			ownership.isCurrent = () =>
				roots.get(container) === root && root?.componentInputAttempt === rootAttempt;
	};
	ownAttempt();
	if (root?.mode === 'document') {
		if (!root.initialCommitComplete) {
			// This is the actual receiving root scope, captured while the ambient scope is still
			// active and detached by the existing mount owner. It replaces, rather than supplements,
			// the scope the new adopter would otherwise create under the now-stopped reader.
			const receivingScope = createMountedScope(undefined);
			let transferred = false;
			try {
				roots.delete(container);
				const provisional = root.mounted;
				root.mounted = undefined;
				if (provisional) unmountMounted(provisional);
				if (roots.has(container)) return;
				const adoption = ownership ?? createComponentRootAdoption(container);
				const result = withEffectScope(receivingScope, () =>
					adoptDocumentCompiledComponentInputRoot(
						operation,
						container.ownerDocument,
						options,
						adoption,
						{ scope: receivingScope, intent: 'render-update' }
					)
				);
				transferred = result.outcome === 'adopted';
				if (result.outcome === 'mismatch')
					throw new Error('eXact cannot safely replace a mismatched Document root');
				return;
			} finally {
				if (!transferred) receivingScope.stop();
			}
		}
		applyRootOptions(root, options);
		if (
			root.mounted?.componentReceipt &&
			root.mounted.componentReceipt.contract.artifact === receipt.contract.artifact &&
			root.mounted.componentReceipt.key === receipt.key &&
			root.mounted.componentReceipt.domain === receipt.domain
		) {
			try {
				const delivery = receiveComponentReceipt(root.mounted, receipt, () => {
					rootAttempt.deliveryStarted = true;
				});
				flushSync();
				if (
					!delivery.committed ||
					!delivery.isCurrent() ||
					root.componentInputAttempt !== rootAttempt
				)
					return;
				root.current = operation;
				root.version++;
			} catch (error) {
				restoreUndelivered();
				throw error;
			}
			return;
		}
		throw new Error(
			'eXact cannot safely replace a mounted Document root with a different component artifact'
		);
	}
	if (!root) {
		root = createRendererRoot(container, operation, options, {
			version: 0,
			mode: 'client',
			inspection: options.inspection ?? exactDomInspectionOwner()
		});
		root.componentInputAttempt = rootAttempt;
		roots.set(container, root);
		ownAttempt();
		if (root.domain && componentDomainInspection(root.domain)) registerInspectableRoot(root);
	}
	applyRootOptions(root, options);
	if (root.domain && componentDomainInspection(root.domain)) registerInspectableRoot(root);
	const previous = root.mounted;
	const startedAt = profileTimestamp();
	if (
		root.initialCommitComplete &&
		previous?.instance &&
		previous.componentReceipt &&
		previous.componentReceipt.contract.artifact === receipt.contract.artifact &&
		previous.componentReceipt.key === receipt.key &&
		previous.componentReceipt.domain === receipt.domain
	) {
		let delivery: ReturnType<typeof receiveComponentReceipt> | undefined;
		try {
			withDomWork(root, () => {
				delivery = receiveComponentReceipt(previous, receipt, () => {
					rootAttempt.deliveryStarted = true;
				});
				flushSync();
			});
		} catch (error) {
			restoreUndelivered();
			throw error;
		}
		if (!delivery?.committed || !delivery.isCurrent() || root.componentInputAttempt !== rootAttempt)
			return;
	} else {
		const logicalParent = options.logicalParent;
		const previousParking = root.replacementParking;
		const parking = createRootReplacementParking(previous, container);
		root.replacementParking = parking;
		try {
			withDomWork(root, () => {
				const mounted = receipt.enhancement
					? mountDetachedOperation(root!, operation, logicalParent, undefined, container)
					: mountComponentReceipt(root!, receipt, logicalParent, undefined, container);
				if (root!.componentInputAttempt !== rootAttempt) {
					disposeMounted(container, mounted);
					return;
				}
				placeMountedBefore(root!, container, mounted, previous?.dom ?? null);
				root!.mounted = mounted;
				renderRootErrorView(root!);
				flushSync();
			});
		} catch (error) {
			if (root.componentInputAttempt === rootAttempt) {
				const failed = root.mounted;
				root.mounted = previous;
				if (failed && failed !== previous) disposeMounted(container, failed);
				if (!previous) {
					roots.delete(container);
					root.mounted = undefined;
				}
			}
			restoreUndelivered();
			throw error;
		} finally {
			root.replacementParking = previousParking;
		}
		if (root.componentInputAttempt !== rootAttempt) return;
		for (const commit of parking.commits) commit();
		if (previous) {
			// Committed transferred ranges must leave both the logical and initial input view.
			const successor = roots.get(container)?.mounted;
			if (previous.rawNodes && successor) {
				const retained = new Set(mountedDomNodes(successor));
				previous.rawNodes = previous.rawNodes.filter((node) => !retained.has(node));
			}
			disposeMounted(container, previous);
		}
		for (const remaining of parking.mounts.values())
			for (const parked of remaining) disposeMounted(parked.parent, parked.mounted);
	}
	if (root.componentInputAttempt !== rootAttempt) return;
	root.current = operation;
	root.version++;
	publishExactProfile(root.onProfile, {
		subsystem: 'dom',
		phase: 'render',
		elapsedMs: profileTimestamp() - startedAt
	});
	root.initialCommitComplete = true;
	root.workBudget = undefined;
}

function createRootReplacementParking(previous: Mounted | undefined, container: Element) {
	return previous
		? createForeignReplacementParking(previous, container)
		: {
				mounts: new Map<Child, Array<{ mounted: Mounted; parent: Node }>>(),
				commits: [] as Array<() => void>
			};
}

/**
 * Mounts or updates a compiler-issued component in this container, retaining a matching instance.
 * `unmount` releases the container's current renderer ownership. Invalid component input is
 * rejected before construction. Public callers do not supply a private hydration attempt.
 */
export function renderComponentRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): void {
	renderCompiledComponentInputRoot(operation, container, options);
}
