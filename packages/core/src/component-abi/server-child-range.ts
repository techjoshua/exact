import type { RenderResult } from '../component/contracts.js';

const PreparedServerChildRange = Symbol.for('@exactjs/server/prepared-child-range');

/** Direct request-local child range emitted only by compiler-closed server artifacts. */
export type ExactPreparedServerChildRange = Readonly<{
	readonly value: RenderResult;
	readonly markerId?: string;
	readonly mayReplaceSubtree: boolean;
}>;

/** Creates a direct server range without allocating an opaque operation or private payload. */
export function createPreparedServerChildRange(
	value: RenderResult,
	markerId?: string,
	mayReplaceSubtree = true
): ExactPreparedServerChildRange {
	const range = {
		[PreparedServerChildRange]: true,
		value,
		...(markerId === undefined ? {} : { markerId }),
		mayReplaceSubtree
	};
	return range;
}

/** Reads only direct child ranges issued by compiler-closed server artifacts. */
export function readPreparedServerChildRange(
	value: unknown
): ExactPreparedServerChildRange | undefined {
	return typeof value === 'object' && value !== null && PreparedServerChildRange in value
		? (value as unknown as ExactPreparedServerChildRange)
		: undefined;
}
