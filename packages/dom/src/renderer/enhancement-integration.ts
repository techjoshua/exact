import { registerDomEnhancementCapability } from './enhancement-capability.js';
import { exactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import {
	activateEnhancementSubtree,
	installEnhancementReconciliation,
	patchEnhancementBoundary
} from './enhancements.js';

/** Installs the complete enhancement lifecycle when a compiler-resolved provider is evaluated. */
registerDomEnhancementCapability(
	Object.freeze({
		abi: 1 as const,
		install(root, mount) {
			root.enhancementCatalog ??= exactEnhancementCatalog;
			installEnhancementReconciliation(root, mount);
		},
		activate: activateEnhancementSubtree,
		patch: patchEnhancementBoundary
	})
);
