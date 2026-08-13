import type { IntlLanguageSpan } from './analysis-contracts.js';

/** Converts a native start-and-length span into a half-open language-service range. */
export function intlLanguageRange(
	span: IntlLanguageSpan
): Readonly<{ start: number; end: number }> {
	return Object.freeze({ start: span.start, end: span.start + span.length });
}

/** Reports whether two half-open language-service ranges intersect. */
export function intlLanguageRangesOverlap(
	left: Readonly<{ start: number; end: number }>,
	right: Readonly<{ start: number; end: number }>
): boolean {
	return left.start <= right.end && right.start <= left.end;
}
