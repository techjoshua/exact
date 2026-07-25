import type { ExactPatch } from '@exactjs/server';
import { MAX_DIFF_HTML_BYTES, MAX_DIFF_HTML_NODES } from './elements.js';

type MarkerRange = Readonly<{
	id: string;
	contentStart: number;
	contentEnd: number;
	parent?: MarkerAncestor;
}>;

type MarkerAncestor = Readonly<{ id: string; parent?: MarkerAncestor }>;

type OpenMarker = {
	id: string;
	contentStart: number;
	parent?: MarkerAncestor;
};

/** Describes compiler-owned marker replacements and their simulated previous HTML. */
export type ExactMarkerDiff = Readonly<{
	patches: readonly ExactPatch[];
	html: string;
}>;

/**
 * Replaces changed compiler-stable marker interiors while proving that the
 * selected non-overlapping ranges reproduce the corresponding next markup.
 */
export function diffExactMarkerRanges(
	previousHtml: string,
	nextHtml: string
): ExactMarkerDiff | undefined {
	const previous = parseMarkerRanges(previousHtml);
	const next = parseMarkerRanges(nextHtml);
	if (!previous || !next) return undefined;
	const candidates = [...next.values()]
		.filter((range) => {
			const prior = previous.get(range.id);
			return (
				isCompilerStableMarker(range.id) &&
				!!prior &&
				previousHtml.slice(prior.contentStart, prior.contentEnd) !==
					nextHtml.slice(range.contentStart, range.contentEnd)
			);
		})
		.filter((range) => !hasChangedStableAncestor(range, previous, next, previousHtml, nextHtml));
	if (!candidates.length) return undefined;

	const replacements = candidates
		.map((range) => {
			const prior = previous.get(range.id)!;
			return {
				id: range.id,
				start: prior.contentStart,
				end: prior.contentEnd,
				html: nextHtml.slice(range.contentStart, range.contentEnd)
			};
		})
		.sort((left, right) => right.start - left.start);
	let simulated = previousHtml;
	for (const replacement of replacements)
		simulated =
			simulated.slice(0, replacement.start) + replacement.html + simulated.slice(replacement.end);
	return {
		patches: replacements.reverse().map(({ id, html }) => ({ type: 'replace' as const, id, html })),
		html: simulated
	};
}

function parseMarkerRanges(html: string): Map<string, MarkerRange> | undefined {
	if (new TextEncoder().encode(html).byteLength > MAX_DIFF_HTML_BYTES) return undefined;
	const ranges = new Map<string, MarkerRange>();
	const stack: OpenMarker[] = [];
	const pattern = /<!--(\/?)exact:([A-Za-z0-9_:/.-]+)-->/g;
	let match: RegExpExecArray | null;
	let count = 0;
	while ((match = pattern.exec(html))) {
		if (++count > MAX_DIFF_HTML_NODES) return undefined;
		const closing = match[1] === '/';
		const id = match[2]!;
		if (!closing) {
			if (ranges.has(id) || stack.some((entry) => entry.id === id)) return undefined;
			const parent = stack[stack.length - 1];
			stack.push({
				id,
				contentStart: pattern.lastIndex,
				...(parent ? { parent: { id: parent.id, parent: parent.parent } } : {})
			});
			continue;
		}
		const open = stack.pop();
		if (!open || open.id !== id) return undefined;
		ranges.set(id, {
			id,
			contentStart: open.contentStart,
			contentEnd: match.index,
			parent: open.parent
		});
	}
	return stack.length ? undefined : ranges;
}

function hasChangedStableAncestor(
	range: MarkerRange,
	previous: ReadonlyMap<string, MarkerRange>,
	next: ReadonlyMap<string, MarkerRange>,
	previousHtml: string,
	nextHtml: string
): boolean {
	for (let ancestor = range.parent; ancestor; ancestor = ancestor.parent) {
		if (!isCompilerStableMarker(ancestor.id)) continue;
		const prior = previous.get(ancestor.id);
		const following = next.get(ancestor.id);
		if (
			prior &&
			following &&
			previousHtml.slice(prior.contentStart, prior.contentEnd) !==
				nextHtml.slice(following.contentStart, following.contentEnd)
		)
			return true;
	}
	return false;
}

function isCompilerStableMarker(id: string): boolean {
	return /^dynamic:x[A-Za-z0-9_-]{22}$/.test(id);
}
