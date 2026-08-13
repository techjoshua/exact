import type {
	ClientIslandRegistry,
	ClientIslandRegistryEntry,
	ExactLazyEventPolicy
} from '../types.js';
import { isClientIslandLoader } from './loading.js';

const legacyInteractionPolicies = Object.freeze({
	click: Object.freeze({ type: 'click', replay: 'native-click' }),
	submit: Object.freeze({ type: 'submit', replay: 'request-submit' }),
	input: Object.freeze({ type: 'input', replay: 'latest-value' }),
	change: Object.freeze({ type: 'change', replay: 'latest-value' }),
	focus: Object.freeze({ type: 'focus', replay: 'notification' }),
	blur: Object.freeze({ type: 'blur', replay: 'notification' }),
	focusin: Object.freeze({ type: 'focusin', replay: 'notification' }),
	focusout: Object.freeze({ type: 'focusout', replay: 'notification' })
} satisfies Record<ExactLazyEventPolicy['type'], ExactLazyEventPolicy>);
const legacyInteractionEventTypes = Object.freeze(
	Object.keys(legacyInteractionPolicies) as ExactLazyEventPolicy['type'][]
);

/** Computes the smallest delegated listener set needed by one island registry. */
export function interactionEventTypes(
	registry: ClientIslandRegistry
): readonly ExactLazyEventPolicy['type'][] {
	const types = new Set<ExactLazyEventPolicy['type']>();
	for (const entry of Object.values(registry)) {
		if (!isClientIslandLoader(entry)) {
			for (const type of legacyInteractionEventTypes) types.add(type);
			continue;
		}
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
	// Already-loaded components have no deferred artifact to authorize. Their
	// legacy interaction marker retains only the bounded generated families.
	if (!isClientIslandLoader(entry))
		return legacyInteractionPolicies[type as keyof typeof legacyInteractionPolicies];
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
