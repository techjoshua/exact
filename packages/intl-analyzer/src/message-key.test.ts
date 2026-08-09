import { describe, expect, it } from 'vitest';
import { createIntlMessageKey } from './message-key.js';

describe('intl message keys', () => {
	it('uses the platform SHA-256 implementation with base64url output', () => {
		expect(createIntlMessageKey('')).toBe('m1_47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU');
		expect(createIntlMessageKey('e\u0301')).toBe(createIntlMessageKey('é'));
	});
});
