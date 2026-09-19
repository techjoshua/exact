import {
	consumePreparedEnhancementBinding,
	preparedEnhancementBinding,
	preparedEnhancementEntries
} from '../prepared-output-bindings.js';
import { installEnhancementRouteWatch } from '../enhancement-route-watch.js';
import { readExactEnhancementContexts, type AnyComponentInstance, type Child } from '@exactjs/core';
import { readCompiledFragmentReceipt } from '@exactjs/core/runtime/component-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import { restoreMountedAuthoredOperation, withoutEnhancements } from '../enhancement-chain.js';
import { findMountedOperation } from '../direct-enhancement.js';
import { mountPreparedFragmentEnhancements } from '../prepared-fragment-enhancements.js';
import { adoptStaticChildrenRange } from './boundaries.js';

/** Adopts compiler-proven transparent fragment peers without reconstructing their existing hosts. */
export function adoptPreparedEnhancement(
	root: Root,
	operation: Child,
	nodes: readonly Node[],
	cursor: number,
	parent: AnyComponentInstance | undefined,
	scope: EffectScope,
	end: number
): { mounted: Mounted; next: number } | undefined {
	if (!readCompiledFragmentReceipt(operation)) return undefined;
	const binding = preparedEnhancementBinding(root, operation);
	const entries = preparedEnhancementEntries(root, operation);
	if (
		!entries.length ||
		!entries.every(
			(entry) =>
				readExactEnhancementContexts(root.enhancementCatalog!.get(entry.identity)!)
					?.transparentTarget
		)
	)
		return undefined;
	const leaf = withoutEnhancements(operation);
	let next = cursor;
	const mounted = consumePreparedEnhancementBinding(root, operation, () =>
		mountPreparedFragmentEnhancements(
			root,
			entries,
			leaf,
			parent,
			scope,
			nodes[cursor]?.parentNode ?? undefined,
			new Map(),
			{
				attach(output, childScope) {
					const adopted = adoptStaticChildrenRange(
						root,
						[output],
						nodes,
						parent,
						childScope,
						false,
						cursor,
						end
					);
					if (!adopted || adopted.mounts.length !== 1)
						throw new Error('Prepared enhancement output does not match the server boundary');
					next = adopted.next;
					return adopted.mounts[0]!;
				}
			}
		)
	);
	const target = findMountedOperation(mounted, leaf);
	if (!target) throw new Error('Prepared enhancement did not retain its authored fragment');
	restoreMountedAuthoredOperation(target, operation);
	mounted.enhancement = {
		operation,
		entries,
		inheritedIdentities: new Set(binding?.entries.map((entry) => entry.identity)),
		target,
		boundaries: new Map(entries.map((entry) => [entry.identity, [binding?.boundary ?? target]]))
	};
	installEnhancementRouteWatch(root, mounted);
	return { mounted, next };
}
