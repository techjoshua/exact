import type { Root } from '../types.js';

/** Resolves a portal destination without inspecting any of its supplied children. */
export function portalTarget(value: { target: unknown }): Node {
	const target = value.target;
	if (!(target instanceof Node)) throw new TypeError('An eXact portal target must be a DOM Node');
	return target;
}

/** Runs target-owned work against the portal's effective delegated-event container. */
export function withEventContainer<T>(root: Root, container: Node, run: () => T): T {
	const previous = root.eventContainer;
	root.eventContainer = container;
	try {
		return run();
	} finally {
		root.eventContainer = previous;
	}
}

/** Selects the delegated-event container for a physical portal destination. */
export function portalEventContainer(root: Root, target: Node): Node {
	return root.container === target || root.container.contains(target) ? root.container : target;
}
