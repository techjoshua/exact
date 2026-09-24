import type { ParsedHtmlNode } from './contracts.js';
import { collectNormalizedShapeIds } from './parsing.js';

/** Performs the same normalized html shape domain operation. */
export function sameNormalizedHtmlShape(
	left: readonly ParsedHtmlNode[],
	right: readonly ParsedHtmlNode[]
): boolean {
	if (left.length !== right.length) return false;
	const interner = new Map<string, number>();
	const leftIds = collectNormalizedShapeIds(left, interner);
	const rightIds = collectNormalizedShapeIds(right, interner);
	return left.every((node, index) => leftIds.get(node) === rightIds.get(right[index]!));
}
