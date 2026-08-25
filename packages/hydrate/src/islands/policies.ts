import type {
	ClientIslandRegistry,
	ClientIslandRegistryEntry,
	ExactLazyEventPolicy
} from '../types.js';
import { isClientIslandLoader } from './loading.js';

/** Computes the smallest delegated listener set needed by one island registry. */
export function interactionEventTypes(
	registry: ClientIslandRegistry
): readonly ExactLazyEventPolicy['type'][] {
	const types = new Set<ExactLazyEventPolicy['type']>();
	for (const entry of Object.values(registry)) {
		if (!isClientIslandLoader(entry)) continue;
		for (const target of entry.activation?.targets ?? [])
			for (const event of target.events) types.add(event.type);
	}
	return [...types];
}

/** Authorizes one captured event against compiler metadata for its exact target. */
export function interactionPolicyForEntry(
	boundary: Element,
	target: Element,
	type: string,
	entry: ClientIslandRegistryEntry
): ExactLazyEventPolicy | undefined {
	// Already-loaded components have no deferred artifact or event to replay.
	if (!isClientIslandLoader(entry)) return undefined;
	if (entry.activation?.mode !== 'interaction') return undefined;
	for (
		let cursor: Element | null = target;
		cursor && boundary.contains(cursor);
		cursor = cursor.parentElement
	) {
		const id = cursor.getAttribute('data-exact-id');
		if (!id) continue;
		const planned = entry.activation.targets.find((candidate) => candidate.id === id);
		const policy = planned?.events.find((candidate) => candidate.type === type);
		if (policy) return policy;
	}
	return undefined;
}
