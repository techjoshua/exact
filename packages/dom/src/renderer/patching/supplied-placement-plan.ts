import type { StructuralEnhancementAdoption } from '../adoption/structural-enhancement.js';
import { flushControlledSelects, discardControlledSelects } from '../../controlled-select.js';
import { commitTargetAdoption, type PendingTargetAdoption } from '../adoption/native-receipt.js';
import { attemptCleanup, createCleanupFailure, throwCleanupFailure } from '@exactjs/core';
import { releaseMountedRange } from '../retained-release.js';
import type { AnyComponentInstance, RootIntroduction } from '@exactjs/core';
import { transferEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { refreshComponentRoot } from '../component-roots.js';
import { disposeMounted, unmountMounted } from '../teardown.js';
import { completeChildReconciliation } from './reconciliation-completion.js';

/** Concrete renderer work held while affected opaque receivers expose their actual output. */
type ChildSlot = NonNullable<NonNullable<Mounted['renderProgram']>['childSlots']>[number];
type AcceptedChildEdges = {
	owner: Mounted;
	children: Mounted[];
	slots: Array<{
		slot: NonNullable<ChildSlot>;
		children: Mounted[];
		value: NonNullable<ChildSlot>['value'];
		componentValue: NonNullable<ChildSlot>['componentValue'];
	}>;
};
type PlacementStep =
	| Readonly<{ kind: 'adopt-target'; entry: PendingTargetAdoption }>
	| Readonly<{ kind: 'adopt-enhancement'; adoption: StructuralEnhancementAdoption }>
	| Readonly<{ kind: 'mounted'; instance: AnyComponentInstance }>
	| Readonly<{ kind: 'place'; parent: Node; mounted: Mounted; before: Node | null }>
	| Readonly<{
			kind: 'remove';
			parent: Node;
			mounted: Mounted;
			reason: 'reconcile-removed' | 'reconcile-replaced';
	  }>
	| Readonly<{ kind: 'detach'; owner: Mounted; mounted: Mounted; scope: EffectScope | undefined }>
	| Readonly<{
			kind: 'present';
			instance: AnyComponentInstance;
			presented: boolean;
			introduction: RootIntroduction;
	  }>
	| Readonly<{
			kind: 'complete';
			instance: AnyComponentInstance | undefined;
			owner: Mounted | undefined;
	  }>;

type ConcretePlacement = Extract<PlacementStep, { kind: 'place' }>;

/**
 * One existing reconciliation frame's pending supplied placements. Ordinary receives run now.
 * Only concrete range placement, ownership transfer and presentation wait for final validation.
 * No authored callback, prop write or arbitrary DOM operation can be enqueued here.
 */
export class SuppliedPlacementPlan {
	private readonly steps: PlacementStep[] = [];
	private readonly enhancementAdoptions = new Map<
		AnyComponentInstance,
		StructuralEnhancementAdoption[]
	>();
	private readonly candidates = new Map<readonly Mounted[], readonly Mounted[]>();
	private readonly provisional = new Set<Mounted>();
	private readonly acceptedEdges = new Map<Mounted, AcceptedChildEdges>();
	private readonly claimed = new Set<Mounted>();
	/** Actual supplied owners whose final candidate output must be checked together. */
	readonly affected = new Set<Mounted>();
	/** Accepted placement locations captured before ordinary receives alter candidate metadata. */
	readonly previous = new Map<Mounted, Readonly<{ owner: Mounted; mounted: Mounted }>>();
	private phase: 'preparing' | 'committing' | 'committed' | 'aborted' = 'preparing';
	readonly attempt: Root['componentInputAttempt'];
	/** Existing reactive settlement closes retained sibling delivery, not ordinary receive effects. */
	settled: boolean;

	/** Captures the enclosing root handoff before any pending placement effects. */
	constructor(
		private readonly root: Root,
		readonly previousFrame?: SuppliedPlacementPlan
	) {
		this.attempt = root.componentInputAttempt;
		this.settled = !root.initialCommitComplete;
	}

	/** A newer root handoff or disposal invalidates every remaining action of this frame. */
	isCurrent(): boolean {
		return (
			this.phase !== 'aborted' &&
			this.root.componentInputAttempt === this.attempt &&
			!this.attempt?.disposed
		);
	}

	/** Reports whether renderer operations should append concrete work instead of publishing it. */
	get pending(): boolean {
		return this.phase === 'preparing';
	}

	/** Keeps supplied adoption distinct from ordinary input and property effects. */
	adoptTarget(entry: PendingTargetAdoption): void {
		this.steps.push({ kind: 'adopt-target', entry });
	}
	/** Resolves an adopted chain after its queued targets and before its provider's lifecycle. */
	adoptEnhancement(adoption: StructuralEnhancementAdoption): void {
		if (!adoption.owner) {
			this.steps.push({ kind: 'adopt-enhancement', adoption });
			return;
		}
		const pending = this.enhancementAdoptions.get(adoption.owner) ?? [];
		pending.push(adoption);
		this.enhancementAdoptions.set(adoption.owner, pending);
	}

	/** Completes concrete target links before this owner's presentation or mount callback. */
	private commitEnhancementAdoptions(instance: AnyComponentInstance): void {
		const pending = this.enhancementAdoptions.get(instance);
		this.enhancementAdoptions.delete(instance);
		for (const adoption of pending ?? []) {
			if (!this.isCurrent()) return;
			adoption.commit();
		}
	}

	/** Publishes the existing mount lifecycle only after affected placements are validated. */
	mounted(instance: AnyComponentInstance): void {
		this.steps.push({ kind: 'mounted', instance });
	}
	/** Retains accepted placement links before this existing child reconciliation mutates its view. */
	retainChildren(owner: Mounted | undefined): void {
		if (!owner || this.acceptedEdges.has(owner)) return;
		this.acceptedEdges.set(owner, {
			owner,
			children: [...owner.children],
			slots: (owner.renderProgram?.childSlots ?? []).flatMap((slot) =>
				slot
					? [
							{
								slot,
								children: [...slot.children],
								value: slot.value,
								componentValue: slot.componentValue
							}
						]
					: []
			)
		});
	}
	/** Retains the actual reconciled sequence before its caller assigns the child-slot view. */
	children(previous: readonly Mounted[], next: readonly Mounted[]): void {
		this.candidates.set(previous, next);
	}

	/** Reads the same concrete candidate slot sequences, without evaluating authored readers again. */
	readChildren(mounted: Mounted): readonly Mounted[] {
		const slots = mounted.renderProgram?.childSlots;
		if (slots)
			return slots.flatMap((slot) =>
				slot ? [...(this.candidates.get(slot.children) ?? slot.children)] : []
			);
		return this.candidates.get(mounted.children) ?? mounted.children;
	}

	/** Retains an unpublished new range for cleanup if this frame cannot commit. */
	own(mounted: Mounted): void {
		if (this.pending) {
			this.provisional.delete(mounted);
			this.provisional.add(mounted);
		}
	}

	/** Records one actual range and cursor without touching its physical placement. */
	place(parent: Node, mounted: Mounted, before: Node | null): void {
		this.steps.push({ kind: 'place', parent, mounted, before });
	}

	/** Defers teardown of a replaced or absent range until every affected candidate is validated. */
	remove(parent: Node, mounted: Mounted, reason: 'reconcile-removed' | 'reconcile-replaced'): void {
		this.steps.push({ kind: 'remove', parent, mounted, reason });
	}

	/** Reserves one existing owned range for the selected actual receiving occurrence. */
	claim(owner: Mounted, mounted: Mounted, scope: EffectScope | undefined): boolean {
		if (this.claimed.has(mounted)) return false;
		this.claimed.add(mounted);
		this.steps.push({ kind: 'detach', owner, mounted, scope });
		return true;
	}

	/** Holds presentation publication, including descendant component root handles. */
	present(
		instance: AnyComponentInstance,
		presented: boolean,
		introduction: RootIntroduction
	): void {
		this.steps.push({ kind: 'present', instance, presented, introduction });
	}

	/** Retains the existing reconciliation completion operation without introducing callback work. */
	complete(instance: AnyComponentInstance | undefined, owner: Mounted | undefined): void {
		this.steps.push({ kind: 'complete', instance, owner });
	}

	/** Applies only already validated placement decisions, checking supersession between effects. */
	commit(): void {
		if (!this.pending || !this.isCurrent()) {
			this.abort();
			return;
		}
		this.phase = 'committing';
		const latest = new Map<Mounted, ConcretePlacement>();
		const previous = new Map<ConcretePlacement, ConcretePlacement>();
		for (const step of this.steps) {
			if (step.kind !== 'place') continue;
			const earlier = latest.get(step.mounted);
			if (earlier) previous.set(step, earlier);
			latest.set(step.mounted, step);
		}
		const placed = new Set<ConcretePlacement>();
		// A wrapper can enter an enclosing range after that range's move was queued.
		// Assemble its descendants before moving the enclosing range, preserving the
		// authored order of successive destinations for the same range.
		const place = (step: ConcretePlacement): void => {
			if (placed.has(step) || !this.isCurrent()) return;
			const earlier = previous.get(step);
			if (earlier) place(earlier);
			const children = (owner: Mounted): void => {
				for (const child of owner.children) {
					const pending = latest.get(child);
					if (pending) place(pending);
					else children(child);
				}
			};
			children(step.mounted);
			if (!this.isCurrent()) return;
			placed.add(step);
			if (step.mounted.scope.active)
				placeMountedBefore(this.root, step.parent, step.mounted, step.before);
		};
		// Every selected occurrence is now validated. Detach claimed edges before any
		// obsolete ancestor range can dispose them, regardless of sibling delivery order.
		for (const step of this.steps) {
			if (step.kind !== 'detach') continue;
			if (!this.isCurrent()) {
				this.abort();
				return;
			}
			const index = step.owner.children.indexOf(step.mounted);
			if (index >= 0) step.owner.children.splice(index, 1);
			transferEffectScope(step.mounted.scope, step.scope);
		}
		for (const step of this.steps) {
			if (!this.isCurrent()) {
				this.abort();
				return;
			}
			switch (step.kind) {
				case 'adopt-target':
					commitTargetAdoption(this.root, step.entry);
					break;
				case 'adopt-enhancement':
					step.adoption.commit();
					break;
				case 'mounted':
					this.commitEnhancementAdoptions(step.instance);
					if (this.isCurrent() && step.instance.scope.active) step.instance.markMounted();
					break;
				case 'detach':
					break;
				case 'place':
					place(step);
					break;
				case 'remove':
					if (
						!this.claimed.has(step.mounted) &&
						!releaseMountedRange(this.root, step.parent, step.mounted, step.reason)
					)
						disposeMounted(step.parent, step.mounted);
					break;
				case 'present':
					this.commitEnhancementAdoptions(step.instance);
					if (this.isCurrent() && step.instance.scope.active)
						refreshComponentRoot(this.root, step.instance, step.presented, step.introduction);
					break;
				case 'complete':
					completeChildReconciliation(this.root, step.instance, step.owner);
					break;
			}
		}
		if (this.isCurrent()) flushControlledSelects(this.root, this);
		this.phase = 'committed';
		this.steps.length = 0;
		this.enhancementAdoptions.clear();
		this.provisional.clear();
		this.claimed.clear();
		this.candidates.clear();
		this.acceptedEdges.clear();
	}

	/** Releases unpublished ranges only. Accepted and claimed existing owners are not rolled back. */
	abort(): void {
		if (this.phase === 'committed' || this.phase === 'aborted') return;
		const restoreAccepted =
			this.phase === 'preparing' &&
			this.root.suppliedPlacementPlan === this &&
			this.root.componentInputAttempt === this.attempt &&
			!this.attempt?.disposed;
		this.phase = 'aborted';
		discardControlledSelects(this.root, this.attempt, this);
		// Placement has not committed. Restore only its retained child edges and slot cache,
		// never authored props, state, scalar writes or side effects from ordinary receive.
		if (restoreAccepted)
			for (const saved of this.acceptedEdges.values()) {
				if (!saved.owner.scope.active || this.provisional.has(saved.owner)) continue;
				saved.owner.children = saved.children;
				for (const entry of saved.slots) {
					entry.slot.children = entry.children;
					entry.slot.value = entry.value;
					entry.slot.componentValue = entry.componentValue;
				}
			}
		this.steps.length = 0;
		this.enhancementAdoptions.clear();
		// Claimed accepted ranges are referenced by the actual provisional output, but remain
		// owned by their accepted scope until commit. Abandon only the provisional edges.
		for (const owner of this.provisional)
			owner.children = owner.children.filter((child) => !this.claimed.has(child));
		const failure = createCleanupFailure();
		for (const mounted of [...this.provisional].reverse()) {
			if (
				!mounted.scope.active ||
				(this.root.componentInputAttempt !== this.attempt && mounted === this.root.mounted) ||
				this.claimed.has(mounted)
			)
				continue;
			attemptCleanup(failure, () => unmountMounted(mounted));
		}
		this.provisional.clear();
		this.claimed.clear();
		this.candidates.clear();
		this.acceptedEdges.clear();
		discardControlledSelects(this.root, this.attempt, this);
		throwCleanupFailure(failure);
	}
}
