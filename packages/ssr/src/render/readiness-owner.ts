import {
	type AnyComponentInstance,
	ReadinessContext,
	SuspensionContext,
	type Component,
	type ReadinessCoordinator
} from '@exactjs/core';
import { createExactInternalOwnerArtifact } from '@exactjs/core/framework/component-contracts';

/** Bridges one asynchronous SSR Suspense pass to the component readiness contexts. */
export const SsrReadinessOwner = createExactInternalOwnerArtifact(
	function SsrReadinessOwner(
		this: Component<Record<string, never>>,
		props: { context: ReadinessCoordinator['context'] }
	) {
		const owner = this as AnyComponentInstance;
		owner.contexts.set(ReadinessContext.id, props.context);
		owner.contexts.set(SuspensionContext.id, {
			suspend: (settlement: PromiseLike<unknown>) =>
				props.context.register({
					owner,
					taskGeneration: 0,
					settlement,
					retry: true
				})
		});
		return () => null;
	},
	'@exactjs/ssr:ReadinessOwner',
	'server'
);
