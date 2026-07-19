const encoder = new TextEncoder();

/** Hashes strict JSON data with deterministic object ordering. This is not a security primitive. */
export function hashCanonicalJson(value: unknown, domain: string): string {
	const canonical = canonicalJson(value);
	return hashText(`${domain.length}:${domain}${canonical.length}:${canonical}`);
}

/** Hashes an ordered string sequence using unambiguous length framing. */
export function hashStringSequence(values: readonly string[], domain: string): string {
	let framed = `${domain.length}:${domain}${values.length}:`;
	for (const value of values) framed += `${value.length}:${value}`;
	return hashText(framed);
}

export function canonicalJson(value: unknown): string {
	return encodeValue(value, new WeakSet(), 0);
}

function encodeValue(value: unknown, active: WeakSet<object>, depth: number): string {
	if (depth > 100) throw new TypeError('Cannot hash JSON deeper than 100 levels');
	if (value === null) return 'null';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'string') return JSON.stringify(value);
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new TypeError('Cannot hash non-finite JSON numbers');
		return Object.is(value, -0) ? '0' : JSON.stringify(value);
	}
	if (!value || typeof value !== 'object')
		throw new TypeError(`Cannot hash non-JSON ${typeof value}`);
	if (active.has(value)) throw new TypeError('Cannot hash cyclic JSON');
	active.add(value);
	try {
		if (Array.isArray(value)) {
			if (Object.getPrototypeOf(value) !== Array.prototype)
				throw new TypeError('Cannot hash non-standard arrays');
			const keys = Object.keys(value);
			if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
				throw new TypeError('Cannot hash sparse arrays or arrays with enumerable properties');
			}
			if (
				Object.getOwnPropertySymbols(value).some((symbol) =>
					Object.prototype.propertyIsEnumerable.call(value, symbol)
				)
			) {
				throw new TypeError('Cannot hash arrays with enumerable symbols');
			}
			const items: string[] = [];
			for (let index = 0; index < value.length; index++) {
				const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
				if (!descriptor || !('value' in descriptor))
					throw new TypeError('Cannot hash array accessors');
				items.push(encodeValue(descriptor.value, active, depth + 1));
			}
			return `[${items.join(',')}]`;
		}

		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null)
			throw new TypeError('Cannot hash non-plain JSON objects');
		if (
			Object.getOwnPropertySymbols(value).some((symbol) =>
				Object.prototype.propertyIsEnumerable.call(value, symbol)
			)
		) {
			throw new TypeError('Cannot hash objects with enumerable symbols');
		}
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const keys = Object.keys(descriptors)
			.filter((key) => descriptors[key]!.enumerable)
			.sort();
		const properties: string[] = [];
		for (const key of keys) {
			const descriptor = descriptors[key]!;
			if (!('value' in descriptor)) throw new TypeError('Cannot hash object accessors');
			properties.push(`${JSON.stringify(key)}:${encodeValue(descriptor.value, active, depth + 1)}`);
		}
		return `{${properties.join(',')}}`;
	} finally {
		active.delete(value);
	}
}

function hashText(value: string): string {
	const bytes = encoder.encode(value);
	let a = 0x811c9dc5;
	let b = 0x9e3779b9;
	let c = 0x85ebca6b;
	let d = 0xc2b2ae35;
	for (const byte of bytes) {
		a = Math.imul(a ^ byte, 0x01000193);
		b = Math.imul(b ^ byte, 0x27d4eb2d);
		c = Math.imul(c ^ byte, 0x165667b1);
		d = Math.imul(d ^ byte, 0x85ebca77);
	}
	a = avalanche(a ^ bytes.length);
	b = avalanche(b ^ a);
	c = avalanche(c ^ b);
	d = avalanche(d ^ c);
	return [a, b, c, d].map((part) => (part >>> 0).toString(16).padStart(8, '0')).join('');
}

function avalanche(value: number): number {
	value ^= value >>> 16;
	value = Math.imul(value, 0x7feb352d);
	value ^= value >>> 15;
	value = Math.imul(value, 0x846ca68b);
	return value ^ (value >>> 16);
}
