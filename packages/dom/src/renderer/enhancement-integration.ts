import {
	registerDomEnhancementCapability,
	type DomEnhancementCapability
} from './enhancement-capability.js';
import { exactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import {
	activateEnhancementSubtree,
	installEnhancementReconciliation,
	patchEnhancementBoundary
} from './enhancements.js';

const enhancementCapability: DomEnhancementCapability = Object.freeze({
	abi: 1 as const,
	install(root, mount) {
		root.enhancementCatalog ??= exactEnhancementCatalog;
		installEnhancementReconciliation(root, mount);
	},
	activate: activateEnhancementSubtree,
	patch: patchEnhancementBoundary
});

/** Installs the complete enhancement lifecycle for a compiler-resolved provider module. */
export function registerDomEnhancementIntegration(): void {
	registerDomEnhancementCapability(enhancementCapability);
}

registerDomEnhancementIntegration();
