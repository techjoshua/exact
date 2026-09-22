import { type AnyComponentInstance, type Child } from '@exactjs/core';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import {
	createEnhancementChain,
	restoreMountedAuthoredOperation,
	withoutEnhancements
} from '../enhancement-chain.js';
import { findMountedOperation } from '../direct-enhancement.js';
import { installEnhancementRouteWatch } from '../enhancement-route-watch.js';
import { createMarker } from '../root-support.js';
import { adoptStaticChildrenRange } from './boundaries.js';
import {
	consumePreparedEnhancementBinding,
	preparedEnhancementBinding,
	preparedEnhancementEntries
} from '../prepared-output-bindings.js';

/** Reconstructs a selected structural chain while retaining the server's target and wrapper nodes. */
export function adoptStructuralEnhancement(
	root: Root,
	operation: Child,
	nodes: readonly Node[],
	cursor: number,
	parent: AnyComponentInstance | undefined,
	scope: EffectScope,
	end: number
): { mounted: Mounted; next: number } | undefined {
	// Component declarations are resolved after that component executes its own output exactly once.
	if (readCompiledComponentReceipt(operation)) return undefined;
	const binding = preparedEnhancementBinding(root, operation);
	const entries = preparedEnhancementEntries(root, operation);
	if (!entries.length) return undefined;
	const leaf = withoutEnhancements(operation);
	const ownedScope = createEffectScope(scope);
	try {
		const adopted = consumePreparedEnhancementBinding(root, operation, () =>
			adoptStaticChildrenRange(
				root,
				[createEnhancementChain(root, entries, leaf)],
				nodes,
				parent,
				ownedScope,
				false,
				cursor,
				end
			)
		);
		if (!adopted || adopted.mounts.length !== 1) {
			ownedScope.stop();
			return undefined;
		}
		const chain = adopted.mounts[0]!;
		const target = findMountedOperation(chain, leaf);
		if (!target) throw new Error('Hydrated enhancement did not retain its authored target');
		restoreMountedAuthoredOperation(target, operation);
		const physicalParent = chain.dom.parentNode!;
		const opening = createMarker(root, 'enhancement');
		const closing = createMarker(root, 'enhancement-end');
		physicalParent.insertBefore(opening, chain.dom);
		physicalParent.insertBefore(closing, (chain.end ?? chain.dom).nextSibling);
		const boundaries = new Map(
			entries.map((entry) => [entry.identity, [binding?.boundary ?? target]])
		);
		const mounted: Mounted = {
			dom: opening,
			end: closing,
			scope: ownedScope,
			children: [chain],
			enhancement: {
				operation,
				entries,
				target,
				boundaries,
				inheritedIdentities: new Set(binding?.entries.map((entry) => entry.identity))
			}
		};
		installEnhancementRouteWatch(root, mounted);
		return { mounted, next: adopted.next };
	} catch (error) {
		ownedScope.stop();
		throw error;
	}
}
