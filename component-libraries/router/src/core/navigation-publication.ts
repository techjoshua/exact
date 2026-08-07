import { createFrameworkPublicationCommit } from '@exactjs/core/framework/publication';
import type {
	CreateExactRouterOptions,
	ExactRouteDefinition,
	NavigationPublicationMetadata
} from './contracts.js';

/** Publishes one navigation commit exactly once through the optional framework coordinator. */
export async function publishRouterNavigation<Route extends ExactRouteDefinition>(input: {
	publication: CreateExactRouterOptions<Route>['publication'];
	signal: AbortSignal;
	metadata: NavigationPublicationMetadata;
	commit(): void;
}): Promise<void> {
	let published = false;
	const publish = () => {
		if (published) throw new Error('A navigation publication may commit only once');
		published = true;
		input.commit();
		return createFrameworkPublicationCommit();
	};
	if (input.publication) {
		await input.publication.publish({
			kind: 'navigation',
			signal: input.signal,
			metadata: input.metadata,
			publish
		});
	} else publish();
}

/** Creates the stable idle navigation state for a router transition generation. */
export function idleRouterNavigation(transitionId: number) {
	return Object.freeze({ state: 'idle' as const, transitionId });
}
