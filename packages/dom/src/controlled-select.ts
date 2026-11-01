import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Root } from './types.js';

/** A normalized value owned by the select's current property binding. */
type SelectValue = Readonly<{
	value: string;
	selected?: ReadonlySet<string>;
	scope?: EffectScope;
	root?: Root;
}>;

/** One physical-child reconciliation, fenced by its exact placement frame, handoff and property binding. */
export type ControlledSelectUpdate = Readonly<{
	value: SelectValue;
	attempt: Root['componentInputAttempt'];
	frame: Root['suppliedPlacementPlan'];
}>;

/** Normalized form-value ownership follows the control and is released on value removal or teardown. */
const values = new WeakMap<HTMLSelectElement, SelectValue>();

/** Captures coercions once at property evaluation, then applies the already evaluated value. */
export function setControlledSelectValue(
	root: Root | undefined,
	select: HTMLSelectElement,
	value: unknown,
	scope?: EffectScope
): void {
	const items = Array.isArray(value) ? value.map(String) : undefined;
	const scalar = items ? items.join(',') : String(value);
	const normalized: SelectValue = {
		value: scalar,
		selected: items ? new Set(items) : undefined,
		scope,
		root
	};
	values.delete(select);
	applySelectValue(select, normalized);
	values.set(select, normalized);
	if (root && (root.workDepth || root.suppliedPlacementPlan)) reconcileSelectChildren(root, select);
}

/** Stops retaining a removed value prop or a disposed control without touching its DOM. */
export function releaseControlledSelect(select: HTMLSelectElement): void {
	values.delete(select);
}

/**
 * Marks only the containing controlled select, without walking its descendants or reading props.
 * Child edits coalesce until the outer DOM work or validated supplied placement has committed.
 */
export function reconcileSelectChildren(root: Root | undefined, parent: Node): void {
	let node: Node | null = parent;
	while (node instanceof HTMLOptionElement || node instanceof HTMLOptGroupElement)
		node = node.parentNode;
	if (!(node instanceof HTMLSelectElement)) return;
	const value = values.get(node);
	if (!value) return;
	root ??= value.root;
	if (!root) return;
	const frame = root.suppliedPlacementPlan;
	if (frame && !frame.isCurrent()) return;
	if (root.workDepth || frame) {
		(root.controlledSelectUpdates ??= new Map()).set(node, {
			value,
			attempt: root.componentInputAttempt,
			frame
		});
	} else applySelectValue(node, value);
}

/** Text affects option identity only when that option has no explicit value attribute. */
export function reconcileSelectText(root: Root | undefined, parent: Node): void {
	if (parent instanceof HTMLOptionElement && !parent.hasAttribute('value'))
		reconcileSelectChildren(root, parent);
}

/** Publishes normalized selection only after physical children exist and the handoff is current. */
export function flushControlledSelects(root: Root, frame?: Root['suppliedPlacementPlan']): void {
	if (!frame && root.suppliedPlacementPlan?.pending) return;
	const updates = root.controlledSelectUpdates;
	for (const [select, update] of updates ?? []) {
		if (update.frame !== frame) continue;
		updates!.delete(select);
		if (
			update.attempt === root.componentInputAttempt &&
			!update.attempt?.disposed &&
			values.get(select) === update.value &&
			update.value.scope?.active !== false
		)
			applySelectValue(select, update.value);
	}
	if (!updates?.size) root.controlledSelectUpdates = undefined;
}

/** Discards unpublished reconciliation for a failed handoff, retaining any newer reentrant work. */
export function discardControlledSelects(
	root: Root,
	attempt: Root['componentInputAttempt'],
	frame?: Root['suppliedPlacementPlan']
): void {
	for (const [select, update] of root.controlledSelectUpdates ?? [])
		if (update.attempt === attempt && update.frame === frame)
			root.controlledSelectUpdates!.delete(select);
	if (!root.controlledSelectUpdates?.size) root.controlledSelectUpdates = undefined;
}

/** Writes selection differences only. An absent single value leaves no option selected. */
function applySelectValue(select: HTMLSelectElement, state: SelectValue): void {
	if (state.scope?.active === false) return;
	const value = state.value;
	if (select.multiple) {
		for (const option of Array.from(select.options)) {
			const selected = state.selected ? state.selected.has(option.value) : option.value === value;
			if (option.selected !== selected) option.selected = selected;
		}
	} else {
		// The empty string also describes no selection. Compare the selected option,
		// including first-match identity, rather than the ambiguous value getter.
		let selectedIndex = -1;
		for (let index = 0; index < select.options.length; index++) {
			if (select.options[index]!.value === value) {
				selectedIndex = index;
				break;
			}
		}
		if (select.selectedIndex !== selectedIndex) select.value = value;
	}
}
