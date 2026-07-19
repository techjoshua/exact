import { describe, expect, it } from 'vitest';
import { effectFor, targetsFor } from './effect-lattice.js';

describe('environment effect lattice', () => {
	it('keeps neutral effects portable and known effects target-specific', () => {
		expect(effectFor([])).toBe('neutral');
		expect(targetsFor('neutral')).toEqual(['client', 'server']);
		expect(targetsFor('browser')).toEqual(['client']);
		expect(targetsFor('server')).toEqual(['server']);
	});

	it('makes conflicts mixed and unresolved effects unknown', () => {
		expect(
			effectFor([
				{ environment: 'browser', description: 'window', path: [] },
				{ environment: 'server', description: 'node:fs', path: [] }
			])
		).toBe('mixed');
		expect(effectFor([{ environment: 'unknown', description: 'opaque call', path: [] }])).toBe(
			'unknown'
		);
	});
});
