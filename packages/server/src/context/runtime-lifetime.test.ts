import { expect, it } from 'vitest';
import { createExactContextRuntime } from './request.js';

it('cancels request initialization when the runtime closes', async () => {
	let started!: () => void;
	const ready = new Promise<void>((resolve) => {
		started = resolve;
	});
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let signal: AbortSignal | undefined;
	const runtime = createExactContextRuntime({
		requestContexts: async (context) => {
			signal = context.signal;
			started();
			await gate;
			return [];
		}
	});
	const opening = runtime.open({
		url: 'http://localhost/initializing',
		method: 'GET',
		headers: {}
	});
	const rejected = expect(opening).rejects.toBe('shutdown');
	try {
		await ready;
		await runtime.dispose('shutdown');
		expect(signal?.aborted).toBe(true);
		await rejected;
	} finally {
		release();
		await runtime.dispose();
	}
});
