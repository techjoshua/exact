import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import { disposeOwnedSubtree, exactDomInspectionOwner, unmount } from '@exactjs/dom/root';
import type { CoreHydrationRoot, HydrateOptions } from '../types.js';
import { createComponentResumptionResolver } from './resumption.js';
import { roots } from './state.js';

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
	const resumptions = [...(resolvedOptions.resumptions ?? [])];
	let disposed = false;
	const unsupportedDispatch = () =>
		Promise.reject(
			new Error(
				'This root was hydrated without server-operation capabilities; use @exactjs/hydrate for compiler-generated server work.'
			)
		);
	const domain = createFrameworkComponentDomain({
		executionRoot: resolvedOptions.executionRoot ?? 'page',
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
			return Promise.resolve();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			roots.delete(container);
			container.removeAttribute('data-exact-hydrated');
			disposeOwnedSubtree(container, false);
			unmount(container);
		}
	};
	if (roots.has(container)) throw new Error('An eXact hydration root is already registered here');
	roots.set(container, root);
	return root;
}
