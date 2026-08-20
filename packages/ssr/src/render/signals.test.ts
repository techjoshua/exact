import { describe, expect, it } from 'vitest';
import { renderSignal } from './signals.js';

describe('SSR render signal ownership', () => {
	it('aborts when either the request owner or explicit render signal ends', () => {
		const request = new AbortController();
		const explicit = new AbortController();
		const combined = renderSignal(request.signal, explicit.signal)!;

		explicit.abort('render timeout');

		expect(combined.aborted).toBe(true);
		expect(combined.reason).toBe('render timeout');
	});

	it('retains request cancellation when an explicit signal is present', () => {
		const request = new AbortController();
		const explicit = new AbortController();
		const combined = renderSignal(request.signal, explicit.signal)!;

		request.abort('request closed');

		expect(combined.aborted).toBe(true);
		expect(combined.reason).toBe('request closed');
		expect(explicit.signal.aborted).toBe(false);
	});
});
