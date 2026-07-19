import type { ExactPatch } from '@exact/server';
import type { BoundaryRefreshOptions } from '../types.js';
import {
	collectExactElementEntries,
	collectExactElements,
	collectNormalizedShapeIds,
	parseHtmlNodes
} from './parsing.js';
import {
	boundaryPatch,
	decodeEscapedText,
	diffStyleAttribute,
	isTextOnlyHtml,
	parseSimpleElement,
	sameKeys,
	sameNormalizedHtmlShape,
	serializeParsedHtmlElement,
	stringAttribute,
	stringValue,
	textOnlyContent
} from './patches.js';

/** Defines the parsed html node type contract. */
export type ParsedHtmlNode = ParsedHtmlElement | ParsedHtmlText;

/** Defines the parsed html element type contract. */
export type ParsedHtmlElement = {
	kind: 'element';
	tagName: string;
	attributes: Map<string, string | true>;
	children: ParsedHtmlNode[];
};

/** Defines the parsed html text type contract. */
export type ParsedHtmlText = {
	kind: 'text';
	value: string;
};

/** Provides the canonical max diff html bytes value. */
export const MAX_DIFF_HTML_BYTES = 2 * 1024 * 1024;

/** Provides the canonical max diff html nodes value. */
export const MAX_DIFF_HTML_NODES = 100_000;

/** Provides the canonical max diff html depth value. */
export const MAX_DIFF_HTML_DEPTH = 256;

/** Provides the canonical max fine grained patches value. */
export const MAX_FINE_GRAINED_PATCHES = 10_000;

/** Performs the diff boundary html domain operation. */
export function diffBoundaryHtml(
	boundaryId: string,
	previousHtml: string,
	nextHtml: string,
	strategy: BoundaryRefreshOptions['patchStrategy'] = 'replace'
): ExactPatch[] {
	if (previousHtml === nextHtml) return [];
	if (strategy === 'text' && isTextOnlyHtml(previousHtml) && isTextOnlyHtml(nextHtml)) {
		return [boundaryPatch(boundaryId, nextHtml, 'text')];
	}
	if (strategy === 'element') {
		const exactPatches = diffExactElementHtml(previousHtml, nextHtml);
		if (exactPatches) return exactPatches;

		const previous = parseSimpleElement(previousHtml);
		const next = parseSimpleElement(nextHtml);
		if (previous && next && previous.tagName === next.tagName) {
			const targetId =
				stringAttribute(next, 'data-exact-id') ??
				stringAttribute(previous, 'data-exact-id') ??
				boundaryId;
			const patches: ExactPatch[] = [];
			for (const [name, value] of next.attributes) {
				if (name === 'data-exact-id') continue;
				if (previous.attributes.get(name) !== value) {
					patches.push({ type: 'prop', id: targetId, name, value });
				}
			}
			for (const name of previous.attributes.keys()) {
				if (name === 'data-exact-id') continue;
				if (!next.attributes.has(name)) {
					patches.push({ type: 'prop', id: targetId, name, value: null });
				}
			}
			if (previous.text !== next.text) {
				patches.push({ type: 'text', id: targetId, value: decodeEscapedText(next.text) });
			}
			return patches.length ? patches : [];
		}
	}
	return [boundaryPatch(boundaryId, nextHtml, 'replace')];
}

