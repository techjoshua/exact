import { afterReactiveSettlement } from '@exactjs/reactive/framework/settlement';
import { flushPlacementRetentions } from '../placement.js';
import { attachSuppressedCleanupFailure } from '@exactjs/core';
import { withDomWork } from './limits.js';
import { SuppliedPlacementPlan } from './patching/supplied-placement-plan.js';
import {
	unwrap,
	readExactEnhancementContexts,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import { assertSingleSuppliedPlacement } from '@exactjs/core/framework/render-structure';
import { readCompiledTargetReceipt } from '@exactjs/core/runtime/component-operations';
import {
	peek,
	registerEffectScopeCleanup,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { requireTargetDomCapability } from './target-capability.js';

type PlacementState = {
	owner: Mounted;
	root: Root;
	current?: object;
};
const placements = new WeakMap<AnyComponentInstance, PlacementState>();

/** Shared placement implementation installed by enhancement and Target entry points. */
export const suppliedPlacementCapability = Object.freeze({
	retain: retainSuppliedPlacement,
	validate: validateSuppliedPlacement,
	take: takeSuppliedPlacement,
	finish: finishSuppliedPlacementPlan,
	inputs: withSuppliedPlacementInputs
});

/** Retains one lazy structural validation only for supplied-target component owners. */
export function retainSuppliedPlacement(
	mounted: Mounted,
	_output: readonly Child[],
	root: Root
): void {
	const instance = mounted.instance;
	if (
		!instance ||
		!(
			mounted.componentReceipt?.transparentUpdateOwner ||
			mounted.clientArtifact?.capabilities.includes('targets')
		)
	)
		return;
	// One compiler-proven unconditional placement cannot duplicate or move between branches.
	// Cardinality of its supplied input is still checked by the target-receipt helper.
	if (
		mounted.clientArtifact &&
		readExactEnhancementContexts(mounted.clientArtifact.instantiate)?.transparentTarget
	)
		return;
	const existing = placements.get(instance);
	if (existing) {
		pendingPlan(root, existing);
		return;
	}
	const state: PlacementState = { owner: mounted, root };
	placements.set(instance, state);
	registerEffectScopeCleanup(mounted.scope, () => {
		placements.delete(instance);
	});
	pendingPlan(root, state).own(mounted);
}

/** Retains the accepted location before an actual candidate can change its structural metadata. */
function pendingPlan(root: Root, state: PlacementState): SuppliedPlacementPlan {
	let plan = root.suppliedPlacementPlan;
	if (plan && !plan.isCurrent()) {
		plan.abort();
		plan = undefined;
	}
	// A concrete target adoption may reveal its own receiving owner during commit.
	// It gets a nested preparation frame, then returns to this still-current commit.
	if (!plan || !plan.pending) {
		root.suppliedPlacementPlan = plan = new SuppliedPlacementPlan(root, plan);
		if (!plan.settled) {
			const selected = plan;
			// The existing scheduler coalesces this frame's one settlement request. It retains
			// typed placement decisions only, never arbitrary input-update callbacks.
			afterReactiveSettlement(() => {
				if (root.suppliedPlacementPlan !== selected || !selected.isCurrent()) {
					selected.abort();
					return;
				}
				selected.settled = true;
				if (root.workDepth === 0) {
					finishSuppliedPlacementPlan(root);
					if (!root.suppliedPlacementPlan?.pending) flushPlacementRetentions(root);
				}
			});
		}
	}
	if (!plan.affected.has(state.owner)) {
		const location = state.current && locatePlacement(state.owner, state.current);
		if (location)
			plan.previous.set(state.owner, {
				owner: location.owner,
				mounted: location.owner.children[location.index]!
			});
		plan.affected.add(state.owner);
	}
	return plan;
}

/** Retains every affected ancestor as pending until the existing frame has its actual output. */
export function validateSuppliedPlacement(
	owner: AnyComponentInstance | undefined,
	root: Root
): void {
	for (let current = owner; current; current = current.parent) {
		const state = placements.get(current);
		if (state) pendingPlan(root, state);
	}
}

/** Checks all affected actual outputs before any of their pending placements can commit. */
export function finishSuppliedPlacementPlan(root: Root): void {
	const plan = root.suppliedPlacementPlan;
	if (!plan?.pending || !plan.settled) return;
	const accepted: Array<Readonly<{ state: PlacementState; next: object | undefined }>> = [];
	try {
		for (const owner of plan.affected) {
			const state = owner.instance && placements.get(owner.instance);
			if (!state || !owner.scope.active) continue;
			const next = peek(() =>
				assertSingleSuppliedPlacement(
					plan.readChildren(owner),
					owner.instance!.props.children,
					(entry) => {
						const mounted = entry as Mounted;
						return { value: mounted.operation, children: plan.readChildren(mounted) };
					}
				)
			);
			if (!plan.isCurrent()) {
				plan.abort();
				return;
			}
			accepted.push({ state, next });
		}
		if (root.suppliedPlacementPlan !== plan || !plan.isCurrent()) {
			plan.abort();
			return;
		}
		for (const { state, next } of accepted) state.current = next;
		plan.commit();
	} catch (error) {
		try {
			plan.abort();
		} catch (cleanup) {
			attachSuppressedCleanupFailure(error, cleanup);
		}
		throw error;
	} finally {
		if (root.suppliedPlacementPlan === plan)
			root.suppliedPlacementPlan = plan.previousFrame?.isCurrent() ? plan.previousFrame : undefined;
	}
}

/** Reclaims a moved supplied boundary before constructing replacement output or lifecycle. */
export function takeSuppliedPlacement(
	root: Root,
	value: Child,
	owner: AnyComponentInstance | undefined,
	scope: EffectScope | undefined,
	parent: Node | undefined
): Mounted | undefined {
	const receipt = readCompiledTargetReceipt(value);
	if (!receipt) return;
	for (let current = owner; current; current = current.parent) {
		const state = placements.get(current);
		if (!state) continue;
		const selected = readCompiledTargetReceipt(state.current);
		if (
			!selected ||
			receipt.children.length !== selected.children.length ||
			!receipt.children.every((child, index) => unwrap(child) === unwrap(selected.children[index]))
		)
			continue;
		const plan = pendingPlan(root, state),
			previous = plan.previous.get(state.owner);
		if (!previous) continue;
		const mounted = previous.mounted;
		if (mounted.targetBoundary?.owner && mounted.targetBoundary.owner !== owner)
			throw new TypeError('A supplied owned value cannot relocate between component parents');
		if (!plan.claim(previous.owner, mounted, scope)) return;
		const previousParent = mounted.dom.parentNode ?? parent;
		if (!previousParent) return;
		requireTargetDomCapability().patch(root, previousParent, mounted, receipt, owner);
		mounted.operation = value;
		return mounted;
	}
}

/** Locates an already accepted actual placement through its retained mounted occurrences. */
function locatePlacement(
	owner: Mounted,
	operation: object
): { owner: Mounted; index: number } | undefined {
	const target = readCompiledTargetReceipt(operation);
	for (let index = 0; index < owner.children.length; index++) {
		const child = owner.children[index]!;
		if (
			child.operation === operation ||
			(target &&
				child.targetReceipt &&
				target.children.length === child.targetReceipt.children.length &&
				target.children.every(
					(value, i) => unwrap(value) === unwrap(child.targetReceipt!.children[i])
				))
		)
			return { owner, index };
		const nested = locatePlacement(child, operation);
		if (nested) return nested;
	}
}

/** Runs ordinary receive now while its affected supplied placements share one existing work frame. */
export function withSuppliedPlacementInputs<T>(
	owner: AnyComponentInstance | undefined,
	receive: () => T
): T {
	let state: PlacementState | undefined;
	for (let current = owner; current; current = current.parent) {
		state = placements.get(current);
		if (state) break;
	}
	if (!state) return receive();
	// Scalar-only receipt stays immediate and allocates no pending placement plan.
	// The first actual structural operation captures its accepted location before mutation.
	return withDomWork(state.root, receive);
}
