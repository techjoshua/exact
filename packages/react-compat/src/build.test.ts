import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

		// The lexical rejection path must still admit core React aliases, not only discovered
		// ecosystem adapter sources.
		const react = engine.transformModule({
			id: '/react-value.js',
			source: 'export { createElement } from "react";',
			format: 'module',
			target: 'client'
		});
		expect(react.changed).toBe(true);
		expect(react.code).toContain('@exactjs/react-compat/react18');
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
					adapterVersion: '0.1.0',
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
				adapterVersion: '0.1.0',
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

	it('classifies package and configured local React component ownership without compiling them', () => {
		const engine = createReactCompatibilityBuildEngine({
			cwd: fixtureRoot,
			target: 18,
			source: /build\.test\.ts$/
		});

		expect(
			engine.jsxInterop.classify({
				importer: path.join(fixtureRoot, 'src', 'App.tsx'),
				sourceModule: '@tanstack/react-query',
				localName: 'QueryClientProvider',
				tagName: 'QueryClientProvider',
				declarationSources: [],
				declarationSignatures: []
			})
		).toBe('component');
		expect(
			engine.jsxInterop.classify({
				importer: path.join(fixtureRoot, 'src', 'App.tsx'),
				sourceModule: './local-react.js',
				localName: 'LocalReact',
				tagName: 'LocalReact',
				declarationSources: [path.join(import.meta.dirname, 'build.test.ts')],
				declarationSignatures: []
			})
		).toBe('component');
		expect(
			engine.jsxInterop.classify({
				importer: path.join(fixtureRoot, 'src', 'App.tsx'),
				sourceModule: './local-exact.js',
				localName: 'LocalExact',
				tagName: 'LocalExact',
				declarationSources: [
					path.resolve(import.meta.dirname, '../../../apps/docs/src/demos/CounterDemo.tsx')
				],
				declarationSignatures: []
			})
		).toBe('exact');
		expect(
			engine.jsxInterop.classify({
				importer: path.join(fixtureRoot, 'src', 'App.tsx'),
				sourceModule: 'unclassified-components',
				localName: 'Unknown',
				tagName: 'Unknown',
				declarationSources: [],
				declarationSignatures: []
			})
		).toBe('unknown');
		expect(
			engine.jsxInterop.classify({
				importer: path.join(fixtureRoot, 'src', 'App.tsx'),
				sourceModule: 'mixed-components',
				localName: 'ExactPanel',
				tagName: 'ExactPanel',
				declarationSources: [],
				declarationSignatures: ['(this: Component<State>, props: Props) => () => JSX.Element']
			})
		).toBe('exact');
		expect(
			engine.jsxInterop.classify({
				importer: path.join(fixtureRoot, 'src', 'App.tsx'),
				sourceModule: 'mixed-components',
				localName: 'ReactPanel',
				tagName: 'ReactPanel',
				declarationSources: [],
				declarationSignatures: ['(props: Props) => ReactNode']
			})
		).toBe('component');
	});

	it('follows local static re-exports and fails closed for unresolved relative ownership', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-react-ownership-'));
		const barrel = path.join(root, 'barrel.ts');
		await writeFile(barrel, `export { Component as Widget } from 'react';`, 'utf8');
		const engine = createReactCompatibilityBuildEngine({ cwd: fixtureRoot, target: 19 });
		const importer = path.join(root, 'App.tsx');

		expect(
			engine.jsxInterop.classify({
				importer,
				sourceModule: './barrel',
				localName: 'Widget',
				tagName: 'Widget',
				declarationSources: [barrel],
				declarationSignatures: []
			})
		).toBe('component');
		expect(
			engine.jsxInterop.classify({
				importer,
				sourceModule: './missing',
				localName: 'Unknown',
				tagName: 'Unknown',
				declarationSources: [],
				declarationSignatures: []
			})
		).toBe('unknown');
		expect(engine.watchFiles).toContain(barrel);
	});

	it('classifies TypeScript components imported through emitted JavaScript specifiers', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-react-emitted-specifier-'));
		const component = path.join(root, 'NativePanel.tsx');
		await writeFile(
			component,
			`import type { Component } from '@exactjs/core';\nexport function NativePanel(this: Component<{}>) { return () => <p>ready</p>; }`,
			'utf8'
		);
		const engine = createReactCompatibilityBuildEngine({ cwd: fixtureRoot, target: 19 });

		expect(
			engine.jsxInterop.classify({
				importer: path.join(root, 'App.tsx'),
				sourceModule: './NativePanel.jsx',
				localName: 'NativePanel',
				tagName: 'NativePanel',
				declarationSources: [],
				declarationSignatures: []
			})
		).toBe('exact');
		expect(engine.watchFiles).toContain(component);
	});
});
