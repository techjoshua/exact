import '@exactjs/core/runtime/component-tasks';
import { type Component } from '@exactjs/core';
import { createComponentInstance } from '@exactjs/core/runtime/render';
import { createFrameworkFixtureComponentInstance } from '@exactjs/core/testing';
import { createElement } from '@exactjs/react-compat';
import { exactComponentType } from '@exactjs/react-compat/exact';
import { flushSync } from '@exactjs/reactive';
import { QueryClient } from '@tanstack/query-core';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExactQueryClientProvider, type ExactQuerySource } from './index.js';
import { QueryClientProvider } from './provider.js';

const clientAdapter = (await import(
	'./adapter.js?exact-target=client'
)) as typeof import('./adapter.js');

describe('@exactjs/tanstack-query', () => {
	it('shares an opaque QueryClient through the native provider', () => {
		const client = new QueryClient();
		const provider = createComponentInstance(clientAdapter.ExactQueryClientProvider, { client });
		createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				expect(this.getContext(clientAdapter.QueryClientContext)).toBe(client);
				return () => null;
			},
			{},
			provider
		);
	});

	it('exports a React replacement that mounts the native provider boundary', () => {
		const client = new QueryClient();
		const element = createElement(QueryClientProvider, { client });
		expect(exactComponentType(element.type)?.component).toBe(ExactQueryClientProvider);
	});

	it('bridges QueryObserver updates and owns disposal with the component', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const provider = createComponentInstance(clientAdapter.ExactQueryClientProvider, { client });
		let query!: ExactQuerySource<number, Error, number, number, string[]>;
		const child = createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				query = clientAdapter.createComponentQuery(this, {
					queryKey: ['value'],
					queryFn: async () => 42
				});
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

	it.each(['query', 'infinite', 'mutation'] as const)(
		'keeps %s ownership when methods and mutable aliases are assigned',
		async (kind) => {
			const client = new QueryClient({
				defaultOptions: { queries: { retry: false, gcTime: Infinity } }
			});
			const source =
				kind === 'query'
					? clientAdapter.createQuerySource(client, {
							queryKey: ['facade', kind],
							enabled: false,
							queryFn: async () => 7
						})
					: kind === 'infinite'
						? clientAdapter.createInfiniteQuerySource(client, {
								queryKey: ['facade', kind],
								enabled: false,
								queryFn: async () => 7,
								initialPageParam: 0,
								getNextPageParam: () => undefined
							})
						: clientAdapter.createMutationSource(client, { mutationFn: async () => 7 });
			const observer = source.observer;
			const external = source.external;
			const result = source.result;
			const dispose = source.dispose;
			let disposals = 0;
			try {
				expect(external.connected).toBe(true);
				expect(observer.hasListeners()).toBe(true);
				expect(result).toBe(external.value);
				expect(result.get()).toBe(external.snapshot());
				source.dispose = () => {
					disposals++;
					dispose();
				};
				const mutable: { observer: typeof observer } = source;
				mutable.observer = observer;
				if ('refetch' in observer) await observer.refetch();
				else await observer.mutate(undefined);
				flushSync();
				expect(source.observer).toBe(observer);
				expect(source.external).toBe(external);
				expect(source.result).toBe(result);
				expect(result.get().status).toBe('success');
				expect(result.get().data).toEqual(
					kind === 'infinite' ? { pages: [7], pageParams: [0] } : 7
				);
				source.dispose();
				expect(disposals).toBe(1);
				expect(external.disposed).toBe(true);
				expect(external.connected).toBe(false);
				expect(observer.hasListeners()).toBe(false);
				const following = clientAdapter.createQuerySource(client, {
					queryKey: ['following', kind],
					enabled: false,
					queryFn: async () => 8
				});
				try {
					await following.observer.refetch();
					flushSync();
					expect(following.result.get().data).toBe(8);
					expect(following.observer.hasListeners()).toBe(true);
				} finally {
					following.dispose();
				}
				expect(observer.hasListeners()).toBe(false);
			} finally {
				dispose();
				client.clear();
			}
		}
	);

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
