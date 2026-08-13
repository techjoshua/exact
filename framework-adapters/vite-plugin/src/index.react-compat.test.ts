import { createReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exact as createExact } from './index.js';

const exact = (...args: Parameters<typeof createExact>) =>
	createExact(...args) as Omit<ReturnType<typeof createExact>, 'transform'> & {
		transform(
			...values: Parameters<ReturnType<typeof createExact>['transform']>
		): Awaited<ReturnType<ReturnType<typeof createExact>['transform']>>;
	};

describe('@exactjs/vite-plugin: React compatibility', () => {
	it('automatically aliases installed React and compiles React-owned JSX to the compatibility runtime', () => {
		const compatibilityRoot = path.resolve(import.meta.dirname, '../test-fixtures/adapter-app');
		const plugin = exact({
			reactCompatibility: { target: 18, source: '/react/', cwd: compatibilityRoot }
		});
		const config = plugin.config?.();
		expect(config?.resolve.alias).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ replacement: '@exactjs/react-compat/react18' }),
				expect.objectContaining({ replacement: '@exactjs/react-dom-compat/client18' })
			])
		);
		expect(
			plugin.transform(
				'/** @jsxImportSource react */\nconst view = <span />;',
				'/src/react-view.tsx'
			)?.code
		).toContain('@exactjs/react-compat/jsx-runtime18');
		expect(plugin.transform('const view = <span />;', '/src/react/widget.tsx')?.code).toContain(
			'@exactjs/react-compat/jsx-runtime18'
		);
		expect(
			exact({ reactCompatibility: { target: 18, cwd: compatibilityRoot } }).config?.().resolve.alias
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ replacement: '@exactjs/react-compat/react18' })
			])
		);
		expect(
			exact({ reactCompatibility: { target: 18, cwd: compatibilityRoot } }).transform(
				'import { useState } from "react"; const view = <span>{useState(0)[0]}</span>;',
				'/src/inferred.tsx'
			)?.code
		).toContain('@exactjs/react-compat/jsx-runtime18');
		expect(plugin.transform('const view = <span />;', '/src/exact-view.tsx')).not.toBeNull();
	});

	it('rewrites adapter components in authored and prepackaged React modules', () => {
		const plugin = exact({
			reactCompatibility: {
				target: 18,
				cwd: path.resolve(import.meta.dirname, '../test-fixtures/adapter-app')
			}
		});
		const authored = plugin.transform(
			`
      /** @jsxImportSource react */
      import { QueryClientProvider, useQuery } from "@tanstack/react-query";
      export const queryHook = useQuery;
      export const view = <QueryClientProvider client={client}><Page /></QueryClientProvider>;
    `,
			'/src/query.tsx'
		);
		expect(authored?.code).toContain('from "@exactjs/tanstack-query/react"');
		expect(authored?.code).toContain('useQuery } from "@tanstack/react-query"');

		const packaged = plugin.transform(
			'import { QueryClientProvider } from "@tanstack/react-query"; export { QueryClientProvider };',
			'/project/node_modules/example/index.js'
		);
		expect(packaged?.code).toContain('from "@exactjs/tanstack-query/react"');
	});

	it('renders a package React component directly from native eXact JSX', () => {
		const cwd = path.resolve(import.meta.dirname, '../test-fixtures/adapter-app');
		const plugin = exact({ reactCompatibility: { target: 18, cwd } });
		const transformed = plugin.transform(
			`/** @jsxImportSource @exactjs/jsx */
			import type { Component } from "@exactjs/core";
			import { QueryClientProvider } from "@tanstack/react-query";
			function App(this: Component<{ client: object }>) {
				return () => <QueryClientProvider client={this.state.client} />;
			}`,
			path.join(cwd, 'src', 'native.tsx')
		)?.code;

		expect(transformed).toContain('adaptReactComponent as __exactInteropComponent');
		expect(transformed).toContain('__exactInteropComponent(QueryClientProvider)');
		expect(transformed).toContain('client: __exactExpression(() => this.state.client)');
		expect(transformed).not.toContain('jsx-runtime18');
	});

	it('matches the shared engine for prepackaged modules', () => {
		const cwd = path.resolve(import.meta.dirname, '../test-fixtures/adapter-app');
		const source =
			'import { QueryClientProvider } from "@tanstack/react-query"; export { QueryClientProvider };';
		const plugin = exact({ reactCompatibility: { target: 18, cwd } });
		const shared = createReactCompatibilityBuildEngine({ target: 18, cwd }).transformModule({
			id: '/node_modules/example/index.js',
			source,
			format: 'module',
			target: 'client',
			sourceMap: true
		});
		expect(plugin.transform(source, '/node_modules/example/index.js')).toEqual({
			code: shared.code,
			map: shared.map,
			moduleType: 'js'
		});
	});

	it('honors explicit eXact ownership and the automatic React opt-out', () => {
		const exactOwned =
			'/** @jsxImportSource @exactjs/jsx */\nimport { useState } from "react"; const view = <span>{useState}</span>;';
		expect(
			exact({ reactCompatibility: false }).transform(exactOwned, '/src/exact.tsx')?.code
		).toContain('__exactVNode');
		expect(
			exact({ reactCompatibility: false }).transform(
				'/** @jsxImportSource react */\nconst view = <span />;',
				'/src/react.tsx'
			)
		).toBeNull();
	});

	it('rejects mixed JSX ownership in strict React compatibility mode', () => {
		const plugin = exact({ reactCompatibility: { target: 19 } });
		expect(() =>
			plugin.transform(
				'/** @jsxImportSource react */\n/** @jsxImportSource @exactjs/jsx */\nconst view = <span />;',
				'/src/mixed.tsx'
			)
		).toThrow(/Mixed React and eXact JSX/);
	});
});
