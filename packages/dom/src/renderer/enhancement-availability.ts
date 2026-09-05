import { isExactEnhancementPassThrough } from '@exactjs/core';
import type { Mounted, Root } from '../types.js';
import { mountedEnhancementEntries } from './enhancement-chain.js';
import { walkMounted } from './enhancement-targets.js';

/** Reports declarations that cannot be resolved by this renderer without repeating warnings. */
export function reportUnavailableEnhancementDeclarations(root: Root, mounted: Mounted): void {
	walkMounted(mounted, undefined, undefined, 0, (current) => {
		for (const entry of mountedEnhancementEntries(current))
			reportUnavailableEnhancement(root, entry.identity);
	});
}

/** Reports one unavailable optional enhancement identity at most once per root. */
export function reportUnavailableEnhancement(root: Root, identity: string): void {
	if (isExactEnhancementPassThrough(root.enhancementCatalog?.get(identity))) return;
	root.unavailableEnhancements ??= new Set();
	if (root.unavailableEnhancements.has(identity)) return;
	root.unavailableEnhancements.add(identity);
	root.logger?.log({
		level: 'warn',
		message: `Optional renderer enhancement "${identity}" is unavailable`,
		scope: { source: 'framework', packageName: '@exactjs/dom', category: 'enhancement' }
	});
}

/** Resolves whether one catalog entry has an executable enhancement component. */
export function hasActiveEnhancement(root: Root, identity: string): boolean {
	const component = root.enhancementCatalog?.get(identity);
	return component !== undefined && !isExactEnhancementPassThrough(component);
}
