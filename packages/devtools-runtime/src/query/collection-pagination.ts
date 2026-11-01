import type { ExactInspectionPagination } from '@exactjs/devtools-protocol';

/** One independently paged owner in the deterministic merged collection order. */
export type InspectionCollectionSource = Readonly<{
	/** Known local length permits constant-time resumption of retained global offsets. */
	size?: number;
	read(
		page: ExactInspectionPagination
	): Promise<Readonly<{ values: readonly unknown[]; nextCursor?: string }>>;
}>;

/** Identifies malformed or out-of-range caller cursors separately from source failures. */
export class InspectionCollectionCursorError extends RangeError {}

/** Fills the requested page across finite owners. Known local lengths resume retained offsets directly. */
export async function paginateInspectionSources(
	sources: readonly InspectionCollectionSource[],
	page: ExactInspectionPagination | undefined,
	maximum: number
): Promise<Readonly<{ values: readonly unknown[]; nextCursor?: string }>> {
	const state = readCursor(page?.cursor, sources.length);
	let { host, cursor, skip } = state;
	const limit = page?.limit ?? Math.min(100, maximum);
	const values: unknown[] = [];
	const seen = new Set<string>();
	while (host < sources.length) {
		const source = sources[host]!;
		if (skip && source.size !== undefined) {
			if (skip >= source.size) {
				skip -= source.size;
				host++;
				continue;
			}
			cursor = skip.toString(36);
			skip = 0;
		}
		const remaining = limit - values.length;
		const sourceLimit = Math.min(maximum, Math.min(maximum, skip) + remaining);
		const result = await source.read({ cursor, limit: sourceLimit });
		const sourceValues = result.values;
		if (sourceValues.length > sourceLimit)
			throw new TypeError('Inspection source exceeded the requested page limit');
		if (skip >= sourceValues.length) skip -= sourceValues.length;
		else {
			for (let index = skip; index < sourceValues.length; index++) values.push(sourceValues[index]);
			skip = 0;
		}
		const nextCursor = result.nextCursor;
		if (nextCursor !== undefined) {
			if (!sourceValues.length || nextCursor === cursor || seen.has(nextCursor))
				throw new TypeError('Inspection source pagination did not advance');
			seen.add(nextCursor);
			cursor = nextCursor;
		} else {
			host++;
			cursor = undefined;
			seen.clear();
		}
		if (values.length === limit)
			return {
				values,
				...(host < sources.length ? { nextCursor: writeCursor(host, cursor) } : {})
			};
	}
	if (skip)
		throw new InspectionCollectionCursorError('Inspection cursor is outside the collection');
	return { values };
}

/** Accepts retained global offsets and the current bounded source cursor envelope. */
function readCursor(
	value: string | undefined,
	count: number
): { host: number; cursor?: string; skip: number } {
	if (!value) return { host: 0, skip: 0 };
	if (value.startsWith('c2:')) {
		let decoded: unknown;
		try {
			decoded = JSON.parse(value.slice(3));
		} catch {
			throw new InspectionCollectionCursorError('Invalid inspection collection cursor');
		}
		if (
			!Array.isArray(decoded) ||
			decoded.length !== 2 ||
			!Number.isSafeInteger(decoded[0]) ||
			decoded[0] < 0 ||
			decoded[0] >= count ||
			(decoded[1] !== null &&
				(typeof decoded[1] !== 'string' || !decoded[1].length || decoded[1].length > 2048))
		)
			throw new InspectionCollectionCursorError('Invalid inspection collection cursor');
		return { host: decoded[0], cursor: decoded[1] ?? undefined, skip: 0 };
	}
	if (!/^[0-9a-z]+$/.test(value))
		throw new InspectionCollectionCursorError('Invalid inspection collection cursor');
	const skip = Number.parseInt(value, 36);
	if (!Number.isSafeInteger(skip))
		throw new InspectionCollectionCursorError('Invalid inspection collection cursor');
	return { host: 0, skip };
}

/** Keeps the emitted cursor within the protocol's existing pagination field budget. */
function writeCursor(host: number, cursor: string | undefined): string {
	const value = 'c2:' + JSON.stringify([host, cursor ?? null]);
	if (value.length > 2048)
		throw new TypeError('Inspection source cursor exceeded the merged cursor budget');
	return value;
}
