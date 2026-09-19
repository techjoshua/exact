import {
	unwrap,
	readExactEnhancementContexts,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import { assertSingleSuppliedPlacement } from '@exactjs/core/framework/render-structure';
import { readCompiledTargetReceipt } from '@exactjs/core/runtime/component-operations';
import {
	computed,
	peek,
	registerEffectScopeCleanup,
	transferEffectScope,
	type EffectScope,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { requireTargetDomCapability } from './target-capability.js';
import { disposeMounted } from './teardown.js';

type PlacementState = {
	owner: Mounted;
	read: ReactiveValue<object | undefined>;
	current?: object;
	parked?: Mounted;
};
const placements = new WeakMap<AnyComponentInstance, PlacementState>();

/** Shared placement implementation installed by enhancement and Target entry points. */
export const suppliedPlacementCapability = Object.freeze({
	retain: retainSuppliedPlacement,
	validate: validateSuppliedPlacement,
	take: takeSuppliedPlacement
});

/** Retains one lazy structural validation only for supplied-target component owners. */
export function retainSuppliedPlacement(mounted: Mounted, output: readonly Child[]): void {
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
	const read = computed(() => assertSingleSuppliedPlacement(output, instance.props.children));
	const existing = placements.get(instance);
	if (existing) {
		existing.read = read;
		validateSuppliedPlacement(instance);
		return;
	}
	const state: PlacementState = { owner: mounted, read };
	placements.set(instance, state);
	registerEffectScopeCleanup(mounted.scope, () => {
		placements.delete(instance);
		const parked = state.parked;
		state.parked = undefined;
		if (parked) disposeMounted(parked.dom.parentNode ?? document.createDocumentFragment(), parked);
	});
	validateSuppliedPlacement(instance);
}

/**
 * Validates the final structural snapshot before mutation. A changed placement transfers the old
 * boundary into its component owner's scope until the new branch claims it. Scalar updates reuse
 * the computed result and leave an unchanged placement alone.
 */
export function validateSuppliedPlacement(owner: AnyComponentInstance | undefined): void {
	const state = owner && placements.get(owner);
	if (!state) return;
	const next = peek(() => state.read.get());
	if (next === state.current) return;
	const previous = state.current;
	state.current = next;
	if (!next && state.parked) {
		const parked = state.parked;
		state.parked = undefined;
		disposeMounted(parked.dom.parentNode ?? document.createDocumentFragment(), parked);
	}
	if (
		!previous ||
		!next ||
		!readCompiledTargetReceipt(next) ||
		!readCompiledTargetReceipt(previous)
	)
		return;
	const location = locatePlacement(state.owner, previous);
	if (!location) return;
	const [parked] = location.owner.children.splice(location.index, 1);
	transferEffectScope(parked!.scope, state.owner.scope);
	state.parked = parked;
}

/** Reclaims a moved supplied boundary before constructing replacement output or lifecycle. */
export function takeSuppliedPlacement(
	root: Root,
	value: Child,
	owner: AnyComponentInstance | undefined,
	scope: EffectScope | undefined,
	parent: Node | undefined
): Mounted | undefined {
	const state = owner && placements.get(owner);
	if (!state?.parked) return;
	const receipt = readCompiledTargetReceipt(value);
	const selected = readCompiledTargetReceipt(state.current);
	if (
		!receipt ||
		!selected ||
		receipt.children.length !== selected.children.length ||
		!receipt.children.every((child, index) => unwrap(child) === unwrap(selected.children[index]))
	)
		return;
	const mounted = state.parked;
	const previousParent = mounted.dom.parentNode ?? parent;
	if (!previousParent) return;
	state.parked = undefined;
	try {
		requireTargetDomCapability().patch(root, previousParent, mounted, receipt, owner);
		transferEffectScope(mounted.scope, scope);
		mounted.operation = value;
		return mounted;
	} catch (error) {
		state.parked = mounted;
		throw error;
	}
}

/** Searches this component's mounted frame without entering independently owned components. */
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
		if (child.instance) continue;
		const nested = locatePlacement(child, operation);
		if (nested) return nested;
	}
}
