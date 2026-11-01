// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { verifyRemoteLoadOwnership } from '../../../packages/component-composition-corpus/test-support/remote-load-ownership-journey.mjs';
import { loadExactRemoteModule, RemoteComponent } from './client.js';

it('shares remote work only while its callers remain interested', async () => {
	expect(
		await verifyRemoteLoadOwnership({ load: loadExactRemoteModule, component: RemoteComponent })
	).toEqual({ cases: 6 });
});

it('leaves elapsed-time policy to the caller', async () => {
	vi.useFakeTimers();
	const symbol = Symbol.for('@exactjs/microfrontends/remote-loader');
	const host = globalThis as Record<PropertyKey, unknown>;
	const previous = host[symbol];
	const owner = new AbortController();
	let underlying!: AbortSignal;
	host[symbol] = {
		load(_url: string, _integrity: string, signal: AbortSignal) {
			underlying = signal;
			return new Promise((_resolve, reject) =>
				signal.addEventListener('abort', () => reject(signal.reason), { once: true })
			);
		},
		publish() {}
	};
	try {
		let settled = false;
		const task = loadExactRemoteModule(
			'https://remote.test/no-framework-deadline.js',
			'sha256-AAAA',
			owner.signal
		).catch((error) => {
			settled = true;
			return error;
		});
		await vi.advanceTimersByTimeAsync(60_000);
		expect(settled).toBe(false);
		expect(underlying.aborted).toBe(false);
		owner.abort(null);
		expect(await task).toBeNull();
		expect(underlying.aborted).toBe(true);
	} finally {
		owner.abort();
		if (previous === undefined) delete host[symbol];
		else host[symbol] = previous;
		vi.useRealTimers();
	}
});
