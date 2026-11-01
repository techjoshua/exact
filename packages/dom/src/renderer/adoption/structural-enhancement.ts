import { readClientComponentInput } from '../component-input-admission.js';
import { type AnyComponentInstance, type Child, type EnhancementEntry } from '@exactjs/core';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import {
	createEnhancementChain,
	restoreMountedAuthoredOperation,
	withoutEnhancements
} from '../enhancement-chain.js';
import { invalidateEnhancementBindings } from '../enhancement-bindings.js';
import { findMountedOperation } from '../direct-enhancement.js';
import { resolveEnhancementTarget } from '../enhancement-targets.js';
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
	if (readClientComponentInput(operation)) return undefined;
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
		const physicalParent = chain.dom.parentNode!;
		const opening = createMarker(root, 'enhancement');
		const closing = createMarker(root, 'enhancement-end');
		physicalParent.insertBefore(opening, chain.dom);
		physicalParent.insertBefore(closing, (chain.end ?? chain.dom).nextSibling);
		const mounted: Mounted = {
			dom: opening,
			end: closing,
			scope: ownedScope,
			children: [chain]
		};
		const adoption = new StructuralEnhancementAdoption(root, mounted, {
			operation,
			leaf,
			entries,
			parent,
			binding
		});
		const target = adoption.resolveTarget();
		const plan = root.suppliedPlacementPlan;
		if (!target && plan?.pending && plan.isCurrent()) {
			mounted.pendingEnhancementAdoption = true;
			plan.own(mounted);
			plan.adoptEnhancement(adoption);
		} else adoption.commit(target);
		return { mounted, next: adopted.next };
	} catch (error) {
		ownedScope.stop();
		throw error;
	}
}

/** Concrete adopted chain whose semantic target is resolved after validated Target adoption. */
export class StructuralEnhancementAdoption {
	/** Provider lifecycle publication must follow completion of its adopted target links. */
	readonly owner: AnyComponentInstance | undefined;

	/** Retains the prepared authored operation and its unpublished adopted envelope. */
	constructor(
		private readonly root: Root,
		private readonly mounted: Mounted,
		private readonly input: {
			operation: Child;
			leaf: Child;
			entries: readonly EnhancementEntry[];
			parent: AnyComponentInstance | undefined;
			binding: ReturnType<typeof preparedEnhancementBinding>;
		}
	) {
		this.owner = mounted.children[0]?.instance;
	}

	/** Resolves the actual authored leaf or projected semantic target without executing its component. */
	resolveTarget(): Mounted | undefined {
		const { leaf, entries, parent } = this.input;
		const chain = this.mounted.children[0]!;
		if (this.mounted.pendingEnhancementAdoption) invalidateEnhancementBindings(chain);
		return (
			findMountedOperation(chain, leaf) ??
			resolveEnhancementTarget(chain, entries[entries.length - 1]!.identity, parent)?.mounted
		);
	}

	/** Completes only this still-live adopted chain, without reevaluating authored output. */
	commit(target?: Mounted): void {
		if (!this.mounted.scope.active) return;
		const { operation, entries, binding } = this.input;
		target ??= this.resolveTarget();
		if (!target) throw new Error('Hydrated enhancement did not retain its authored target');
		restoreMountedAuthoredOperation(target, operation);
		this.mounted.enhancement = {
			operation,
			entries,
			target,
			boundaries: new Map(entries.map((entry) => [entry.identity, [binding?.boundary ?? target]])),
			inheritedIdentities: new Set(binding?.entries.map((entry) => entry.identity))
		};
		delete this.mounted.pendingEnhancementAdoption;
		installEnhancementRouteWatch(this.root, this.mounted);
	}
}
