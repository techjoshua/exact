import type { ExactRuntimeSourceEntity } from '@exactjs/devtools-protocol';
/** Creates a small compiler-owned catalog with one valid source entity and no application values. */
export function createInspectionCatalogFixture(rootId = 'root') {
	const location = {
		path: 'src/Page.tsx',
		sourceHash: 'a'.repeat(64),
		start: { offset: 0, line: 1, column: 1 },
		end: { offset: 10, line: 1, column: 11 }
	};
	return {
		protocol: 1 as const,
		buildKey: 'build',
		producer: {},
		roots: {
			page: {
				executionRoot: 'page',
				rootComponentId: rootId,
				files: [
					{
						path: location.path,
						sourceHash: location.sourceHash,
						components: [
							{
								id: rootId,
								kind: 'component',
								location,
								reasons: [] as ExactRuntimeSourceEntity['reasons'],
								children: [] as ExactRuntimeSourceEntity[]
							}
						]
					}
				],
				redactions: { statePaths: [] as string[], secretNames: [] as string[], contextTokens: [] }
			}
		}
	};
}
