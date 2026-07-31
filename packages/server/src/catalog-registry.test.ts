import type { ExactBuildInspectionCatalog } from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import { createExactInspectionCatalogRegistry } from './index.js';

describe('retained inspection catalog ownership', () => {
	it('retires only the exact registered build when its lifecycle handle is disposed', () => {
		const first = catalog('1'.repeat(40));
		const second = catalog('2'.repeat(40));
		const registry = createExactInspectionCatalogRegistry([first]);
		const retained = registry.register(second);

		expect(registry.find(first.buildKey, 'page')).toBe(first.roots.page);
		expect(registry.find(second.buildKey, 'page')).toBe(second.roots.page);
		retained.dispose();
		expect(registry.find(second.buildKey, 'page')).toBeUndefined();
		expect(registry.find(first.buildKey, 'page')).toBe(first.roots.page);
	});
});

function catalog(buildKey: string): ExactBuildInspectionCatalog {
	const sourceHash = buildKey.padEnd(64, 'a');
	return {
		protocol: 1,
		buildKey,
		producer: {},
		roots: {
			page: {
				executionRoot: 'page',
				rootComponentId: 'component:Page',
				files: [
					{
						path: 'src/Page.tsx',
						sourceHash,
						components: [
							{
								id: 'component:Page',
								kind: 'component',
								location: {
									path: 'src/Page.tsx',
									sourceHash,
									start: { offset: 0, line: 1, column: 1 },
									end: { offset: 1, line: 1, column: 2 }
								},
								reasons: [],
								children: []
							}
						]
					}
				],
				redactions: { statePaths: [], contextTokens: [], secretNames: [] }
			}
		}
	};
}
