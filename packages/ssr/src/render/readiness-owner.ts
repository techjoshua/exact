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
		this.setContext(ReadinessContext, props.context);
		this.setContext(SuspensionContext, {
			suspend: (settlement) =>
				props.context.register({
					owner: this as unknown as AnyComponentInstance,
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
