import { installOwnedEventSubscription } from '../events.js';
import type { Mounted, Root } from '../types.js';

type Sources = NonNullable<Mounted['targetEventSources']>;

/**
 * Retains unchanged subscriptions in event order. Removing an owner releases only its listeners;
 * inserting or reordering a listener rebuilds the affected suffix to preserve dispatch order.
 */
export function reconcileTargetEvents(root: Root, mounted: Mounted, sources: Sources): void {
	const previous = mounted.targetEventSources ?? [];
	const releases = mounted.targetEventReleases ?? [];
	if (
		previous.length === sources.length &&
		previous.every((source, index) => sameEvent(source, sources[index]!))
	)
		return;
	const retained = new Set<number>();
	const next: Array<(() => void) | undefined> = [];
	let cursor = 0;
	let changedOrder = false;
	for (const source of sources) {
		let match = -1;
		if (!changedOrder) {
			for (let index = cursor; index < previous.length; index++) {
				if (!sameEvent(previous[index]!, source)) continue;
				match = index;
				break;
			}
		}
		if (match >= 0) {
			retained.add(match);
			cursor = match + 1;
			next.push(releases[match]);
		} else {
			changedOrder = true;
			next.push(undefined);
		}
	}
	for (let index = 0; index < releases.length; index++)
		if (!retained.has(index)) releases[index]!();
	mounted.targetEventSources = sources;
	mounted.targetEventReleases = sources.map(
		(source, index) =>
			next[index] ??
			installOwnedEventSubscription(
				root,
				mounted.dom as Element,
				source.key,
				source.source,
				source.owner,
				source.directInteraction
			)
	);
}

function sameEvent(left: Sources[number], right: Sources[number]): boolean {
	return (
		left.key === right.key &&
		left.source === right.source &&
		left.owner === right.owner &&
		left.directInteraction === right.directInteraction
	);
}
