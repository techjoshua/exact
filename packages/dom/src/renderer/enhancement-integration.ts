import {
	registerDomEnhancementCapability,
	type DomEnhancementCapability
} from './enhancement-capability.js';
import { exactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import { mountDirectEnhancementBoundary } from './direct-enhancement.js';
import {
	activateEnhancementSubtree,
	installEnhancementReconciliation,
	patchEnhancementBoundary
} from './enhancements.js';
import { childEnhancementEntries } from './enhancement-chain.js';

const enhancementCapability: DomEnhancementCapability = Object.freeze({
	abi: 1 as const,
	has: (value) => childEnhancementEntries(value).length !== 0,
	install(root, mount) {
		root.enhancementCatalog ??= exactEnhancementCatalog;
		installEnhancementReconciliation(root, mount);
	},
	mountDirect: mountDirectEnhancementBoundary,
	activate: activateEnhancementSubtree,
	patch: patchEnhancementBoundary
});

/** Installs the complete enhancement lifecycle for a compiler-resolved provider module. */
export function registerDomEnhancementIntegration(): void {
	registerDomEnhancementCapability(enhancementCapability);
}
