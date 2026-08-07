import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exact } from './plugin.js';

type SharedTestApi = Pick<typeof import('vitest'), 'describe' | 'it' | 'expect'>;

const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (
	runningInBun ? await import(bunTestModule) : await import('vitest')
) as SharedTestApi;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('@exactjs/bun-plugin with Bun.build', () => {
	testApi.it('builds eXact TSX while leaving ordinary TypeScript to Bun', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'exact-bun-plugin-'));
		try {
			await writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/exact-bun-build', private: true, type: 'module' })
			);
			await writeFile(
				path.join(root, 'model.ts'),
				'export const model: { count: number } = { count: 1 }; export const small = model.count < 2;'
			);
			const entry = path.join(root, 'entry.tsx');
			await writeFile(
				entry,
				'import { model, small } from "./model.ts"; export { small }; export const view = <button>{model.count}</button>;'
			);

			const bun = (
				globalThis as unknown as {
					Bun: {
						build(options: Record<string, unknown>): Promise<{
							success: boolean;
							logs: unknown[];
							outputs: Array<{ kind: string; text(): Promise<string> }>;
						}>;
					};
				}
			).Bun;
			const result = await bun.build({
				entrypoints: [entry],
				target: 'browser',
				format: 'esm',
				splitting: true,
				sourcemap: 'external',
				external: ['@exactjs/core'],
				plugins: [exact({ applicationRoot: root })]
			});

			testApi.expect(result.success).toBe(true);
			testApi.expect(result.logs).toEqual([]);
			const output = result.outputs.find((item) => item.kind === 'entry-point');
			testApi.expect(output).toBeDefined();
			testApi.expect(await output!.text()).toContain('__exactVNode("button"');
			const sourceMap = result.outputs.find((item) => item.kind === 'sourcemap');
			testApi.expect(await sourceMap!.text()).toContain('entry.tsx');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	testApi.it(
		'authorizes components and emits private artifacts in a Bun server build',
		async () => {
			const fixture = await createAuthorizationFixture();
			try {
				const bun = (
					globalThis as unknown as {
						Bun: {
							build(options: Record<string, unknown>): Promise<{
								success: boolean;
								logs: unknown[];
							}>;
						};
					}
				).Bun;
				const result = await bun.build({
					entrypoints: [fixture.entry],
					target: 'bun',
					format: 'esm',
					outdir: fixture.outdir,
					external: ['@exactjs/core'],
					plugins: [
						exact({
							target: 'server',
							applicationRoot: fixture.root,
							reactCompatibility: false
						})
					]
				});

				testApi.expect(result.success).toBe(true);
				testApi.expect(result.logs).toEqual([]);
				const manifest = JSON.parse(
					await readFile(
						path.join(fixture.outdir, '.exact', 'component-library-authorization.json'),
						'utf8'
					)
				) as { packages: unknown[] };
				testApi.expect(manifest.packages).toEqual([
					testApi.expect.objectContaining({
						name: '@acme/cards',
						decision: 'root',
						reasons: ['ssr']
					})
				]);
			} finally {
				await rm(fixture.root, { recursive: true, force: true });
			}
		}
	);
});

async function createAuthorizationFixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-bun-authorization-build-'));
	const entry = path.join(root, 'src', 'Page.tsx');
	const outdir = path.join(root, 'dist');
	const libraryRoot = path.join(root, 'node_modules', '@acme', 'cards');
	const markerRoot = path.join(root, 'node_modules', '@exactjs', 'component-library');
	await mkdir(path.dirname(entry), { recursive: true });
	await mkdir(path.join(libraryRoot, 'dist'), { recursive: true });
	await mkdir(markerRoot, { recursive: true });
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: '@app/bun-authorization',
			version: '1.0.0',
			type: 'module',
			dependencies: { '@acme/cards': '1.0.0' }
		})
	);
	await writeFile(
		path.join(libraryRoot, 'package.json'),
		JSON.stringify({
			name: '@acme/cards',
			version: '1.0.0',
			type: 'module',
			exports: { '.': './dist/index.js' },
			dependencies: { '@exactjs/component-library': '^0.1.0' },
			exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
		})
	);
	await writeFile(
		path.join(markerRoot, 'package.json'),
		JSON.stringify({
			name: '@exactjs/component-library',
			version: '0.1.0',
			exactComponentLibraryProtocol: 1
		})
	);
	await writeFile(
		path.join(libraryRoot, 'dist', 'index.js'),
		'export function Card() { return () => null; }\n'
	);
	const facts: ExactPublishedComponentBuildFacts = {
		protocol: 1,
		package: { name: '@acme/cards', version: '1.0.0' },
		modules: [
			{
				path: 'dist/index.js',
				facts: {
					protocol: 1,
					components: [
						{
							id: '@acme/cards:Card',
							placement: 'isomorphic',
							artifactTargets: ['client', 'server']
						}
					],
					componentImports: [],
					rendererEnhancements: []
				}
			}
		],
		exports: [
			{
				subpath: '.',
				condition: 'default',
				module: 'dist/index.js',
				exportName: 'Card',
				componentId: '@acme/cards:Card'
			}
		]
	};
	await writeFile(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify(facts)
	);
	await writeFile(
		entry,
		"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }\n"
	);
	return { root, entry, outdir };
}
