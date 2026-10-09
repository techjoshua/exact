/** Activates ancestor islands before their descendant, reusing eager work already in flight. */
export function hydrateIslandChain(
	boundary: Element,
	activate: (boundary: Element, event?: Event) => boolean | Promise<boolean>,
	pending: ReadonlyMap<Element, Promise<boolean>>,
	event?: Event
): boolean | Promise<boolean> {
	const existing = pending.get(boundary);
	if (existing) return existing;
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
	const pending = new Map<Element, Promise<boolean>>();
	let synchronous = 0;
	return {
		pending: pending as ReadonlyMap<Element, Promise<boolean>>,
		synchronousAdoptions: () => synchronous,
		adopt(boundary: Element, event?: Event, work?: Work): boolean | Promise<boolean> {
			const existing = pending.get(boundary);
			if (existing) return existing;
			const result = activate(boundary, event, work);
			if (!(result instanceof Promise)) {
				if (result) synchronous++;
				return result;
			}
			const owned = result.then(
				(mounted) => {
					pending.delete(boundary);
					return mounted;
				},
				(error) => {
					pending.delete(boundary);
					throw error;
				}
			);
			pending.set(boundary, owned);
			return owned;
		}
	};
}
