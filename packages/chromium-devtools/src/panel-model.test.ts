import { describe, expect, it } from 'vitest';
import type { ExactRuntimeSourceLocation } from '@exactjs/devtools-protocol';
import { exportExactTimeline, resolveExactSourceLocation } from './panel-model.js';

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
});
