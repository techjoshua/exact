import type { Child } from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { flushSync } from '@exactjs/reactive/framework/runtime';
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
import { disposeMounted } from '../renderer/teardown.js';
import { createForeignReplacementParking } from '../renderer/patching/replacement-parking.js';
import { applyRootOptions, resolveRootRenderOptions } from './root-policy.js';
export {
	adoptCompiledComponentReceiptRoot,
	adoptDocumentCompiledComponentReceiptRoot,
	adoptMarkerlessCompiledComponentReceiptRoot
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
export function renderCompiledComponentRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): void {
	const receipt = readCompiledComponentReceipt(operation);
	if (!receipt)
		throw new TypeError('Compiled component root requires a compiler-issued component operation');
	let root = roots.get(container);
	const inspection = options.inspection ?? exactDomInspectionOwner();
	const effectiveOptions = resolveRootRenderOptions(receipt.domain, root, options, inspection);
	if (root?.mode === 'document') {
		applyRootOptions(root, effectiveOptions);
		if (
			root.mounted?.componentReceipt &&
			root.mounted.clientArtifact === receipt.contract.artifact &&
			root.mounted.componentReceipt.key === receipt.key &&
			root.mounted.componentReceipt.domain === receipt.domain
		) {
			const previousReceipt = root.mounted.componentReceipt;
			try {
				receiveComponentReceipt(root.mounted, receipt);
				flushSync();
				root.current = operation;
				root.version++;
			} catch (error) {
				root.mounted.componentReceipt = previousReceipt;
				throw error;
			}
			return;
		}
		throw new Error(
			'eXact cannot safely replace a mounted Document root with a different component artifact'
		);
	}
	if (!root) {
		root = createRendererRoot(container, operation, effectiveOptions, {
			version: 0,
			mode: 'client'
		});
		roots.set(container, root);
		if (root.domain && componentDomainInspection(root.domain)) registerInspectableRoot(root);
	}
	applyRootOptions(root, effectiveOptions);
	if (root.domain && componentDomainInspection(root.domain)) registerInspectableRoot(root);
	const previous = root.mounted;
	const startedAt = profileTimestamp();
	if (
		previous?.componentReceipt &&
		previous.clientArtifact === receipt.contract.artifact &&
		previous.componentReceipt.key === receipt.key &&
		previous.componentReceipt.domain === receipt.domain
	) {
		const previousReceipt = previous.componentReceipt;
		try {
			withDomWork(root, () => {
				receiveComponentReceipt(previous, receipt);
				flushSync();
			});
		} catch (error) {
			previous.componentReceipt = previousReceipt;
			throw error;
		}
	} else {
		const previousParking = root.replacementParking;
		const parking = createRootReplacementParking(previous, container);
		root.replacementParking = parking;
		try {
			withDomWork(root, () => {
				const mounted = mountComponentReceipt(
					root!,
					receipt,
					effectiveOptions.logicalParent,
					undefined,
					container
				);
				placeMountedBefore(root!, container, mounted, previous?.dom ?? null);
				root!.mounted = mounted;
				renderRootErrorView(root!);
				flushSync();
			});
		} finally {
			root.replacementParking = previousParking;
		}
		for (const commit of parking.commits) commit();
		if (previous) disposeMounted(container, previous);
		for (const remaining of parking.mounts.values())
			for (const parked of remaining) disposeMounted(parked.parent, parked.mounted);
	}
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

/** Updates mutable root policy without changing component or range ownership. */
