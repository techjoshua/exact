import { verifyInspectionPreviewOwnership } from '../../component-composition-corpus/test-support/inspection-observation-journey.mjs';
import { previewExactValue, redactExactValue } from './value-preview.js';
import { describe, expect, it } from 'vitest';
import {
	EXACT_INSPECTION_METHODS,
	paginateExactInspection,
	parseExactInspectionRequest,
	parseExactInspectionResponse,
	parseExactInspectionSubscription
} from './query.js';

const request = (params: object) => ({ protocol: 1, id: 'query', method: 'roots.list', params });

describe('inspection query field boundaries', () => {
	it('accepts bounded string parameters and rejects empty, oversized and nonstring values', () => {
		for (const [key, maximum] of [
			['elementId', 512],
			['sourceEntityId', 512],
			['sourceHash', 512],
			['path', 2048]
		] as const) {
			expect(
				parseExactInspectionRequest(request({ [key]: 'x'.repeat(maximum) })).params?.[key]
			).toHaveLength(maximum);
			for (const value of ['', 'x'.repeat(maximum + 1), 1, null])
				expect(() => parseExactInspectionRequest(request({ [key]: value }))).toThrow(TypeError);
		}
	});

	it('protects pagination shape, integer bounds and cursor values', () => {
		for (const page of [
			null,
			[],
			{ extra: true },
			{ limit: 0 },
			{ limit: 1.5 },
			{ limit: 501 },
			{ cursor: '' },
			{ cursor: 1 },
			{ cursor: 'x'.repeat(2049) }
		])
			expect(() => parseExactInspectionRequest(request({ page }))).toThrow();
		for (const limit of [1, 500])
			expect(
				parseExactInspectionRequest(request({ page: { limit, cursor: '0' } })).params?.page
			).toEqual({ limit, cursor: '0' });
	});

	it('applies filter controls equally to requests and subscriptions', () => {
		for (const parse of [
			(filter: object) => parseExactInspectionRequest(request({ filter })),
			(filter: object) => parseExactInspectionSubscription({ protocol: 1, sessionId: 's', filter })
		]) {
			for (const side of ['client', 'server']) expect(() => parse({ side })).not.toThrow();
			for (const filter of [
				{ extra: true },
				{ side: 'worker' },
				{ side: null },
				{ kinds: 'error' },
				{ kinds: [''] },
				{ kinds: ['x'.repeat(129)] }
			])
				expect(() => parse(filter)).toThrow();
			for (const key of [
				'binding',
				'buildKey',
				'executionRoot',
				'componentTypeId',
				'instanceId',
				'sourceEntityId',
				'operationId',
				'requestId',
				'interactionId'
			]) {
				expect(() => parse({ [key]: 'x'.repeat(512) })).not.toThrow();
				for (const value of ['', 'x'.repeat(513), 1, null])
					expect(() => parse({ [key]: value })).toThrow(TypeError);
			}
		}
	});

	it('validates transported success identity and page metadata without accepting missing results', () => {
		const success = {
			protocol: 1,
			id: 'response',
			ok: true,
			identity: { sessionId: 's' },
			result: null
		};
		for (const identity of [null, [], {}, { sessionId: '' }, { sessionId: 's', extra: true }])
			expect(() => parseExactInspectionResponse({ ...success, identity })).toThrow(TypeError);
		for (const key of ['buildKey', 'executionRoot', 'binding']) {
			expect(() =>
				parseExactInspectionResponse({
					...success,
					identity: { sessionId: 's', [key]: 'x'.repeat(512) }
				})
			).not.toThrow();
			for (const value of ['', 'x'.repeat(513), 1, null])
				expect(() =>
					parseExactInspectionResponse({ ...success, identity: { sessionId: 's', [key]: value } })
				).toThrow(TypeError);
		}
		const { result: _result, ...missing } = success;
		expect(() => parseExactInspectionResponse(missing)).toThrow(TypeError);
		for (const page of [
			null,
			[],
			{},
			{ count: -1 },
			{ count: 1.5 },
			{ count: 0, extra: true },
			{ count: 0, nextCursor: '' },
			{ count: 0, nextCursor: 1 }
		])
			expect(() => parseExactInspectionResponse({ ...success, page })).toThrow(TypeError);
		expect(() => parseExactInspectionResponse({ ...success, page: { count: 0 } })).not.toThrow();
	});
});

it('keeps public method metadata separate from dispatch authority', () => {
	if (false) {
		// @ts-expect-error Public method metadata retains TypeScript readonly declarations.
		EXACT_INSPECTION_METHODS[0] = 'session.describe';
	}
	const metadata = EXACT_INSPECTION_METHODS as unknown as string[];
	const first = metadata[0]!;
	try {
		metadata[0] = 'actions.invoke';
		expect(() =>
			parseExactInspectionRequest({ protocol: 1, id: 'query', method: 'actions.invoke' })
		).toThrow('Unknown');
		expect(parseExactInspectionRequest({ protocol: 1, id: 'query', method: first }).method).toBe(
			first
		);
	} finally {
		metadata[0] = first;
	}
});

it('returns an ordinary page while retaining documented shallow item identity', () => {
	const item = { count: 1 },
		values = [item, { count: 2 }];
	const page = paginateExactInspection(values, { limit: 1 });
	expect(page.values[0]).toBe(item);
	const selected = page.values as typeof values;
	selected.length = 0;
	const writable: { nextCursor?: string } = page;
	writable.nextCursor = 'observation';
	expect(values).toHaveLength(2);
});

it('runs the shared preview and authority ownership journey', () => {
	expect(
		verifyInspectionPreviewOwnership({
			previewExactValue,
			redactExactValue,
			paginateExactInspection,
			EXACT_INSPECTION_METHODS,
			parseExactInspectionRequest
		})
	).toBe(true);
});
