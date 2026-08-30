import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { readRenderProgramSlot } from '@exactjs/core/runtime/render-operations';
import { peek, withEffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../placement.js';
import type { Mounted, RenderProgramChildAnchor } from '../types.js';
import {
	mountComponentReceipt,
	receiveComponentReceipt
} from './mounting/native-component-artifact.js';
import { takeParkedOperation } from './mounting/operation-parking.js';
import { refreshProgramMountedChildren } from './render-program-children.js';
import { findProgramChildEnd } from './render-program-markers.js';
import { releaseMountedRange } from './retained-release.js';
import { disposeMounted } from './teardown.js';

/**
 * Installs one compiler-proven component receipt.
 *
 * The retained reaction evaluates only the parent expressions that produce the component's
 * inputs. A stable mounted child receives those inputs through its selected target artifact; the
 * parent never calculates the child's dirty operations or routes through structural normalization.
 */
export function bindProgramComponent(
	mounted: Mounted,
	index: number,
	initialBinding: boolean
): boolean {
	const applyComponent = prepareProgramComponentBinding(mounted, index, initialBinding);
	if (!applyComponent) return false;
	(mounted.renderProgram!.componentReceipts ??= [])[index] = applyComponent;
	applyComponent();
	return true;
}

/** Publishes the current inputs through one retained compiler-proven component receipt. */
export function applyProgramComponent(mounted: Mounted, index: number): boolean {
	const apply = mounted.renderProgram?.componentReceipts?.[index];
	if (!apply) return false;
	apply();
	return true;
}

/** Prepares one stable receipt operation for a compiler-owned component slot. */
function prepareProgramComponentBinding(
	mounted: Mounted,
	index: number,
	initialBinding: boolean
): (() => void) | undefined {
	const state = mounted.renderProgram!;
	const start = state.slotNodes[index];
	const anchor = isKeyedChildAnchor(start) ? start : undefined;
	const marker = start instanceof Node ? start : undefined;
	const identity = componentSlotIdentity(state, index, marker, anchor);
	if (identity === undefined) return undefined;
	const end = anchor ? undefined : findProgramChildEnd(marker, identity);
	const parent = anchor?.[0] ?? marker?.parentNode;
	const before = anchor ? null : end;
	if (!parent || (!anchor && (!(marker instanceof Comment) || !end))) return undefined;
	const childSlots = (state.childSlots ??= []);
	let childState = childSlots.find((candidate) => candidate.slot === index);
	if (!childState) {
		childState = { slot: index, parent, before: before ?? null, children: [] };
		childSlots.push(childState);
	}
	let skipAdoptedInitialReceipt = initialBinding && childState.children.length !== 0;
	return () => {
		const value = withEffectScope(mounted.scope, () =>
			readRenderProgramSlot(state.invocation, index)
		);
		const component = readCompiledComponentReceipt(value);
		if (!component) return;
		if (skipAdoptedInitialReceipt) {
			skipAdoptedInitialReceipt = false;
			childState.componentValue = component;
			return;
		}
		peek(() => {
			const current = childState.children.length === 1 ? childState.children[0] : undefined;
			const parked = takeParkedOperation(
				state.root,
				value as import('@exactjs/core').Child,
				state.parentInstance,
				mounted.scope
			);
			if (
				!parked &&
				current?.clientArtifact &&
				current.instance &&
				current.componentReceipt &&
				current.componentReceipt.contract.artifact === component.contract.artifact &&
				current.componentReceipt.key === component.key &&
				current.componentReceipt.domain === component.domain &&
				!componentIdentityChanged(current, component.props)
			) {
				receiveComponentReceipt(current, component);
			} else if (current) {
				const replacement =
					parked ??
					mountComponentReceipt(
						state.root,
						component,
						state.parentInstance,
						mounted.scope,
						childState.parent
					);
				placeMountedBefore(state.root, childState.parent, replacement, current.dom);
				if (!releaseMountedRange(state.root, childState.parent, current, 'reconcile-replaced'))
					disposeMounted(childState.parent, current);
				childState.children[0] = replacement;
			} else {
				const child =
					parked ??
					mountComponentReceipt(
						state.root,
						component,
						state.parentInstance,
						mounted.scope,
						childState.parent
					);
				placeMountedBefore(state.root, childState.parent, child, childState.before);
				childState.children.push(child);
			}
			childState.componentValue = component;
			childState.value = undefined;
			refreshProgramMountedChildren(mounted);
		});
	};
}

/** Compares only identity inputs declared by the selected target artifact. */
function componentIdentityChanged(
	mounted: Mounted,
	next: Readonly<Record<string, unknown>>
): boolean {
	const previous = mounted.componentReceipt?.props;
	const identities = mounted.clientArtifact?.identityProps;
	return (
		!!previous &&
		!!identities?.some((key) => !Object.is(Reflect.get(previous, key), Reflect.get(next, key)))
	);
}

/** Resolves only a compiler-declared component slot and its marker identity. */
function componentSlotIdentity(
	state: NonNullable<Mounted['renderProgram']>,
	index: number,
	marker: Node | undefined,
	anchor: RenderProgramChildAnchor | undefined
): string | undefined {
	if (!componentSlotIncludes(state.componentSlots, index)) return undefined;
	if (anchor) return '';
	if (!(marker instanceof Comment) || !marker.data.startsWith('x:')) return undefined;
	return marker.data.slice('x:'.length);
}

/** Tests membership in the compact or expanded compiler component-slot set. */
function componentSlotIncludes(
	slots: number | ReadonlySet<number> | undefined,
	index: number
): boolean {
	return typeof slots === 'number'
		? index < 31 && (slots & (1 << index)) !== 0
		: slots?.has(index) === true;
}

/** Narrows the alternate marker-free anchor representation. */
function isKeyedChildAnchor(
	value: Node | RenderProgramChildAnchor | undefined
): value is RenderProgramChildAnchor {
	return Array.isArray(value);
}
