import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReactCompatibilityBuildEngine } from './build.js';

const fixtureRoot = path.resolve(
	import.meta.dirname,
	'../../../framework-adapters/vite-plugin/test-fixtures/adapter-app'
);

describe('React compatibility build engine', () => {
	it('reports a frozen registry and fast-paths irrelevant modules', () => {
		const engine = createReactCompatibilityBuildEngine({ cwd: fixtureRoot, target: 18 });
		expect(engine.report()).toMatchObject({
			activeAdapters: ['@exactjs/tanstack-query'],
			target: 18
		});
		const result = engine.transformModule({
			id: '/value.js',
			source: 'export const value = 1;',
			format: 'module',
			target: 'client'
		});
		expect(result.changed).toBe(false);
		expect(result.registryHash).toBe(engine.registryHash);
	});

	it('provides complete fallback diagnostics and unused-adapter accounting', () => {
		const engine = createReactCompatibilityBuildEngine({ cwd: fixtureRoot, target: 18 });
		const result = engine.transformModule({
			id: '/query.js',
			source:
				'import { QueryClientProvider, useQuery } from "@tanstack/react-query"; export { QueryClientProvider, useQuery };',
			format: 'module',
			target: 'client'
		});
		expect(result.code).toContain('from "@exactjs/tanstack-query/react"');
		expect(result.code).toContain('useQuery } from "@tanstack/react-query"');
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'compatibility-retained',
					adapterPackage: '@exactjs/tanstack-query',
					adapterVersion: '0.0.0',
					sourceVersion: '>=5 <6',
					sourceExport: 'QueryClientProvider',
					replacementExport: 'QueryClientProvider'
				})
			])
		);
		expect(engine.report().unusedAdapters).toEqual([]);
		expect(engine.report().selections).toEqual([
			expect.objectContaining({
				importer: '/query.js',
				status: 'substituted',
				sourceModule: '@tanstack/react-query',
				sourceExport: 'QueryClientProvider',
				sourceLocation: expect.stringContaining('node_modules'),
				installedVersion: '5.101.2',
				adapterPackage: '@exactjs/tanstack-query',
				adapterVersion: '0.0.0',
				targetModule: '@exactjs/tanstack-query/react',
				targetExport: 'QueryClientProvider'
			})
		]);
	});

	it('reports dynamic export escapes without executing adapter code', () => {
		const engine = createReactCompatibilityBuildEngine({ cwd: fixtureRoot, target: 18 });
		const result = engine.transformModule({
			id: '/dynamic.js',
			source: 'export const query = import("@tanstack/react-query");',
			format: 'module',
			target: 'server'
		});
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'dynamic-export-escape',
					adapterPackage: '@exactjs/tanstack-query'
				})
			])
		);
	});
});
