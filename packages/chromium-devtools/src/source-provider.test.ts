import { createHash } from 'node:crypto';
import type { ExactRuntimeSourceLocation } from '@exactjs/devtools-protocol';
import { describe, expect, it, vi } from 'vitest';
import { findExactChromiumSourceResource, type ExactChromiumResource } from './source-provider.js';

describe('Chromium exact-hash source providers', () => {
	it('prefers a matching source-map resource before reading a workspace candidate', async () => {
		const source = 'export function Page() { return () => <main />; }';
		const location: ExactRuntimeSourceLocation = {
			path: 'src/Page.tsx',
			sourceHash: createHash('sha256').update(source).digest('hex'),
			start: { offset: 0, line: 1, column: 1 },
			end: { offset: source.length, line: 1, column: source.length + 1 }
		};
		const staleWorkspace = resource('file:///workspace/src/Page.tsx', 'stale');
		const sourceMap = resource('webpack:///src/Page.tsx', source);
		const selected = await findExactChromiumSourceResource(location, [staleWorkspace, sourceMap]);

		expect(selected?.url).toBe(sourceMap.url);
		expect(staleWorkspace.getContent).not.toHaveBeenCalled();
	});

	it('returns no resource when every matching path has a stale hash', async () => {
		const location: ExactRuntimeSourceLocation = {
			path: 'src/Page.tsx',
			sourceHash: createHash('sha256').update('current').digest('hex'),
			start: { offset: 0, line: 1, column: 1 },
			end: { offset: 1, line: 1, column: 2 }
		};
		expect(
			await findExactChromiumSourceResource(location, [
				resource('file:///workspace/src/Page.tsx', 'stale')
			])
		).toBeUndefined();
	});
});

function resource(
	url: string,
	content: string
): ExactChromiumResource & {
	getContent: ReturnType<typeof vi.fn>;
} {
	return {
		url,
		getContent: vi.fn((callback: (content: string) => void) => callback(content))
	};
}
