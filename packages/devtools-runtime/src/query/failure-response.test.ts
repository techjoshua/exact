import { expect, it } from 'vitest';
import { createExactClientInspectionQueryService } from '../query-service.js';
import { failedInspectionResponse, successfulInspectionResponse } from './response.js';
import { parseExactInspectionResponse } from '@exactjs/devtools-protocol';
import { createExactClientEventStore } from '../client-events.js';

it('returns ordinary observation values whose aliases do not freeze caller data', () => {
	const result = ['original'];
	const response = successfulInspectionResponse(
		{ protocol: 1, id: 'request', method: 'roots.list' },
		'session',
		result,
		'next'
	);
	const alias = response as {
		id: string;
		identity: { sessionId: string };
		page: { count: number };
	};
	alias.id = 'local';
	alias.identity.sessionId = 'local';
	alias.page.count = 7;
	result.push('later');
	expect(alias).toMatchObject({
		id: 'local',
		identity: { sessionId: 'local' },
		page: { count: 7 }
	});
	expect(result).toEqual(['original', 'later']);
});

it('returns a bounded protocol response for hostile failure descriptions', () => {
	for (const reason of [
		{
			[Symbol.toPrimitive](): never {
				throw new Error('conversion');
			}
		},
		new Proxy(
			{},
			{
				getPrototypeOf(): never {
					throw new Error('prototype');
				}
			}
		),
		Object.defineProperty(new Error('original'), 'message', {
			get(): never {
				throw new Error('message');
			}
		}),
		new Error('x'.repeat(4096))
	])
		expect(() =>
			parseExactInspectionResponse(failedInspectionResponse('request', 'bad-request', reason))
		).not.toThrow();
});

it('reports malformed input failures without replacing them during formatting', async () => {
	const service = createExactClientInspectionQueryService({
		sessionId: 'test',
		serverConnected: false,
		dom: {
			attach() {},
			detach() {},
			ownerOfElement: () => undefined,
			ownedElements: () => [],
			snapshot() {
				return { roots: [], components: [], partitions: [] };
			}
		},
		events: createExactClientEventStore(100, 100_000)
	});
	const reason = {
		[Symbol.toPrimitive](): never {
			throw new Error('conversion');
		}
	};
	const request = new Proxy(
		{ protocol: 1 as const, id: 'hostile', method: 'roots.list' as const },
		{
			getPrototypeOf(): never {
				throw reason;
			}
		}
	);
	await expect(service.request(request)).resolves.toMatchObject({
		ok: false,
		error: 'bad-request',
		id: 'hostile'
	});
	await expect(
		service.request({ protocol: 1, id: 'next', method: 'roots.list' })
	).resolves.toMatchObject({ ok: true, id: 'next' });
});