/** Performs the diff exact element html domain operation. */
export function diffExactElementHtml(
	previousHtml: string,
	nextHtml: string
): ExactPatch[] | undefined {
	// This parser intentionally handles eXact-generated HTML, not arbitrary browser HTML.
	// Returning undefined is the signal to fall back to a boundary replacement.
	const previousTree = parseHtmlNodes(previousHtml);
	const nextTree = parseHtmlNodes(nextHtml);
	if (!previousTree || !nextTree) return undefined;

	const previousById = collectExactElements(previousTree);
	const nextById = collectExactElements(nextTree);
	if (!previousById.size && !nextById.size) return undefined;
	if (!sameKeys(previousById, nextById))
		return rootExactElementReplace(previousTree, nextTree, nextHtml);

	const patches: ExactPatch[] = [];
	for (const [id, next] of nextById) {
		const previous = previousById.get(id);
		if (!previous) return undefined;
		if (previous.tagName !== next.tagName) {
			const nestedReplacements = nestedExactElementReplace(previousTree, nextTree);
			if (nestedReplacements) return [...patches, ...nestedReplacements];
			return rootExactElementReplace(previousTree, nextTree, nextHtml);
		}

		for (const [name, value] of next.attributes) {
			if (name === 'data-exact-id') continue;
			if (previous.attributes.get(name) !== value) {
				if (name === 'style') {
					const stylePatches = diffStyleAttribute(
						id,
						stringValue(previous.attributes.get(name)),
						stringValue(value)
					);
					if (!stylePatches) return undefined;
					patches.push(...stylePatches);
				} else {
					patches.push({ type: 'prop', id, name, value });
				}
			}
			if (patches.length > MAX_FINE_GRAINED_PATCHES) return undefined;
		}
		for (const name of previous.attributes.keys()) {
			if (name === 'data-exact-id') continue;
			if (!next.attributes.has(name)) {
				if (name === 'style') {
					const stylePatches = diffStyleAttribute(
						id,
						stringValue(previous.attributes.get(name)),
						undefined
					);
					if (!stylePatches) return undefined;
					patches.push(...stylePatches);
				} else {
					patches.push({ type: 'prop', id, name, value: null });
				}
			}
			if (patches.length > MAX_FINE_GRAINED_PATCHES) return undefined;
		}

		const previousText = textOnlyContent(previous);
		const nextText = textOnlyContent(next);
		if (previousText !== undefined || nextText !== undefined) {
			if (previousText === undefined || nextText === undefined) {
				const nestedReplacements = nestedExactElementReplace(previousTree, nextTree);
				if (nestedReplacements) return [...patches, ...nestedReplacements];
				return rootExactElementReplace(previousTree, nextTree, nextHtml);
			}
			if (previousText !== nextText) patches.push({ type: 'text', id, value: nextText });
			if (patches.length > MAX_FINE_GRAINED_PATCHES) return undefined;
		}
	}

	if (sameNormalizedHtmlShape(previousTree, nextTree)) return patches;
	const nestedReplacements = nestedExactElementReplace(previousTree, nextTree);
	if (nestedReplacements) return [...patches, ...nestedReplacements];
	return rootExactElementReplace(previousTree, nextTree, nextHtml);
}

/** Performs the nested exact element replace domain operation. */
export function nestedExactElementReplace(
	previousTree: readonly ParsedHtmlNode[],
	nextTree: readonly ParsedHtmlNode[]
): ExactPatch[] | undefined {
	const previousById = collectExactElements(previousTree);
	const shapeInterner = new Map<string, number>();
	const previousShapes = collectNormalizedShapeIds(previousTree, shapeInterner);
	const nextShapes = collectNormalizedShapeIds(nextTree, shapeInterner);
	const nextEntries = collectExactElementEntries(nextTree).sort(
		(left, right) => right.depth - left.depth
	);
	const coveredAncestors = new Set<string>();
	const patches: ExactPatch[] = [];

	for (const { id, element: next, exactParent } of nextEntries) {
		const previous = previousById.get(id);
		if (!previous) continue;
		if (coveredAncestors.has(id)) continue;
		if (previousShapes.get(previous) === nextShapes.get(next)) continue;
		for (let ancestor = exactParent; ancestor; ancestor = ancestor.parent)
			coveredAncestors.add(ancestor.id);
		patches.push({ type: 'replace', id, html: serializeParsedHtmlElement(next) });
		if (patches.length > MAX_FINE_GRAINED_PATCHES) return undefined;
	}

	return patches.length ? patches : undefined;
}

/** Performs the root exact element replace domain operation. */
export function rootExactElementReplace(
	previousTree: readonly ParsedHtmlNode[],
	nextTree: readonly ParsedHtmlNode[],
	nextHtml: string
): ExactPatch[] | undefined {
	if (previousTree.length !== 1 || nextTree.length !== 1) return undefined;
	const previous = previousTree[0];
	const next = nextTree[0];
	if (previous?.kind !== 'element' || next?.kind !== 'element') return undefined;
	const id = stringAttribute(previous, 'data-exact-id');
	if (!id || stringAttribute(next, 'data-exact-id') !== id || previous.tagName !== next.tagName)
		return undefined;
	return [{ type: 'replace', id, html: nextHtml }];
}
