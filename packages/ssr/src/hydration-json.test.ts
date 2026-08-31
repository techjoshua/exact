import { describe, expect, it } from 'vitest';
import { validateJsonSafeHydrationValue } from './hydration-json.js';

describe('hydration JSON validation', () => {
	it('trusts framework tuple structure without trusting nested authored values', () => {
		let accessorInvoked = false;
		const authored: Record<string, unknown> = {};
		Object.defineProperty(authored, 'secret', {
			enumerable: true,
			get() {
				accessorInvoked = true;
				return 'unsafe';
			}
		});
		const entry: [number, unknown] = [0, authored];
		const entries = [entry];
		const resumption: [string, [number, unknown][]] = ['component', entries];
		const resumptions = [resumption];
		const payload = { resumptions };
		const structurallyKnown = new WeakSet<object>([
			payload,
			resumptions,
			resumption,
			entries,
			entry
		]);

		expect(validateJsonSafeHydrationValue(payload, { structurallyKnown })).toBe(
			'$.resumptions[0][1][0][1].secret'
		);
		expect(accessorInvoked).toBe(false);
	});
});
