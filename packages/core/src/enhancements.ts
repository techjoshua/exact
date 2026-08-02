import type { EnhancementEntry, EnhancementMarker } from './component/contracts.js';

/** Creates the opaque grouped marker used by compiler-owned JSX enhancement lowering. */
export function createEnhancementMarker(entries: readonly EnhancementEntry[]): EnhancementMarker {
	const identities = new Set<string>();
	const normalized = entries.map((entry) => {
		if (!entry.identity) throw new TypeError('An enhancement entry requires a canonical identity');
		if (identities.has(entry.identity))
			throw new Error(`Duplicate enhancement identity "${entry.identity}" at one JSX boundary`);
		identities.add(entry.identity);
		return Object.freeze({
			identity: entry.identity,
			props: Object.freeze({ ...entry.props }),
			...(entry.root === undefined ? {} : { root: entry.root })
		});
	});
	return Object.freeze({ entries: Object.freeze(normalized) });
}
