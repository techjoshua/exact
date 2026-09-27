import type { ExactContinuationStatePathContract } from '@exactjs/core/framework/component-contracts';

const committed = new WeakMap<object, Map<string, number>>();

/**
 * Accepts a component response unless a newer response committed overlapping state.
 * A response's declared writes commit together. Parent paths and wildcard writes overlap
 * their descendants. Unrelated paths may complete in either order. Ownership is weak so
 * disposed component instances do not retain their ordering history.
 */
export function acceptComponentStateCommit(
	owner: object,
	writes: readonly ExactContinuationStatePathContract[],
	ordinal: number
): boolean {
	const paths = writes
		.filter((write) => write.kind === 'write' && write.confidence === 'exact')
		.map((write) => write.path);
	let history = committed.get(owner);
	if (!history) {
		history = new Map();
		committed.set(owner, history);
	}
	for (const path of paths) {
		for (const [previous, version] of history) {
			if (version > ordinal && overlaps(path, previous)) return false;
		}
	}
	for (const path of paths) history.set(path, Math.max(ordinal, history.get(path) ?? 0));
	return true;
}

function overlaps(left: string, right: string): boolean {
	return (
		left === '*' ||
		right === '*' ||
		left === right ||
		left.startsWith(right + '.') ||
		right.startsWith(left + '.')
	);
}
