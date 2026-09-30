import type { Child } from '@exactjs/core';
import { resolveHydrateOptions } from '../config.js';
import type { HydrateOptions, HydrationRoot } from '../types.js';
import { createExactClientFromResolvedOptions } from './client.js';
import { hydrateWithClient } from './hydration.js';

/**
 * Connects a compiled component tree to its server-rendered DOM and returns its client root.
 * Discovers serialized hydration configuration automatically, including document-level scripts
 * beside the container. Explicit options configure the client and are checked against build
 * identity and authorization metadata from the server.
 * The returned root owns server requests, patches, and client islands. Call `dispose()` when
 * retiring it. The container must belong to the current document.
 * Lazy selections rendered by the server load before adoption. The root is returned immediately,
 * and its `whenSettled()` promise waits for those imports and adoption.
 */
export function hydrate(
	operation: Child,
	container: Element | Document,
	options: HydrateOptions = {}
): HydrationRoot {
	return hydrateWithClient(
		operation,
		container,
		options,
		createExactClientFromResolvedOptions,
		resolveHydrateOptions
	);
}
