/** Creates deterministic command choices whose seed can be reported with a failing trace. */
export function seededChoices(seed: number): (limit: number) => number {
	let value = seed;
	return (limit) => {
		value ^= value << 13;
		value ^= value >>> 17;
		value ^= value << 5;
		return (value >>> 0) % limit;
	};
}

/** Removes chunks while the same behavioral failure persists, with a bounded replay budget. */
export async function minimizeFailingSequence<T>(
	sequence: readonly T[],
	fails: (candidate: readonly T[]) => boolean | Promise<boolean>,
	budget = 64
): Promise<readonly T[]> {
	let current = [...sequence];
	let size = Math.ceil(current.length / 2);
	while (size >= 1 && budget > 0) {
		let reduced = false;
		for (let start = 0; start < current.length && budget > 0; start += size) {
			const candidate = [...current.slice(0, start), ...current.slice(start + size)];
			budget--;
			if (await fails(candidate)) {
				current = candidate;
				reduced = true;
				break;
			}
		}
		if (!reduced) size = Math.floor(size / 2);
	}
	return current;
}
