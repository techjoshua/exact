import { encodeExactMarkerPart } from '@exactjs/core';
import { reserveDomWork, walkDomSubtree, type DomWorkBudget } from '@exactjs/dom';
import type { ExactPatch } from '@exactjs/core/framework/operation-protocol';
import {
	findClientBoundaryElement,
	findExactElement,
	findExactElementTarget,
	findIndexedItem,
	findServerSlotElement
} from './lookup.js';
import { isValidListItemFragment, parseFragment } from './mutation.js';

/** Defines the exact range type contract. */
export type ExactRange = { start: Comment; end: Comment };

/** Defines the protocol index type contract. */
export type ProtocolIndex = {
	ranges: Map<string, ExactRange>;
	exactElements: Map<string, Element>;
	serverSlots: Map<string, Element>;
	clientBoundaries: Map<string, Element>;
	listItems: Map<string, Map<string, ExactRange>>;
	budget: DomWorkBudget;
};

/** Defines the prepared patch type contract. */
export type PreparedPatch = { fragment?: DocumentFragment; stateJson?: string };

/** Defines the prepared batch type contract. */
export type PreparedBatch = { ok: true; patches: PreparedPatch[] } | { ok: false; detail: string };

/** Resolves the indexed DOM target addressed by a hydration protocol operation. */
export function protocolTarget(index: ProtocolIndex, id: string): Node | ExactRange | undefined {
	return (
		index.ranges.get(id) ??
		index.exactElements.get(id) ??
		index.serverSlots.get(id) ??
		index.clientBoundaries.get(id)
	);
}

/** Reports whether one protocol target structurally contains another target. */
export function protocolTargetContains(
	container: Node | ExactRange,
	target: Node | ExactRange
): boolean {
	const targetNode = target instanceof Node ? target : target.start;
	if (container instanceof Node) return container === targetNode || container.contains(targetNode);
	if (targetNode === container.start || targetNode === container.end) return true;
	const parent = container.start.parentNode;
	if (!parent || container.end.parentNode !== parent) return false;
	let direct: Node | null = targetNode;
	while (direct?.parentNode && direct.parentNode !== parent) direct = direct.parentNode;
	if (!direct || direct.parentNode !== parent) return false;
	for (
		let cursor = container.start.nextSibling;
		cursor && cursor !== container.end;
		cursor = cursor.nextSibling
	) {
		if (cursor === direct) return true;
	}
	return false;
}

/** Reports whether apply patch. */
export function canApplyPatch(index: ProtocolIndex, patch: ExactPatch): boolean {
	if (patch.type === 'text')
		return (
			index.ranges.has(patch.id) ||
			index.exactElements.has(patch.id) ||
			index.serverSlots.has(patch.id)
		);
	if (patch.type === 'prop' || patch.type === 'style')
		return index.exactElements.has(patch.id) || index.ranges.has(patch.id);
	if (patch.type === 'replace')
		return (
			index.ranges.has(patch.id) ||
			index.exactElements.has(patch.id) ||
			index.serverSlots.has(patch.id) ||
			index.clientBoundaries.has(patch.id)
		);
	if (patch.type === 'state') return index.exactElements.has(patch.id);
	if (patch.type === 'list') {
		if (!index.ranges.has(patch.id)) return false;
		if (patch.op === 'insert')
			return !!patch.html && (!patch.before || !!findIndexedItem(index, patch.id, patch.before));
		const item = findIndexedItem(index, patch.id, patch.key);
		if (patch.op === 'remove') return !!item;
		return !!item || !!patch.html;
	}
	return false;
}

/** Validates patch sequence and throws when the contract is violated. */
export function validatePatchSequence(
	index: ProtocolIndex,
	patches: readonly ExactPatch[]
): boolean {
	const keys = new Map<string, Set<string>>();
	for (const [listId, items] of index.listItems) keys.set(listId, new Set(items.keys()));
	const has = (set: Set<string>, key: string | undefined) =>
		!key || set.has(key) || set.has(encodeExactMarkerPart(key));
	for (const patch of patches) {
		if (patch.type !== 'list') {
			if (!canApplyPatch(index, patch)) return false;
			continue;
		}
		if (!index.ranges.has(patch.id)) return false;
		let list = keys.get(patch.id);
		if (!list) keys.set(patch.id, (list = new Set()));
		if (!has(list, patch.before)) return false;
		if (patch.op === 'insert') {
			if (!patch.html || has(list, patch.key)) return false;
			list.add(patch.key);
		} else if (patch.op === 'remove') {
			if (!has(list, patch.key)) return false;
			list.delete(patch.key);
			list.delete(encodeExactMarkerPart(patch.key));
		} else if (!has(list, patch.key)) {
			if (!patch.html) return false;
			list.add(patch.key);
		}
	}
	return true;
}

