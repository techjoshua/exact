import {
	createCleanupFailure,
	logFrameworkEvent,
	throwCleanupFailure,
	type Logger
} from '@exact/core';
import { createDomWorkBudget, walkDomSubtree, type DomWorkBudget } from '@exact/dom';
import type { ExactPatch } from '@exact/server';
import type { HydrationDiagnostic } from '../types.js';
import { applyPatch } from './application.js';
import { createProtocolIndex } from './indexing.js';
import { findClientBoundaryElement, findServerSlotElement } from './lookup.js';
import {
	canApplyPatch,
	preparePatchBatch,
	protocolTarget,
	protocolTargetContains,
	validatePatchSequence,
	validatePatchTopology,
	type ExactRange,
	type ProtocolIndex
} from './planning.js';

export type PatchOptions = {
	logger?: Logger;
	onMismatch?: 'replace' | 'throw';
	onDiagnostic?: (diagnostic: HydrationDiagnostic) => void;
	maxTreeNodes?: number;
	workBudget?: DomWorkBudget;
};

export function applyPatches(
	container: Element,
	patches: readonly ExactPatch[],
	options: PatchOptions = {}
): boolean {
	if (!patches.length) return true;
	const index = createProtocolIndex(container, options.workBudget ?? options.maxTreeNodes);
	if (!index || !validatePatchSequence(index, patches) || !validatePatchTopology(index, patches)) {
		const failed = patches.find((patch) => !index || !canApplyPatch(index, patch));
		const detail = failed ? `${failed.type}:${failed.id}` : 'invalid marker topology';
		reportMismatch(
			options,
			`could not atomically apply exact patches (${detail})`,
			'invalid-patch',
			failed
		);
		if (options.onMismatch === 'throw')
			throw new Error(`Could not apply exact patch batch (${detail})`);
		return false;
	}

	const prepared = preparePatchBatch(container, index, patches);
	if (!prepared.ok) {
		reportMismatch(
			options,
			`could not atomically apply exact patches (${prepared.detail})`,
			'invalid-patch'
		);
		if (options.onMismatch === 'throw')
			throw new Error(`Could not apply exact patch batch (${prepared.detail})`);
		return false;
	}

	// Patches target compiler-owned server boundaries. Disposing the containing
	// renderer root here would tear down unrelated client components even for a
	// text/attribute patch and leave retained DOM inert.
	const cleanupFailure = createCleanupFailure();
	const commitBudget = createDomWorkBudget(Number.MAX_SAFE_INTEGER);
	for (let patchIndex = 0; patchIndex < patches.length; patchIndex++) {
		const patch = patches[patchIndex]!;
		const ok = applyPatch(
			container,
			patch,
			index,
			prepared.patches[patchIndex],
			commitBudget,
			cleanupFailure
		);
		if (!ok) {
			throw new Error(`Prepared exact patch invariant failed for ${patch.type}:${patch.id}`);
		}
	}
	throwCleanupFailure(cleanupFailure);
	return true;
}

export function hasExactMarkers(container: Element, work?: number | DomWorkBudget): boolean {
	let found = false;
	walkDomSubtree(
		container,
		(node) => {
			if (node instanceof Comment && node.data.startsWith('exact:')) found = true;
		},
		typeof work === 'number' ? { maxNodes: work } : { budget: work }
	);
	return found;
}

export function boundaryInnerHtml(
	container: Element,
	id: string,
	work?: number | DomWorkBudget
): string | undefined {
	const index = createProtocolIndex(container, work);
	if (!index) return undefined;
	return indexedBoundaryHtml(container, index, id);
}

export function boundaryInnerHtmls(
	container: Element,
	ids: readonly string[],
	work?: number | DomWorkBudget
): Record<string, string> {
	const index = createProtocolIndex(container, work);
	if (!index) return {};
	const htmls: Record<string, string> = {};
	for (const id of ids) {
		const html = indexedBoundaryHtml(container, index, id);
		if (html !== undefined) htmls[id] = html;
	}
	return htmls;
}

export function indexedBoundaryHtml(
	container: Element,
	index: ProtocolIndex,
	id: string
): string | undefined {
	const range = index.ranges.get(id);
	if (!range)
		return (
			findServerSlotElement(container, id, index)?.innerHTML ??
			findClientBoundaryElement(container, id, index)?.outerHTML
		);
	const wrapper = document.createElement('div');
	let cursor = range.start.nextSibling;
	while (cursor && cursor !== range.end) {
		wrapper.appendChild(cursor.cloneNode(true));
		cursor = cursor.nextSibling;
	}
	return wrapper.innerHTML;
}

export function createPatchBoundaryResolver(
	container: Element,
	boundaryIds: readonly string[],
	work?: number | DomWorkBudget
): (patchId: string) => string | undefined {
	const index = createProtocolIndex(container, work);
	if (!index) return () => undefined;
	const boundaries = boundaryIds.flatMap((id) => {
		const target = protocolTarget(index, id);
		return target ? [{ id, target }] : [];
	});
	const ids = new Set(boundaries.map((boundary) => boundary.id));
	return (patchId) => {
		if (ids.has(patchId)) return patchId;
		const target = protocolTarget(index, patchId);
		if (!target) return undefined;
		let owner: { id: string; target: Node | ExactRange } | undefined;
		for (const candidate of boundaries) {
			if (!protocolTargetContains(candidate.target, target)) continue;
			if (!owner || protocolTargetContains(owner.target, candidate.target)) owner = candidate;
		}
		return owner?.id;
	};
}

export function reportMismatch(
	options: PatchOptions,
	message: string,
	code: HydrationDiagnostic['code'] = 'adoption-mismatch',
	patch?: { type: string; id: string }
): void {
	logFrameworkEvent('warn', 'hydrate', 'mismatch', message, undefined, options.logger);
	options.onDiagnostic?.({ code, message, patch });
}
