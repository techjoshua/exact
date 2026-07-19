import type { ExactPatch } from '@exact/server';
import type { KeyedListSnapshotItem } from '../types.js';

export function diffKeyedListItems(
	listId: string,
	previousItems: readonly KeyedListSnapshotItem[],
	nextItems: readonly KeyedListSnapshotItem[]
): ExactPatch[] {
	const patches: ExactPatch[] = [];
	const previousKeys = previousItems.map((item) => item.key);
	const nextKeys = nextItems.map((item) => item.key);
	assertUniqueListKeys(previousKeys, 'previous');
	assertUniqueListKeys(nextKeys, 'next');
	const previousByKey = new Map(previousItems.map((item) => [item.key, item]));
	const nextByKey = new Map(nextItems.map((item) => [item.key, item]));
	const changedKeys = new Set(
		nextItems
			.filter(
				(item) => previousByKey.has(item.key) && previousByKey.get(item.key)!.html !== item.html
			)
			.map((item) => item.key)
	);

	for (const key of previousKeys) {
		if (!nextByKey.has(key) || changedKeys.has(key)) {
			patches.push({ type: 'list', id: listId, op: 'remove', key });
		}
	}

	const oldIndexes = new Map(previousKeys.map((key, index) => [key, index]));
	const retainedKeys = nextKeys.filter((key) => previousByKey.has(key) && !changedKeys.has(key));
	const retainedIndexes = retainedKeys.map((key) => oldIndexes.get(key)!);
	const stableKeys = new Set(
		longestIncreasingSubsequencePositions(retainedIndexes).map((index) => retainedKeys[index]!)
	);

	// Work backwards so every `before` anchor is already present when patches
	// are applied sequentially, including runs containing new records.
	for (let index = nextKeys.length - 1; index >= 0; index--) {
		const key = nextKeys[index]!;
		const before = nextKeys[index + 1];
		const previous = previousByKey.get(key);
		const next = nextByKey.get(key)!;
		if (!previous || changedKeys.has(key)) {
			patches.push({
				type: 'list',
				id: listId,
				op: 'insert',
				key,
				...(before === undefined ? {} : { before }),
				html: next.html
			});
			continue;
		}
		if (!stableKeys.has(key)) {
			patches.push({
				type: 'list',
				id: listId,
				op: 'move',
				key,
				...(before === undefined ? {} : { before })
			});
		}
	}

	return patches;
}

export function assertUniqueListKeys(keys: readonly string[], label: string): void {
	const seen = new Set<string>();
	for (const key of keys) {
		if (seen.has(key))
			throw new Error(`Duplicate key ${JSON.stringify(key)} in ${label} keyed-list snapshot`);
		seen.add(key);
	}
}

export function longestIncreasingSubsequencePositions(values: readonly number[]): number[] {
	const predecessors = new Int32Array(values.length);
	predecessors.fill(-1);
	const tails: number[] = [];
	for (let index = 0; index < values.length; index++) {
		let low = 0;
		let high = tails.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (values[tails[middle]!]! < values[index]!) low = middle + 1;
			else high = middle;
		}
		if (low > 0) predecessors[index] = tails[low - 1]!;
		tails[low] = index;
	}
	const positions = new Array<number>(tails.length);
	let cursor = tails.at(-1) ?? -1;
	for (let index = positions.length - 1; index >= 0; index--) {
		positions[index] = cursor;
		cursor = predecessors[cursor]!;
	}
	return positions;
}
