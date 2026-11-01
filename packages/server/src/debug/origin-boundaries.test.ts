import { verifyServerEventOwnership } from '../../../component-composition-corpus/test-support/inspection-event-journey.mjs';
import { expect, it, vi } from 'vitest';
import { handleExactRequest } from '../index.js';
import type { ExactServerContext } from '../types.js';
import { createExactServerDebugRuntime } from './runtime.js';

/** Owns an explicit debug policy without supplying an implicit origin authority. */
function context(overrides: Partial<ExactServerContext> = {}): ExactServerContext {
	return {
		contract: { version: 1, endpoint: '/__exact', invocations: {}, executors: {}, boundaries: {} },
		...overrides
	};
}

it.each(['/__exact', '//evil.test/__exact'])(
	'rejects an unanchored origin for relative request URL %s before authorization',
	async (url) => {
		const allowDebug = vi.fn(() => true);
		const response = await handleExactRequest(
			{
				method: 'POST',
				url,
				headers: { origin: 'https://evil.test' },
				body: { type: 'debug', version: 1, request: 'open' }
			},
			context({ allowDebug })
		);
		expect(response.status).toBe(404);
		expect(allowDebug).not.toHaveBeenCalled();
	}
);

it('uses the configured origin resolver to reject a forged debug origin', async () => {
	const publicOrigin = vi.fn(() => 'https://app.test');
	const allowDebug = vi.fn(() => true);
	const response = await handleExactRequest(
		{
			method: 'POST',
			url: '/__exact',
			headers: { origin: 'https://evil.test' },
			body: { type: 'debug', version: 1, request: 'open' }
		},
		context({ publicOrigin, allowDebug })
	);
	expect(response.status).toBe(404);
	expect(publicOrigin).toHaveBeenCalledTimes(1);
	expect(allowDebug).not.toHaveBeenCalled();
});

it.each([
	'',
	'https://app.test',
	'https://app.test/',
	'https://user@app.test',
	'null',
	'https://app.test/path'
])('compares browser Origin as an origin value: %s', async (origin) => {
	const publicOrigin = vi.fn(() => 'https://app.test');
	const allowDebug = vi.fn(() => true);
	const response = await handleExactRequest(
		{
			method: 'POST',
			url: '/__exact',
			headers: { origin },
			body: { type: 'debug', version: 1, request: 'open' }
		},
		context({ publicOrigin, allowDebug })
	);
	expect(response.status).toBe(origin === 'https://app.test' ? 200 : 404);
	expect(publicOrigin).toHaveBeenCalledTimes(1);
	expect(allowDebug.mock.calls.length > 0).toBe(origin === 'https://app.test');
});

it.each(['https://app.test/__exact', '/__exact'])(
	'uses absolute transport authority without guessing authority for %s',
	async (url) => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				url,
				headers: { origin: 'https://app.test' },
				body: { type: 'debug', version: 1, request: 'open' }
			},
			context({ allowDebug: true })
		);
		expect(response.status).toBe(url.startsWith('https:') ? 200 : 404);
	}
);

it('applies the origin boundary to existing-session authorization and request observations', async () => {
	const allowDebug = vi.fn(() => true);
	const runtime = createExactServerDebugRuntime(
		context({ publicOrigin: () => 'https://app.test', allowDebug })
	);
	const request = { method: 'POST', url: '/__exact', headers: { origin: 'https://app.test' } };
	const opened = await runtime.handle(request, {
		type: 'debug',
		version: 1,
		request: 'open',
		capabilities: ['events']
	});
	const { session } = JSON.parse(String(opened.body));
	allowDebug.mockClear();
	const forged = { ...request, headers: { origin: 'https://evil.test' } };
	expect(
		await runtime.authorize(forged, {
			type: 'debug',
			version: 1,
			request: 'subscribe',
			sessionId: session.id
		})
	).toBe(false);
	expect(await runtime.createRequestRuntime(forged, session.id)).toBeUndefined();
	expect(allowDebug).not.toHaveBeenCalled();
	const observations = await runtime.createRequestRuntime(request, session.id);
	expect(observations).toBeDefined();
	await observations?.dispose();
	await runtime.close();
});

it('captures request event attributes and returns ordinary drained observations', async () => {
	expect(await verifyServerEventOwnership({ createExactServerDebugRuntime })).toBe(true);
});
