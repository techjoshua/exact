import { describe, expect, it } from 'vitest';
import {
	assertExactClientArtifactIsolation,
	inspectExactClientArtifactIsolation
} from './artifact-isolation.js';

describe('@exactjs/compiler final artifact isolation', () => {
	it('accepts client and shared contributions', () => {
		expect(
			inspectExactClientArtifactIsolation([
				{
					type: 'chunk',
					fileName: 'assets/page.js',
					modules: ['/src/page.exact.client.ts', '/src/shared.ts'],
					imports: ['assets/vendor.js'],
					dynamicImports: ['assets/lazy.js']
				}
			])
		).toEqual({ ok: true, violations: [] });
	});

	it('reports server modules, chunks, dynamic edges, assets, and public map sources', () => {
		const report = inspectExactClientArtifactIsolation([
			{
				type: 'chunk',
				fileName: 'assets/page.exact.server.js',
				modules: ['/src/provider.exact.server.ts'],
				imports: ['assets/shared.js'],
				dynamicImports: ['assets/lazy.exact.server.js']
			},
			{
				type: 'asset',
				fileName: 'assets/schema.exact.server.wasm'
			},
			{
				type: 'map',
				fileName: 'assets/page.js.map',
				sources: ['/src/private.exact.server.ts']
			}
		]);

		expect(report.ok).toBe(false);
		expect(report.violations.map(({ kind }) => kind)).toEqual([
			'file',
			'module',
			'dynamic-import',
			'file',
			'source'
		]);
	});

	it('accepts host-discovered forbidden module identities and throws a stable build error', () => {
		expect(() =>
			assertExactClientArtifactIsolation(
				[
					{
						type: 'chunk',
						fileName: 'assets/page.js',
						modules: ['C:\\app\\node_modules\\heavy-server-client\\index.js?commonjs']
					}
				],
				['C:/app/node_modules/heavy-server-client/index.js']
			)
		).toThrow(
			'assets/page.js: module C:\\app\\node_modules\\heavy-server-client\\index.js?commonjs'
		);
	});
});
