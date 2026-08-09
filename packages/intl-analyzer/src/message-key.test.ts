import { describe, expect, it } from 'vitest';
import {
	createIntlExecutionContractHash,
	createIntlMessageKey,
	intlMessageNamePrefix
} from './message-key.js';

describe('intl message keys', () => {
	it('uses readable names and platform SHA-256 base64url output', () => {
		const empty = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
		expect(createIntlMessageKey('')).toBe(empty);
		expect(createIntlMessageKey('e\u0301')).toBe(createIntlMessageKey('é'));
		expect(createIntlMessageKey('', 'Inbox count')).toBe(`Inbox-count_${empty}`);
		expect(createIntlExecutionContractHash('')).toBe(empty);
		expect(intlMessageNamePrefix('  箱の数  ')).toBe('箱の数');
	});
});
