import {
	attemptCleanup,
	createCleanupFailure,
	throwCleanupFailure,
	type StopHandle
} from '@exactjs/core';
import type { Root } from '../types.js';

/**
 * Retains a foreign portal event container until its last logical portal releases it.
 * The root container retains its root lifetime. A lease releases once, and stale leases cannot
 * clear newer owners after root listener cleanup. Acquisition is constant time. Last release
 * removes this root's delegated listeners, with work proportional to its event types.
 */
export function retainPortalEventContainer(root: Root, container: Node): StopHandle {
	if (container === root.container) return () => undefined;
	const byContainer = (root.portalTargetOwners ??= new Map());
	let owners = byContainer.get(container);
	if (!owners) {
		owners = new Set();
		byContainer.set(container, owners);
	}
	root.portalTargets.add(container);
	let active = true;
	const release = () => {
		if (!active) return;
		active = false;
		const current = byContainer.get(container);
		if (!current?.delete(release) || current.size) return;
		byContainer.delete(container);
		root.portalTargets.delete(container);
		const listeners = root.delegated.get(container);
		root.delegated.delete(container);
		const failure = createCleanupFailure();
		for (const [type, listener] of listeners ?? [])
			attemptCleanup(failure, () => container.removeEventListener(type, listener));
		throwCleanupFailure(failure);
	};
	owners.add(release);
	return release;
}
