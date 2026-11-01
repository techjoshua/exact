/** A boundary generation owns its adoption wait while its module load remains shared. */
type PendingIslandAdoption = { generation: string | null; promise: Promise<boolean> };

/** Returns only work owned by the boundary's current generation. */
function currentAdoption(
	pending: ReadonlyMap<Element, PendingIslandAdoption>,
	boundary: Element
): PendingIslandAdoption | undefined {
	const entry = pending.get(boundary);
	return entry?.generation === boundary.getAttribute('data-exact-client-generation')
		? entry
		: undefined;
}

/** Activates ancestor islands before their descendant, reusing eager work already in flight. */
export function hydrateIslandChain(
	boundary: Element,
	activate: (boundary: Element, event?: Event) => boolean | Promise<boolean>,
	pending: ReadonlyMap<Element, PendingIslandAdoption>,
	event?: Event
): boolean | Promise<boolean> {
	const existing = currentAdoption(pending, boundary);
	if (existing) return existing.promise;
	const parent = boundary.parentElement?.closest('[data-exact-client-boundary], [data-xh]');
	if (parent && parent.getAttribute('data-exact-client-hydrated') !== 'true') {
		const parentResult = hydrateIslandChain(parent, activate, pending);
		if (parentResult instanceof Promise)
			return parentResult.then((hydrated) => (hydrated ? activate(boundary, event) : false));
		if (!parentResult) return false;
	}
	return activate(boundary, event);
}

/**
 * Shares actual boundary adoptions across ancestor chains and concurrent descendants.
 * Pending entries contain only one boundary's adoption, never a chain that waits for that boundary.
 * Rejections release ownership before propagation. The counter includes synchronous adoptions only.
 */
export function createIslandAdoptionTracker<Work>(
	activate: (boundary: Element, event?: Event, work?: Work) => boolean | Promise<boolean>
) {
	const pending = new Map<Element, PendingIslandAdoption>();
	let synchronous = 0;
	return {
		pending: pending as ReadonlyMap<Element, PendingIslandAdoption>,
		synchronousAdoptions: () => synchronous,
		adopt(boundary: Element, event?: Event, work?: Work): boolean | Promise<boolean> {
			const existing = currentAdoption(pending, boundary);
			if (existing) return existing.promise;
			const generation = boundary.getAttribute('data-exact-client-generation');
			const result = activate(boundary, event, work);
			if (!(result instanceof Promise)) {
				if (result) synchronous++;
				return result;
			}
			const owned = result.then(
				(mounted) => {
					if (pending.get(boundary) === entry) pending.delete(boundary);
					return mounted;
				},
				(error) => {
					if (pending.get(boundary) === entry) pending.delete(boundary);
					throw error;
				}
			);
			const entry = { generation, promise: owned };
			pending.set(boundary, entry);
			return owned;
		}
	};
}
