import type { EnhancementEntry } from '../component/contracts.js';

type Selection = { claimed: boolean };
const selections = new WeakMap<EnhancementEntry, Selection>();

/** Shares one unresolved bounded fallback across sequential prepared sibling candidates. */
export function fallbackEnhancementEntries(
	entry: EnhancementEntry,
	count: number
): EnhancementEntry[] {
	const selection = selections.get(entry) ?? { claimed: false };
	return Array.from({ length: count }, () => {
		const candidate = { ...entry };
		selections.set(candidate, selection);
		return candidate;
	});
}

/** A concrete target or authoritative explicit route prevents later sibling fallback. */
export function claimEnhancementFallback(entry: EnhancementEntry): EnhancementEntry {
	const selection = selections.get(entry);
	if (selection) selection.claimed = true;
	return { ...entry };
}

/** Tests eligibility without consuming an opaque component before it reveals any output. */
export function enhancementFallbackAvailable(entry: EnhancementEntry): boolean {
	return !selections.get(entry)?.claimed;
}

/** Carries unresolved selection through normalized component markers without exposing metadata. */
export function forwardEnhancementFallback(
	source: EnhancementEntry,
	target: EnhancementEntry
): void {
	const selection = selections.get(source);
	if (selection) selections.set(target, selection);
}

/** Restores shared fallback claims when an unpublished render or adoption attempt is retried. */
export function checkpointEnhancementFallback(entries: readonly EnhancementEntry[]): () => void {
	const snapshot = new Map<Selection, boolean>();
	for (const entry of entries) {
		const selection = selections.get(entry);
		if (selection) snapshot.set(selection, selection.claimed);
	}
	return () => {
		for (const [selection, claimed] of snapshot) selection.claimed = claimed;
	};
}
