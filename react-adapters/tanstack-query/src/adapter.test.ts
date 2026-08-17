import { createComponentInstance, type Component } from '@exactjs/core';
import { createElement } from '@exactjs/react-compat';
import { toExactNode } from '@exactjs/react-compat/exact';
import { flushSync } from '@exactjs/reactive';
import { QueryClient } from '@tanstack/query-core';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	createComponentQuery,
	ExactQueryClientProvider,
	QueryClientContext,
	type ExactQuerySource
} from './index.js';
import { QueryClientProvider } from './provider.js';

describe('@exactjs/tanstack-query', () => {
	it('shares an opaque QueryClient through the native provider', () => {
		const client = new QueryClient();
		const provider = createComponentInstance(ExactQueryClientProvider, { client });
		createComponentInstance(
			function Child(this: Component<{}>) {
				expect(this.getContext(QueryClientContext)).toBe(client);
				return () => null;
			},
			{},
			provider
		);
	});

	it('exports a React replacement that mounts the native provider boundary', () => {
		const client = new QueryClient();
		const vnode = toExactNode(createElement(QueryClientProvider, { client }));
		expect((vnode as { type: unknown }).type).toBe(ExactQueryClientProvider);
	});

	it('bridges QueryObserver updates and owns disposal with the component', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const provider = createComponentInstance(ExactQueryClientProvider, { client });
		let query!: ExactQuerySource<number, Error, number, number, string[]>;
		const child = createComponentInstance(
			function Child(this: Component<{}>) {
				query = createComponentQuery(this, { queryKey: ['value'], queryFn: async () => 42 });
				return () => null;
			},
			{},
			provider
		);
		await query.observer.refetch();
		flushSync();
		expect(query.result.get().data).toBe(42);
		child.unmount();
		expect(query.external.disposed).toBe(true);
	});

	it('keeps the fully native entry free of React compatibility and React Query', async () => {
		const result = await build({
			stdin: {
				contents: await readFile(new URL('./index.ts', import.meta.url), 'utf8'),
				loader: 'ts',
				sourcefile: 'native-tanstack-query.ts',
				resolveDir: fileURLToPath(new URL('.', import.meta.url))
			},
			bundle: true,
			plugins: [
				{
					name: 'resolve-typescript-source-extensions',
					setup(build) {
						build.onResolve({ filter: /^\..*\.js$/ }, (args) => ({
							path: path.resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'))
						}));
					}
				}
			],
			external: ['@tanstack/query-core', '@exactjs/core', '@exactjs/reactive'],
			write: false,
			metafile: true,
			platform: 'browser',
			format: 'esm'
		});
		const output = result.outputFiles![0]!.text;
		expect(output).not.toContain('@exactjs/react-compat');
		expect(output).not.toContain('@tanstack/react-query');
	});
});
