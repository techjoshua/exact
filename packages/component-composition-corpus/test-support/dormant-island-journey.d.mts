import type { AnyComponentFunction } from '@exactjs/core';
import { createExactClient, lazyClientIsland } from '@exactjs/hydrate';

/** Runs browser-portable dormant ancestor and eager descendant ownership checks. */
export function verifyDormantIslandActivation(api: {
	createExactClient: typeof createExactClient;
	lazyClientIsland: typeof lazyClientIsland;
	Shell: AnyComponentFunction;
	Hover: AnyComponentFunction;
	reset: () => void;
	read: () => number;
}): Promise<void>;
