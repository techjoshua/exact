/** Creates a deterministic pseudo-random stream from an unsigned 32-bit seed. */
export function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
	};
}

/** Returns a shuffled copy without mutating the input collection. */
export function shuffled<T>(values: readonly T[], random: () => number): T[] {
	const result = [...values];
	for (let index = result.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1));
		[result[index], result[swap]] = [result[swap]!, result[index]!];
	}
	return result;
}

/** Produces a browser-local seed and falls back safely when Web Crypto is unavailable. */
export function createSeed(): number {
	const values = new Uint32Array(1);
	if (globalThis.crypto?.getRandomValues) {
		globalThis.crypto.getRandomValues(values);
		return values[0]!;
	}
	return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}
