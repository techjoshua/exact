import type { ExactImportedComponentIR, ExactPlacement } from './types.js';

/** Combines child placements into the least-restrictive placement for a component graph. */
export function combinePlacements(placements: readonly ExactPlacement[]): ExactPlacement {
	let hasClient = false;
	let hasServer = false;
	let hasUnknown = false;
	for (const placement of placements) {
		if (placement === 'isomorphic') {
			hasClient = true;
			hasServer = true;
		} else if (placement === 'client') hasClient = true;
		else if (placement === 'server') hasServer = true;
		else hasUnknown = true;
	}
	if (hasClient && hasServer) return 'isomorphic';
	if (hasClient) return 'client';
	if (hasServer) return 'server';
	return hasUnknown ? 'unknown' : 'server';
}

/** Converts component metadata into the placement lookup used by emission. */
export function componentPlacementsFromInfo(
	componentInfo: ReadonlyMap<string, ExactImportedComponentIR>
): Map<string, ExactPlacement> {
	return new Map([...componentInfo].map(([name, component]) => [name, component.placement]));
}
