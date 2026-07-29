import { describe, expect, it } from 'vitest';
import { previewExactValue } from './value-preview.js';

describe('safe eXact value previews', () => {
	it('does not invoke getters or toJSON and bounds cyclic collections', () => {
		let getterReads = 0;
		const value: Record<string, unknown> = {
			visible: 'ok',
			toJSON() {
				throw new Error('must not run');
			}
		};
		Object.defineProperty(value, 'hidden', {
			enumerable: true,
			get() {
				getterReads++;
				return 'secret';
			}
		});
		value.self = value;

		const preview = previewExactValue(value, { limits: { maxEntries: 3 } });

		expect(getterReads).toBe(0);
		expect(JSON.stringify(preview)).not.toContain('secret');
		expect(JSON.stringify(preview)).toContain('cycle');
	});

	it('redacts a qualified path before touching its value', () => {
		const guarded = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error('redaction must happen first');
				}
			}
		);
		const preview = previewExactValue({ apiKey: guarded }, {
			redact: (path) => (path.join('.') === 'apiKey' ? 'secret' : undefined)
		});
		expect(preview).toMatchObject({
			kind: 'object',
			entries: [{ key: 'apiKey', value: { kind: 'redacted', reason: 'secret' } }]
		});
	});
});