/** Validates patch topology and throws when the contract is violated. */
export function validatePatchTopology(
	index: ProtocolIndex,
	patches: readonly ExactPatch[]
): boolean {
	const targets = patches.map((patch) => protocolTarget(index, patch.id));
	for (let left = 0; left < patches.length; left++) {
		const leftPatch = patches[left]!;
		if (!isStructuralPatch(leftPatch) || !targets[left]) continue;
		for (let right = 0; right < patches.length; right++) {
			if (left === right || !targets[right]) continue;
			const rightPatch = patches[right]!;
			if (leftPatch.type === 'list' && rightPatch.type === 'list' && leftPatch.id === rightPatch.id)
				continue;
			if (leftPatch.type === 'text' && leftPatch.id === rightPatch.id) continue;
			if (protocolTargetContains(targets[left]!, targets[right]!)) return false;
		}
	}
	return true;
}

/** Reports whether structural patch. */
export function isStructuralPatch(patch: ExactPatch): boolean {
	return patch.type === 'text' || patch.type === 'replace' || patch.type === 'list';
}

/** Validates and orders a patch batch before any DOM mutation becomes observable. */
export function preparePatchBatch(
	container: Element,
	index: ProtocolIndex,
	patches: readonly ExactPatch[]
): PreparedBatch {
	const prepared: PreparedPatch[] = [];
	let commitWork = 0;
	for (const patch of patches) {
		const item: PreparedPatch = {};
		let fragmentNodes = 0;
		if ((patch.type === 'replace' || patch.type === 'list') && patch.html) {
			const parent = fragmentContext(container, index, patch);
			if (!parent)
				return { ok: false, detail: `missing fragment context for ${patch.type}:${patch.id}` };
			const parsed = parseFragment(parent, patch.html, index.budget);
			if (patch.type === 'list' && !isValidListItemFragment(parsed.fragment, patch.key)) {
				return { ok: false, detail: `list fragment does not declare key ${patch.key}` };
			}
			item.fragment = parsed.fragment;
			fragmentNodes = parsed.nodeCount;
		}
		if (patch.type === 'prop') {
			const target = findExactElementTarget(container, patch.id, index);
			if (!target) return { ok: false, detail: `missing prop target ${patch.id}` };
			target.ownerDocument.createAttribute(patch.name);
		}
		if (patch.type === 'state') {
			const stateJson = JSON.stringify(patch.value);
			if (stateJson === undefined)
				return { ok: false, detail: `state ${patch.id} is not JSON serializable` };
			item.stateJson = stateJson;
		}
		const targetNodes = isStructuralPatch(patch) ? countProtocolTargetNodes(index, patch.id) : 0;
		const patchWork = isStructuralPatch(patch) ? targetNodes * 3 + fragmentNodes : 1;
		if (!Number.isSafeInteger(patchWork) || commitWork > Number.MAX_SAFE_INTEGER - patchWork) {
			return { ok: false, detail: 'patch work estimate exceeds the safe integer range' };
		}
		commitWork += patchWork;
		prepared.push(item);
	}
	reserveDomWork(index.budget, commitWork);
	return { ok: true, patches: prepared };
}

/** Performs the fragment context domain operation. */
export function fragmentContext(
	container: Element,
	index: ProtocolIndex,
	patch: ExactPatch
): Node | undefined {
	if (patch.type === 'list') return index.ranges.get(patch.id)?.end.parentNode ?? undefined;
	if (patch.type !== 'replace') return undefined;
	const range = index.ranges.get(patch.id);
	if (range) return range.end.parentNode ?? undefined;
	const clientBoundary = findClientBoundaryElement(container, patch.id, index);
	if (clientBoundary) return clientBoundary.parentNode ?? undefined;
	const exactElement = findExactElement(container, patch.id, index);
	if (exactElement) return exactElement.parentNode ?? undefined;
	return findServerSlotElement(container, patch.id, index);
}

/** Counts the concrete DOM nodes represented by a protocol target without mutating it. */
export function countProtocolTargetNodes(index: ProtocolIndex, id: string): number {
	const target = protocolTarget(index, id);
	if (!target) return 0;
	if (target instanceof Node)
		return walkDomSubtree(target, () => undefined, { budget: index.budget });
	let count = 0;
	for (let cursor: Node | null = target.start; cursor; cursor = cursor.nextSibling) {
		count += walkDomSubtree(cursor, () => undefined, { budget: index.budget });
		if (cursor === target.end) break;
	}
	return count;
}
