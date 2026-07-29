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
		const preview = previewExactValue(
			{ apiKey: guarded },
			{
				redact: (path) => (path.join('.') === 'apiKey' ? 'secret' : undefined)
			}
		);
		expect(preview).toMatchObject({
			kind: 'object',
			entries: [{ key: 'apiKey', value: { kind: 'redacted', reason: 'secret' } }]
		});
	});

	it('stops after hostile proxy failures without retrying through other traps', () => {
		let traps = 0;
		const guarded = new Proxy(
			{},
			{
				getPrototypeOf() {
					traps++;
					throw new Error('blocked');
				},
				ownKeys() {
					traps++;
					throw new Error('must not retry');
				}
			}
		);
		expect(previewExactValue(guarded)).toEqual({
			kind: 'unavailable',
			reason: 'inspection-failed'
		});
		expect(traps).toBe(1);
	});

	it('does not invoke accessors when an object resembles a DOM node', () => {
		let reads = 0;
		const prototype = {};
		Object.defineProperty(prototype, 'nodeType', {
			get() {
				reads++;
				return 1;
			}
		});
		const value = Object.create(prototype);
		Object.defineProperty(value, 'nodeName', {
			get() {
				reads++;
				return 'SCRIPT';
			}
		});
		expect(previewExactValue(value)).toMatchObject({ kind: 'dom', tag: 'element' });
		expect(reads).toBe(0);
	});

	it('bounds UTF-8 preview bytes without splitting surrogate pairs', () => {
		const preview = previewExactValue('😀😀😀😀', { limits: { maxBytes: 8 } });
		expect(preview).toEqual({ kind: 'scalar', value: '😀…' });
		expect(
			new TextEncoder().encode((preview as { value: string }).value).byteLength
		).toBeLessThanOrEqual(8);
	});
});
