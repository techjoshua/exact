import {
	type AnyComponentInstance,
	ReadinessContext,
	SuspensionContext,
	type ReadinessCoordinator
} from '@exactjs/core';
import { createFrameworkLogicalOwner } from '@exactjs/core/runtime/render';
import type { SsrContext } from '../types.js';

/** Creates the request-local logical owner for one asynchronous SSR Suspense pass. */
export function createSsrReadinessOwner(
	context: SsrContext,
	parent: AnyComponentInstance | undefined,
	readiness: ReadinessCoordinator['context']
): AnyComponentInstance {
	if (!context.componentDomain)
		throw new TypeError('SSR readiness ownership requires a component domain');
	return createFrameworkLogicalOwner(
		parent,
		context.componentContexts,
		context.componentDomain,
		(owner) => {
			owner.contexts.set(ReadinessContext.id, readiness);
			owner.contexts.set(SuspensionContext.id, {
				suspend: (settlement: PromiseLike<unknown>) =>
					readiness.register({
						owner,
						taskGeneration: 0,
						settlement,
						retry: true
					})
			});
		}
	);
}
