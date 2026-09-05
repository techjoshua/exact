import type { ExactEndpointRoutes } from './types.js';

/** Merges endpoint routing maps without retaining either caller-owned container. */
export function mergeEndpointRoutes(
	base: ExactEndpointRoutes | undefined,
	override: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
	const invocations = {
		...(base?.invocations ?? {}),
		...(override?.invocations ?? {})
	};
	const boundaries = {
		...(base?.boundaries ?? {}),
		...(override?.boundaries ?? {})
	};
	return Object.keys(invocations).length || Object.keys(boundaries).length
		? {
				...(Object.keys(invocations).length ? { invocations } : {}),
				...(Object.keys(boundaries).length ? { boundaries } : {})
			}
		: undefined;
}

/** Clones endpoint routing maps so runtime mutation does not alter serialized config objects. */
export function cloneEndpointRoutes(
	routes: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
	return mergeEndpointRoutes(undefined, routes);
}
