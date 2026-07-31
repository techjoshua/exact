import { describe, expect, it } from 'vitest';
import {
	paginateExactInspection,
	parseExactInspectionRequest,
	parseExactInspectionResponse,
	parseExactInspectionSubscription
} from './query.js';

describe('eXact inspection query validation', () => {
	it('rejects unknown methods and oversized collection requests', () => {
		expect(() =>
			parseExactInspectionRequest({ protocol: 1, id: '1', method: 'actions.invoke' })
		).toThrow('Unknown');
		expect(() =>
			parseExactInspectionRequest({
				protocol: 1,
				id: '1',
				method: 'tasks.list',
				params: { page: { limit: 501 } }
			})
		).toThrow('limit');
	});

	it('bounds and validates transported response envelopes', () => {
		expect(
			parseExactInspectionResponse({
				protocol: 1,
				id: 'response',
				ok: true,
				identity: { sessionId: 'session' },
				result: [{ name: 'Page' }],
				page: { count: 1 }
			})
		).toMatchObject({ ok: true, result: [{ name: 'Page' }] });
		expect(() =>
			parseExactInspectionResponse({
				protocol: 1,
				id: 'response',
				ok: true,
				identity: { sessionId: 'session' },
				result: [],
				evaluate: 'caller-code'
			})
		).toThrow('Unknown');
		expect(() =>
			parseExactInspectionResponse(
				{
					protocol: 1,
					id: 'response',
					ok: true,
					identity: { sessionId: 'session' },
					result: [1, 2, 3]
				},
				{ maxNodes: 3 }
			)
		).toThrow('large');
	});

	it('resumes pagination without duplicating values', () => {
		const first = paginateExactInspection([1, 2, 3], { limit: 2 });
		const second = paginateExactInspection([1, 2, 3], {
			limit: 2,
			cursor: first.nextCursor
		});
		expect(first.values).toEqual([1, 2]);
		expect(second.values).toEqual([3]);
	});

	it('rejects malformed identities, unknown fields, excessive depth, and subscriptions', () => {
		expect(() =>
			parseExactInspectionRequest({
				protocol: 1,
				id: 'bad-identity',
				method: 'components.get',
				params: { identity: { sessionId: 'session' } }
			})
		).toThrow('runtime identity');
		expect(() =>
			parseExactInspectionRequest({
				protocol: 1,
				id: 'unknown',
				method: 'roots.list',
				params: { execute: true }
			})
		).toThrow('Unknown');
		expect(() =>
			parseExactInspectionRequest(
				{
					protocol: 1,
					id: 'deep',
					method: 'roots.list',
					params: { filter: { kinds: [[['error']]] } }
				},
				{ maxDepth: 3 }
			)
		).toThrow('deep');
		expect(() =>
			parseExactInspectionSubscription({
				protocol: 1,
				sessionId: 'session',
				filter: { kinds: Array.from({ length: 33 }, () => 'error') }
			})
		).toThrow('too large');
	});
});
