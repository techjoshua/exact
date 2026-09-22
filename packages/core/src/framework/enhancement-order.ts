import type { AnyComponentFunction, EnhancementEntry } from '../component/contracts.js';
import { readExactEnhancementContexts } from '../enhancements.js';

/**
 * Validates source-ordered peers before constructing any owner. Providers in the same chain must
 * precede their consumers; a conflict cannot be repaired by changing authored wrapper nesting.
 * External providers remain the ordinary context resolver's responsibility. Cost is linear in
 * entries and declared context effects, without constructing a dependency graph.
 */
export function assertEnhancementSourceOrder(
	entries: readonly EnhancementEntry[],
	catalog: ReadonlyMap<string, AnyComponentFunction>
): void {
	if (entries.length < 2) {
		if (entries.length && !catalog.has(entries[0]!.identity))
			throw new Error(`Enhancement is unavailable: ${entries[0]!.identity}`);
		return;
	}
	const firstProvider = new Map<symbol, { index: number; identity: string }>();
	const contracts = entries.map((entry, index) => {
		const component = catalog.get(entry.identity);
		if (!component) throw new Error(`Enhancement is unavailable: ${entry.identity}`);
		const contract = readExactEnhancementContexts(component);
		for (const token of contract?.provides ?? []) {
			if (!firstProvider.has(token)) firstProvider.set(token, { index, identity: entry.identity });
		}
		return contract;
	});
	for (let index = 0; index < entries.length; index++) {
		for (const token of contracts[index]?.requires ?? []) {
			const provider = firstProvider.get(token);
			if (provider && provider.index > index)
				throw new Error(
					`Enhancement source order conflict: ${entries[index]!.identity} requires context from later provider ${provider.identity}`
				);
		}
	}
}
