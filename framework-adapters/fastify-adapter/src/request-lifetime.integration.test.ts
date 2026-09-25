import Fastify from 'fastify';
import { defineExactOperationContract } from '@exactjs/server';
import { expect, it, vi } from 'vitest';
import { createExactFastifyHandler } from './index.js';

it('keeps response work alive after Fastify finishes consuming a request body', async () => {
	const app = Fastify({ forceCloseConnections: true });
	app.post(
		'/__exact',
		createExactFastifyHandler({
			contract: {
				version: 1,
				invocations: { job: defineExactOperationContract('job') },
				boundaries: {}
			},
			invocations: {
				job: async () => {
					await new Promise((resolve) => setTimeout(resolve, 25));
					return { value: 'done' };
				}
			}
		})
	);
	try {
		const url = await app.listen({ host: '127.0.0.1', port: 0 });
		const response = await fetch(url + '/__exact', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'invoke', id: 'job' })
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ value: 'done' });
	} finally {
		await app.close();
	}
});

it('still aborts response work when the client disconnects', async () => {
	const app = Fastify({ forceCloseConnections: true });
	const controller = new AbortController();
	const aborted = vi.fn();
	let started!: () => void;
	const ready = new Promise<void>((resolve) => {
		started = resolve;
	});
	app.post(
		'/__exact',
		createExactFastifyHandler({
			contract: {
				version: 1,
				invocations: { job: defineExactOperationContract('job') },
				boundaries: {}
			},
			invocations: {
				job: async (_input, context) => {
					started();
					await new Promise<void>((resolve) =>
						context.signal!.addEventListener(
							'abort',
							() => {
								aborted();
								resolve();
							},
							{ once: true }
						)
					);
					return { value: 'done' };
				}
			}
		})
	);
	try {
		const url = await app.listen({ host: '127.0.0.1', port: 0 });
		const response = fetch(url + '/__exact', {
			method: 'POST',
			signal: controller.signal,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'invoke', id: 'job' })
		});
		const outcome = response.then(
			(value) => ({ value }),
			(error) => ({ error })
		);
		await Promise.race([
			ready,
			outcome.then(() => {
				throw new Error('Response ended before handler activation');
			})
		]);
		controller.abort();
		expect(await outcome).toHaveProperty('error');
		await vi.waitFor(() => expect(aborted).toHaveBeenCalledOnce());
	} finally {
		controller.abort();
		await app.close();
	}
});
