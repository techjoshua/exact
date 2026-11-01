import { deriveRuntimeConfiguration } from '@exactjs/core/framework/configuration';
import type { RenderToStringOptions } from '../types.js';

/** An accepted occurrence counts actual output placements, never speculative input recipes. */
type Placement = { readonly input: unknown; count: number };
const placements = Symbol('SSR occurrence supplied placements');
type PlacementOptions = RenderToStringOptions & { readonly [placements]?: readonly Placement[] };

/** Retains one accepted effective input through this occurrence's actual descendant traversal. */
export function withSuppliedPlacementInput(
	options: RenderToStringOptions,
	input: unknown
): RenderToStringOptions {
	const previous = (options as PlacementOptions)[placements] ?? [];
	return deriveRuntimeConfiguration(options, () => ({
		[placements]: [...previous, { input, count: 0 }]
	}));
}

/**
 * Counts one actual raw placement or an issued Target's retained source argument. Matched checks
 * are absent only in the returned subtree view. Siblings keep the same accumulated counters.
 * This never samples, iterates or unwraps the input. Empty scalar inputs own no placement.
 */
export function consumeSuppliedPlacement(
	options: RenderToStringOptions,
	input: unknown
): RenderToStringOptions {
	const active = (options as PlacementOptions)[placements];
	if (!active || input === null || (typeof input !== 'object' && typeof input !== 'function'))
		return options;
	let remaining: Placement[] | undefined;
	for (let index = 0; index < active.length; index++) {
		const placement = active[index]!;
		if (Object.is(placement.input, input)) {
			if (++placement.count > 1)
				throw new TypeError('A supplied target cannot be placed more than once by one component');
			remaining ??= active.slice(0, index);
		} else remaining?.push(placement);
	}
	return remaining
		? deriveRuntimeConfiguration(options, () => ({ [placements]: remaining }))
		: options;
}
