/** Stable constant names shared with the DevTools value-preview vocabulary. */
export type ProtocolConstant = 'undefined' | 'NaN' | 'Infinity' | '-Infinity' | '-0';

/** Identifies primitive values that ordinary JSON would omit or change. */
export function protocolConstantToken(value: unknown): ProtocolConstant | undefined {
	if (value === undefined) return 'undefined';
	if (typeof value !== 'number') return undefined;
	if (Object.is(value, -0)) return '-0';
	if (Number.isNaN(value)) return 'NaN';
	if (value === Infinity) return 'Infinity';
	if (value === -Infinity) return '-Infinity';
	return undefined;
}

/** Restores a validated constant capsule, rejecting unknown tokens at the protocol boundary. */
export function decodeProtocolConstant(token: unknown): undefined | number {
	switch (token) {
		case 'undefined':
			return undefined;
		case 'NaN':
			return NaN;
		case 'Infinity':
			return Infinity;
		case '-Infinity':
			return -Infinity;
		case '-0':
			return -0;
		default:
			throw new TypeError('Malformed eXact constant capsule');
	}
}
