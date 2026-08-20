import { setExactServerObservationBridge } from '@exactjs/core/framework/inspection-transport';
import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import { invokeExact } from './invocations.js';

const sessionId = 'request-observation-session';

describe('request-scoped server observations', () => {
	it('adds the attached session and publishes observations from one JSON response', async () => {
		const received: ExactRuntimeInspectionEvent[] = [];
		const clear = setExactServerObservationBridge({
			sessionId,
			publish: (event) => received.push(event)
		});
		let requestHeaders = new Headers();
		try {
			const result = await invokeExact({
				type: 'invoke',
				id: 'save',
				endpoint: '/__exact',
				fetch: async (_input, init) => {
					requestHeaders = new Headers(init?.headers);
					return new Response(
						JSON.stringify({
							ok: true,
							type: 'invoke',
							id: 'save',
							value: 'saved',
							__exactObservations: [observation('task.settle')]
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
			});
			expect(result.value).toBe('saved');
			expect(requestHeaders.get('x-exact-debug-session')).toBe(sessionId);
			expect(received.map((event) => event.kind)).toEqual(['task.settle']);
		} finally {
			clear();
		}
	});

	it('publishes a stream observation frame without treating it as an operation result', async () => {
		const received: ExactRuntimeInspectionEvent[] = [];
		const clear = setExactServerObservationBridge({
			sessionId,
			publish: (event) => received.push(event)
		});
		try {
			const lines = [
				{ event: 'start', version: 1, operations: 1 },
				{ event: 'result', version: 1, index: 0, result: { ok: true, type: 'invoke', id: 'save' } },
				{ event: 'observations', version: 1, observations: [observation('task.settle')] },
				{ event: 'complete', version: 1 }
			]
				.map((line) => JSON.stringify(line))
				.join('\n');
			await invokeExact({
				type: 'invoke',
				id: 'save',
				endpoint: '/__exact',
				stream: true,
				fetch: async () =>
					new Response(lines, {
						status: 200,
						headers: { 'content-type': 'application/x-ndjson' }
					})
			});
			expect(received.map((event) => event.kind)).toEqual(['task.settle']);
		} finally {
			clear();
		}
	});

	it('consumes observations from a failed request before reporting transport failure', async () => {
		const received: ExactRuntimeInspectionEvent[] = [];
		const clear = setExactServerObservationBridge({
			sessionId,
			publish: (event) => received.push(event)
		});
		try {
			await expect(
				invokeExact({
					type: 'invoke',
					id: 'save',
					endpoint: '/__exact',
					fetch: async () =>
						new Response(
							JSON.stringify({
								error: 'internal_error',
								__exactObservations: [observation('error')]
							}),
							{ status: 500, headers: { 'content-type': 'application/json' } }
						)
				})
			).rejects.toThrow('invocation failed');
			expect(received.map((event) => event.kind)).toEqual(['error']);
		} finally {
			clear();
		}
	});
});

function observation(kind: ExactRuntimeInspectionEvent['kind']): ExactRuntimeInspectionEvent {
	return {
		protocol: 1,
		cursor: '1',
		sequence: 1,
		timestamp: 1,
		kind,
		id: {
			sessionId,
			side: 'server',
			buildKey: '0'.repeat(40),
			executionRoot: 'page',
			componentTypeId: 'component:Page'
		}
	};
}
