import type { ArrayBefore } from '@exactjs/reactive/framework/array-diff';
import type { takeTaskPropertyMutations } from '@exactjs/core/framework/task-frames';

/** Projects existing scalar performed-write evidence onto codec-sampled receivers, without observing execution operations. */
export function arrayScalarWrites(
	before: ArrayBefore,
	after: ArrayBefore,
	query: ReturnType<typeof takeTaskPropertyMutations>
): ReadonlyMap<object, ReadonlyMap<PropertyKey, 'set' | 'delete'>> {
	const result = new Map<object, Map<PropertyKey, 'set' | 'delete'>>();
	if (!query) return result;
	for (const snapshot of [before, after])
		for (const source of snapshot.nodes.values()) {
			if (
				!source ||
				typeof source !== 'object' ||
				(!Array.isArray(source) && Object.getPrototypeOf(source) !== Object.prototype)
			)
				continue;
			const fields = query.fields(source);
			if (fields?.size) result.set(source, new Map(fields));
		}
	return result;
}

/** Keeps nonsequence scalar slots and absent deletes outside the Array grammar, under existing root authority. */
export function arrayScalarOutputPaths(
	path: string,
	source: unknown[],
	query: ReturnType<typeof takeTaskPropertyMutations>
): { sets: string[]; deletions: string[] } {
	const sets: string[] = [],
		deletions: string[] = [];
	for (const [key, operation] of query?.fields(source) ?? []) {
		if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) continue;
		const index = Number(key);
		if (
			operation === 'delete' &&
			((!Object.hasOwn(source, key) && index >= source.length) || index >= 0xffff_ffff)
		)
			deletions.push(path + '.' + key);
		else if (operation === 'set' && index >= 0xffff_ffff) sets.push(path + '.' + key);
	}
	return { sets, deletions };
}
