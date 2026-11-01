import { HydrationSettlement } from './settlement.js';
import { createHydrationLifetime } from './root-lifetime.js';
import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import {
	disposeOwnedSubtree,
	exactDomInspectionOwner,
	unmount
} from '@exactjs/dom/framework/component-root';
import type { CoreHydrationRoot, HydrateOptions } from '../types.js';
import { createComponentResumptionResolver } from './resumption.js';
import { roots, hydrationOwnsDomRoot } from './state.js';

/**
 * Creates the ownership client used by hydration-only applications.
 *
 * This client deliberately excludes request dispatch, patch application, client islands, and
 * interaction replay. Compiler-generated server operations must use the complete hydration entry.
 */
export function createHydrationOnlyClient(
	container: Element,
	resolvedOptions: HydrateOptions
): CoreHydrationRoot {
	if (roots.has(container)) throw new Error('An eXact hydration root is already registered here');
	const resumptions = [...(resolvedOptions.resumptions ?? [])];
	let disposed = false;
	const lifetime = createHydrationLifetime(resolvedOptions.signal);
	const unsupportedDispatch = () =>
		Promise.reject(
			new Error(
				'This root was hydrated without server-operation capabilities; use @exactjs/hydrate for compiler-generated server work.'
			)
		);
	const domain = createFrameworkComponentDomain({
		executionRoot: resolvedOptions.executionRoot ?? 'page',
		logger: resolvedOptions.logger,
		dispatchContinuation: unsupportedDispatch,
		resumeComponent: createComponentResumptionResolver(() => resumptions),
		inspection:
			resolvedOptions.inspection ??
			exactDomInspectionOwner({
				buildKey: resolvedOptions.buildKey,
				executionRoot: resolvedOptions.executionRoot,
				binding: resolvedOptions.binding
			}),
		inspectionActivation: 'hydration',
		...(resolvedOptions.wallClockSnapshot === undefined
			? {}
			: { wallClockSnapshot: resolvedOptions.wallClockSnapshot })
	});
	const hydration = new HydrationSettlement(domain, lifetime.signal);
	resolvedOptions.componentDomain = domain;
	const root: CoreHydrationRoot = {
		domain,
		get pendingRequests() {
			return 0;
		},
		retire() {
			// A hydration-only root has no request admission surface to close.
		},
		whenSettled() {
			return hydration.whenSettled();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			lifetime.dispose();
			if (roots.get(container) === root) roots.delete(container);
			if (hydrationOwnsDomRoot(root)) container.removeAttribute('data-exact-hydrated');
			if (hydrationOwnsDomRoot(root)) {
				disposeOwnedSubtree(container, false);
				if (hydrationOwnsDomRoot(root)) unmount(container);
			}
		}
	};
	roots.set(container, root);
	return root;
}
