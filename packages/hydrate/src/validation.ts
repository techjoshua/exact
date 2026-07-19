/** Returns whether an object contains only the explicitly allowed own enumerable keys. */
export function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
	const allowedSet = new Set(allowed);
	return Object.keys(record).every((key) => allowedSet.has(key));
}

/** Returns whether a value can be safely encoded as JSON without prototypes or cycles. */
export function isJsonSafe(
	value: unknown,
	limits: { maxDepth?: number; maxNodes?: number; maxBytes?: number } = {}
): boolean {
	const maxDepth = positiveLimit(limits.maxDepth, 100);
	const maxNodes = positiveLimit(limits.maxNodes, 100_000);
	const maxBytes = positiveLimit(limits.maxBytes, 16 * 1024 * 1024);
	try {
		const encoder = new TextEncoder();
		const seen = new Set<object>();
		const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
		let nodes = 0;
		let bytes = 0;
		while (pending.length) {
			const { value: item, depth } = pending.pop()!;
			if (++nodes > maxNodes || depth > maxDepth || item === undefined) return false;
			if (item === null || typeof item === 'boolean') continue;
			if (typeof item === 'number') {
				if (!Number.isFinite(item)) return false;
				continue;
			}
			if (typeof item === 'string') {
				bytes += encoder.encode(item).byteLength;
				if (bytes > maxBytes) return false;
				continue;
			}
			if (typeof item !== 'object' || seen.has(item)) return false;
			seen.add(item);
			if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) return false;
			const keys = Object.keys(item);
			if (nodes + pending.length + keys.length > maxNodes) return false;
			for (const key of keys) {
				const descriptor = Object.getOwnPropertyDescriptor(item, key);
				if (!descriptor || !('value' in descriptor)) return false;
				bytes += encoder.encode(key).byteLength;
				if (bytes > maxBytes) return false;
				pending.push({ value: descriptor.value, depth: depth + 1 });
			}
		}
		return true;
	} catch {
		return false;
	}
}

function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
