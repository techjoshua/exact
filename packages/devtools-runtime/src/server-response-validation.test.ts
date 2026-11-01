import { expect, it } from 'vitest';
import type { ExactInspectionRequest } from '@exactjs/devtools-protocol';
import { createExactBrowserServerInspectionClient } from './server-client.js';

const session = {
	id: 'session',
	protocol: 1,
	openedAt: 1,
	expiresAt: 1000,
	capabilities: ['catalog']
};
it.each([
	{ id: '' },
	{ protocol: 2 },
	{ openedAt: null },
	{ expiresAt: 0 },
	{ capabilities: [['catalog']] },
	{ capabilities: ['invoke'] }
])('rejects malformed server session metadata: %j', async (changed) => {
	const client = createExactBrowserServerInspectionClient('/__exact', async () =>
		Response.json({ session: { ...session, ...changed } })
	);
	await expect(client.open(['catalog'])).resolves.toBeUndefined();
});

it('accepts a supported session description without requiring optional catalog metadata', async () => {
	const client = createExactBrowserServerInspectionClient('/__exact', async () =>
		Response.json({ session })
	);
	await expect(client.open(['catalog'])).resolves.toEqual(session);
});

const request: ExactInspectionRequest = { protocol: 1, id: 'query', method: 'roots.list' };
const response = {
	protocol: 1,
	id: 'query',
	ok: true,
	identity: { sessionId: 'session' },
	result: []
};
it.each([
	{ id: 'other-query' },
	{ identity: { sessionId: 'other-session' } },
	{ protocol: 2 },
	{ execute: 'caller-code' },
	{ ok: 'true' }
])('rejects malformed or miscorrelated query responses: %j', async (changed) => {
	const client = createExactBrowserServerInspectionClient('/__exact', async () =>
		Response.json({ ...response, ...changed })
	);
	await expect(client.query('session', request)).rejects.toThrow(TypeError);
});

it.each([
	response,
	{ protocol: 1, id: 'query', ok: false, error: 'unavailable', reason: 'runtime-not-instrumented' }
])('retains supported success and failure responses', async (value) => {
	const client = createExactBrowserServerInspectionClient('/__exact', async () =>
		Response.json(value)
	);
	await expect(client.query('session', request)).resolves.toEqual(value);
});

it('rejects a query failure whose error code is an array', async () => {
	const client = createExactBrowserServerInspectionClient('/__exact', async () =>
		Response.json({
			protocol: 1,
			id: 'query',
			ok: false,
			error: ['unavailable']
		})
	);
	await expect(client.query('session', request)).rejects.toThrow(TypeError);
});
