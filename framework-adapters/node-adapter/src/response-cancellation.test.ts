import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { createExactAsyncProducedResponse } from '@exactjs/server';
import { expect, it } from 'vitest';
import { writeNodeResponseBody } from './index.js';

it('cancels an owned body blocked on socket drain before releasing request resources', async () => {
	const events = new EventEmitter();
	const response = Object.assign(events, { write: () => false }) as unknown as ServerResponse;
	let unwound = false;
	let released = false;
	const result = createExactAsyncProducedResponse(200, {}, async (write) => {
		try {
			await write('first span');
		} finally {
			unwound = true;
		}
	});
	result.body.retainRequestScope!(async () => {
		expect(unwound).toBe(true);
		released = true;
	});
	const writing = writeNodeResponseBody(response, result).catch((error: unknown) => error);
	const reason = new Error('owned body cancelled');
	let settled = false;
	const cancellation = result.body.cancel(reason).then(() => {
		settled = true;
	});
	try {
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(settled).toBe(true);
		expect(released).toBe(true);
		expect(await writing).toBe(reason);
	} finally {
		// Reap production even when a regression leaves cancellation waiting for the transport.
		events.emit('drain');
		await Promise.all([writing, cancellation]);
	}
});
