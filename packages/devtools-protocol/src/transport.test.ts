import { expect, it, vi } from 'vitest';
import { exactDebugCapabilityForRequest, parseExactDebugRequest } from './transport.js';
import { parseExactInspectionRequest } from './query.js';

it.each([
	{ type: 'debug', version: 1, request: 'open' },
	{
		type: 'debug',
		version: 1,
		request: 'open',
		capabilities: ['catalog', 'snapshot', 'events', 'source']
	},
	{ type: 'debug', version: 1, request: 'close', sessionId: 'session' },
	{
		type: 'debug',
		version: 1,
		request: 'subscribe',
		sessionId: 'session',
		cursor: 'cursor',
		filter: { side: 'client' }
	},
	{
		type: 'debug',
		version: 1,
		request: 'query',
		sessionId: 'session',
		query: { protocol: 1, id: 'query', method: 'roots.list' }
	}
])('accepts supported debug envelopes: $request', (value) => {
	expect(parseExactDebugRequest(value)).toEqual(value);
});

it.each([
	{ request: ['close'], sessionId: 'session' },
	{ request: 'open', capabilities: [['catalog']] },
	{ request: 'open', id: 'operation', payload: {} },
	{
		request: 'query',
		sessionId: 'session',
		query: { protocol: 1, id: 'query', method: 'roots.list' },
		invoke: 'operation'
	},
	{ request: 'subscribe', sessionId: 'session', execute: 'caller-code' },
	{ request: 'close', sessionId: 'session', capabilities: ['source'] }
])('rejects malformed or invocation-shaped debug envelopes: %j', (fields) => {
	expect(() => parseExactDebugRequest({ type: 'debug', version: 1, ...fields })).toThrow(TypeError);
});

it('does not coerce request names or capabilities through caller code', () => {
	const toString = vi.fn(() => 'catalog');
	for (const value of [
		{ type: 'debug', version: 1, request: { toString }, sessionId: 'session' },
		{ type: 'debug', version: 1, request: 'open', capabilities: [{ toString }] }
	])
		expect(() => parseExactDebugRequest(value)).toThrow(TypeError);
	expect(toString).not.toHaveBeenCalled();
});

it.each(['evaluate', 'execute', 'invocation', 'payload'])(
	'rejects unknown top-level query fields: %s',
	(key) => {
		expect(() =>
			parseExactInspectionRequest({
				protocol: 1,
				id: 'query',
				method: 'roots.list',
				[key]: 'caller-code'
			})
		).toThrow(TypeError);
	}
);

it.each([
	['source.excerpt', 'source'],
	['catalog.entity', 'catalog'],
	['dependencies.explain', 'catalog'],
	['partitions.plan', 'catalog'],
	['roots.list', 'snapshot']
] as const)('selects the authorized capability for %s', (method, expected) => {
	expect(
		exactDebugCapabilityForRequest({
			type: 'debug',
			version: 1,
			request: 'query',
			sessionId: 'session',
			query: { protocol: 1, id: 'query', method }
		})
	).toBe(expected);
});
