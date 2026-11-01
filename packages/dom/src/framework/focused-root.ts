import type { Child } from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { flushSync } from '@exactjs/reactive/framework/runtime';
import { profileTimestamp, publishExactProfile } from '@exactjs/instrumentation';
import { placeMountedBefore } from '../placement.js';
import { exactDomInspectionOwner, registerInspectableRoot, roots } from '../state.js';
import type { RenderOptions } from '../types.js';
import { withDomWork } from '../renderer/limits.js';
import { mountDetachedOperation } from '../renderer/mounting/children.js';
import { patchChildren } from '../renderer/patching/children.js';
import { createRendererRoot, renderRootErrorView } from '../renderer/root-construction.js';
import { applyRootOptions } from './root-policy.js';

/** Executes one compiler-selected non-component root operation without reopening public rendering. */
export function renderFocusedOperationRoot(
	operation: Child,
	container: Element,
	options: RenderOptions
): void {
	let root = roots.get(container);
	if (root?.mode === 'document')
		throw new Error('eXact cannot replace a mounted Document root with a client operation root');
	if (!root) {
		root = createRendererRoot(container, operation, options, {
			version: 0,
			mode: 'client',
			inspection: options.inspection ?? exactDomInspectionOwner()
		});
		roots.set(container, root);
	}
	applyRootOptions(root, options);
	if (root.domain && componentDomainInspection(root.domain)) registerInspectableRoot(root);
	const logicalParent = options.logicalParent;
	const startedAt = profileTimestamp();
	withDomWork(root, () => {
		if (root!.mounted) {
			root!.mounted = patchChildren(
				root!,
				container,
				[root!.mounted],
				[operation],
				logicalParent,
				logicalParent?.scope
			)[0];
		} else {
			const mounted = mountDetachedOperation(
				root!,
				operation,
				logicalParent,
				logicalParent?.scope,
				container
			);
			placeMountedBefore(root!, container, mounted, null);
			root!.mounted = mounted;
		}
		renderRootErrorView(root!);
		flushSync();
	});
	root.current = operation;
	root.version++;
	root.initialCommitComplete = true;
	root.workBudget = undefined;
	publishExactProfile(root.onProfile, {
		subsystem: 'dom',
		phase: 'render',
		elapsedMs: profileTimestamp() - startedAt
	});
}
