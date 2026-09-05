import type { Child } from '@exactjs/core';
import type { CoreHydrationRoot, HydrateOptions } from './types.js';
import { hydrateWithClient } from './runtime/hydration.js';
import { createHydrationOnlyClient } from './runtime/root-client.js';
import { resolveRootHydrateOptions } from './root-config.js';
export { readPublishedRootProps } from './root-config.js';
import { assertCurrentDocumentContainer } from './runtime/current-document.js';
import { deferHydrationAfterNavigation } from './runtime/deferred-hydration.js';

/**
 * Hydrates an SSR root while excluding optional server-operation, patch, and island runtimes.
 * Use the package's main entry when compiler-generated server work or client islands are present.
 */
export function hydrate(
	operation: Child,
	container: Element | Document,
	options: HydrateOptions = {}
): CoreHydrationRoot {
	return hydrateWithClient(
		operation,
		container,
		options,
		createHydrationOnlyClient,
		resolveRootHydrateOptions
	);
}

/**
 * Defers hydration beyond DOMContentLoaded while synchronously activating for an earlier user
 * interaction. The returned promise resolves to the owned root after the first trigger wins.
 */
export function hydrateAfterNavigation(
	operation: Child,
	container: Element,
	options: HydrateOptions = {}
): Promise<CoreHydrationRoot> {
	try {
		assertCurrentDocumentContainer(container);
	} catch (error) {
		return Promise.reject(error);
	}
	return deferHydrationAfterNavigation(() => hydrate(operation, container, options), container);
}

export type { CoreHydrationRoot, HydrateOptions } from './types.js';
