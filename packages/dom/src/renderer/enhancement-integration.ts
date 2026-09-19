import { createTextEnhancementProjection } from './text-enhancement-projection.js';
import { registerSuppliedPlacementCapability } from './supplied-placement-capability.js';
import { suppliedPlacementCapability } from './supplied-placement.js';
import { invalidateEnhancementBindings } from './enhancement-bindings.js';
import { createFragmentTargetProjection } from '@exactjs/core/framework/render-structure';
import { withPreparedEnhancementBindings } from './prepared-output-bindings.js';
import { adoptStructuralEnhancement } from './adoption/structural-enhancement.js';
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
import { adoptPreparedEnhancement } from './adoption/prepared-enhancement.js';

const enhancementCapability: DomEnhancementCapability = Object.freeze({
	abi: 2 as const,
	has: (value) => childEnhancementEntries(value).length !== 0,
	install(root, mount) {
		root.enhancementCatalog ??= exactEnhancementCatalog;
		installEnhancementReconciliation(root, mount);
	},
	createTextProjection: createTextEnhancementProjection,
	adoptComponent: withPreparedEnhancementBindings,
	invalidate: invalidateEnhancementBindings,
	projectComponent(mounted, children) {
		const target = mounted.componentReceipt?.fragmentTarget;
		if (!target) return children;
		const project = (mounted.fragmentTargetProjection ??= createFragmentTargetProjection(
			() => mounted.componentReceipt!.fragmentTarget!.supplied,
			target.tag,
			mounted.instance
		));
		return project(children);
	},
	mountDirect: mountDirectEnhancementBoundary,
	adopt(root, ...args) {
		root.enhancementCatalog ??= exactEnhancementCatalog;
		return adoptPreparedEnhancement(root, ...args) ?? adoptStructuralEnhancement(root, ...args);
	},
	activate: activateEnhancementSubtree,
	patch: patchEnhancementBoundary
});

/** Installs the complete enhancement lifecycle for a compiler-resolved provider module. */
export function registerDomEnhancementIntegration(): void {
	registerSuppliedPlacementCapability(suppliedPlacementCapability);
	registerDomEnhancementCapability(enhancementCapability);
}
