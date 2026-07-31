import type {
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactRuntimeSourceLocation
} from '@exactjs/devtools-protocol';
import { describe, expect, it, vi } from 'vitest';
import type { ExactExtensionQueryClient } from '../messages.js';
import {
	exportExactTimeline,
	loadExactProfilerCapture,
	resolveExactSourceLocation
} from './model.js';

describe('Chromium DevTools panel model', () => {
	it('refuses source providers whose hash does not match the running build', () => {
		const location: ExactRuntimeSourceLocation = {
			path: 'src/Page.tsx',
			sourceHash: 'matching',
			start: { offset: 0, line: 4, column: 2 },
			end: { offset: 1, line: 4, column: 3 }
		};
		expect(
			resolveExactSourceLocation(location, [
				{ path: 'src/Page.tsx', sourceHash: 'stale', source: 'workspace' }
			])
		).toBeUndefined();
		expect(
			resolveExactSourceLocation(location, [
				{ path: 'src/Page.tsx', sourceHash: 'matching', source: 'map' }
			])
		).toMatchObject({ line: 4, source: 'map' });
	});

	it('bounds timeline exports', () => {
		const events = Array.from({ length: 4 }, (_, sequence) => ({
			protocol: 1 as const,
			cursor: String(sequence + 1),
			sequence: sequence + 1,
			timestamp: sequence,
			kind: 'interaction' as const,
			id: {
				sessionId: 'session',
				side: 'client' as const,
				buildKey: 'build',
				executionRoot: 'page',
				componentTypeId: 'component:Page'
			}
		}));
		expect(JSON.parse(exportExactTimeline(events, 2)).events).toHaveLength(2);
	});

	it('finalizes a profile by paging retained events after the recording cursor', async () => {
		const request = vi
			.fn<(request: ExactInspectionRequest) => Promise<ExactInspectionResponse>>()
			.mockResolvedValueOnce({
				protocol: 1,
				id: 'panel:timeline.query',
				ok: true,
				identity: { sessionId: 'session' },
				result: [runtimeEvent(2)],
				page: { count: 1, nextCursor: 'm2:next' }
			})
			.mockResolvedValueOnce({
				protocol: 1,
				id: 'panel:timeline.query',
				ok: true,
				identity: { sessionId: 'session' },
				result: [],
				page: { count: 0, nextCursor: 'm2:next' }
			});
		const client = { request } as unknown as ExactExtensionQueryClient;

		const capture = await loadExactProfilerCapture(client, 'm2:start');

		expect(capture).toHaveLength(1);
		expect(request).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				params: { page: { cursor: 'm2:start', limit: 500 } }
			})
		);
		expect(request).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				params: { page: { cursor: 'm2:next', limit: 500 } }
			})
		);
	});
});

function runtimeEvent(sequence: number) {
	return {
		protocol: 1 as const,
		cursor: String(sequence),
		sequence,
		timestamp: sequence,
		kind: 'state.change' as const,
		id: {
			sessionId: 'session',
			side: 'client' as const,
			buildKey: 'build',
			executionRoot: 'page',
			componentTypeId: 'component:Page',
			instanceId: 'page'
		}
	};
}
