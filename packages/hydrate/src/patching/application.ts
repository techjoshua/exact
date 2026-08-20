import { attemptCleanup, type CleanupFailure } from '@exactjs/core';
import { applyDomProp, disposeOwnedSubtree, type DomWorkBudget } from '@exactjs/dom';
import type { ExactPatch } from '@exactjs/core/framework/operation-protocol';
import { reindexList } from './indexing.js';
import {
	findClientBoundaryElement,
	findExactElement,
	findExactElementTarget,
	findExactItemRange,
	findExactRange,
	findExactTarget,
	findIndexedItem,
	findServerSlotElement
} from './lookup.js';
import {
	insertFragmentBefore,
	moveRangeBefore,
	replaceElement,
	replaceElementChildren,
	replaceRange
} from './mutation.js';
import { type PreparedPatch, type ProtocolIndex } from './planning.js';

/** Applies a patch to the owned runtime state. */
export function applyPatch(
	container: Element,
	patch: ExactPatch,
	index: ProtocolIndex,
	prepared: PreparedPatch | undefined,
	budget: DomWorkBudget,
	cleanupFailure: CleanupFailure
): boolean {
	if (patch.type === 'text') {
		const target =
			findExactTarget(container, patch.id, index) ??
			findServerSlotElement(container, patch.id, index);
		if (!target) return false;
		if (target instanceof Element)
			attemptCleanup(cleanupFailure, () => disposeOwnedSubtree(target, false, budget));
		target.textContent = patch.value;
		return true;
	}

	if (patch.type === 'prop') {
		const target = findExactElementTarget(container, patch.id, index);
		if (!target) return false;
		applyDomProp(target, patch.name, patch.value);
		return true;
	}

	if (patch.type === 'style') {
		const target = findExactElementTarget(container, patch.id, index) as HTMLElement | undefined;
		if (!target) return false;
		if (patch.value === null) target.style.removeProperty(patch.name);
		else target.style.setProperty(patch.name, patch.value);
		return true;
	}

	if (patch.type === 'replace') {
		const range = findExactRange(container, patch.id, index);
		if (!range) {
			const clientBoundary = findClientBoundaryElement(container, patch.id, index);
			if (clientBoundary) {
				replaceElement(clientBoundary, prepared?.fragment, budget, cleanupFailure);
				return true;
			}
			const exactElement = findExactElement(container, patch.id, index);
			if (exactElement) {
				replaceElement(exactElement, prepared?.fragment, budget, cleanupFailure);
				return true;
			}
			const slot = findServerSlotElement(container, patch.id, index);
			if (!slot) return false;
			replaceElementChildren(slot, prepared?.fragment, budget, cleanupFailure);
			return true;
		}
		replaceRange(range, prepared?.fragment, budget, cleanupFailure);
		return true;
	}

	if (patch.type === 'state') {
		const target = findExactElement(container, patch.id, index);
		if (!target) return false;
		target.setAttribute('data-exact-state', prepared!.stateJson!);
		return true;
	}

	if (patch.type === 'list') {
		const range = findExactRange(container, patch.id, index);
		if (!range) return false;
		if (patch.op === 'remove') {
			const item = index
				? findIndexedItem(index, patch.id, patch.key)
				: findExactItemRange(container, patch.key, range);
			if (!item) return false;
			replaceRange(item, undefined, budget, cleanupFailure);
			if (index) reindexList(index, patch.id);
			return true;
		}
		const before = patch.before
			? index
				? findIndexedItem(index, patch.id, patch.before)
				: findExactItemRange(container, patch.before, range)
			: undefined;
		const anchor = before?.start ?? range.end;
		if (patch.op === 'move') {
			const item = index
				? findIndexedItem(index, patch.id, patch.key)
				: findExactItemRange(container, patch.key, range);
			if (!item) {
				// A missing moved item can still be recovered if the server included fresh HTML.
				// This keeps list patching resilient across stale client snapshots.
				if (!patch.html) return false;
				insertFragmentBefore(anchor, prepared?.fragment);
				if (index) reindexList(index, patch.id);
				return true;
			}
			moveRangeBefore(item, anchor, budget);
			if (index) reindexList(index, patch.id);
			return true;
		}
		if (!patch.html) return false;
		insertFragmentBefore(anchor, prepared?.fragment);
		if (index) reindexList(index, patch.id);
		return true;
	}

	return false;
}
