import { encodeExactMarkerPart } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { encodeMarkerKey } from './markers.js';

describe('SSR marker keys', () => {
	it('preserves the canonical safe and encoded marker grammar', () => {
		const values = [
			'Incident_101.ready',
			'a-b-c',
			'',
			'a--b',
			'-->',
			'contains space',
			'incident/101',
			'深刻度-🔥'
		];

		for (const value of values)
			expect(encodeMarkerKey(value), value).toBe(encodeExactMarkerPart(value));
	});
});
