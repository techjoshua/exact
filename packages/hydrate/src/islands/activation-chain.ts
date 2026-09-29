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
