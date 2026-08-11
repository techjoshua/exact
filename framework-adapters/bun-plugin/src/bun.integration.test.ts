import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exact } from './plugin.js';
import { exactBuild } from './build.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

type SharedTestApi = Pick<typeof import('vitest'), 'describe' | 'it' | 'expect'>;

const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (
	runningInBun ? await import(bunTestModule) : await import('vitest')
) as SharedTestApi;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('@exactjs/bun-plugin with Bun.build', () => {
	testApi.it(
		'coordinates and publishes a production remote exposure',
		async () => {
			const root = await mkdtemp(path.join(os.tmpdir(), 'exact-bun-remote-build-'));
			try {
				await mkdir(path.join(root, 'src'), { recursive: true });
				await linkExactPackages(root);
				await writeFile(
					path.join(root, 'package.json'),
					JSON.stringify({
						name: '@fixture/bun-remote',
						private: true,
						type: 'module',
						dependencies: { '@exactjs/microfrontends': '^0.1.0' }
					})
				);
				await writeFile(
					path.join(root, 'tsconfig.json'),
					JSON.stringify({
						compilerOptions: {
							jsx: 'preserve',
							jsxImportSource: '@exactjs/jsx',
							lib: ['ES2022', 'DOM', 'ESNext.Disposable'],
							target: 'ES2022',
							module: 'ESNext'
						},
						include: ['src']
					})
				);
				await writeFile(
					path.join(root, 'exact.config.mjs'),
					`export default { plugins: { microfrontends(config) { config.exposes['./Area'] = { component: './src/Area.tsx' }; } } };\n`
				);
				const page = path.join(root, 'src', 'page.ts');
				await writeFile(page, 'export const page = true;\n');
				await writeFile(
					path.join(root, 'src', 'Area.tsx'),
					`import './Area.css';
				import icon from './icon.svg';
				export default function Area() {
					const load = () => import('./lazy');
					return () => <section data-icon={icon} onClick={load}>bun remote</section>;
				}\n`
				);
				await writeFile(path.join(root, 'src', 'Area.css'), '.remote-area { color: teal; }\n');
				await writeFile(
					path.join(root, 'src', 'icon.svg'),
					'<svg xmlns="http://www.w3.org/2000/svg"/>\n'
				);
				await writeFile(path.join(root, 'src', 'lazy.ts'), 'export const lazyValue = "lazy";\n');
				await writeFile(
					path.join(root, 'src', 'assets.d.ts'),
					'declare module "*.css"; declare module "*.svg" { const url: string; export default url; }\n'
				);
				const previousBuildKey = process.env.EXACT_BUILD_KEY;
				process.env.EXACT_BUILD_KEY = '0123456789abcdef0123456789abcdef01234567';
				let entries: Readonly<Record<string, string>> | undefined;
				try {
					const result = (await exactBuild({
						entrypoints: [page],
						outdir: path.join(root, 'dist'),
						target: 'browser',
						format: 'esm',
						splitting: true,
						metafile: true,
						publicPath: '/assets',
						exact: {
							applicationRoot: root,
							reactCompatibility: false,
							onRemoteEntries: (value) => (entries = value)
						}
					})) as { success: boolean; logs: unknown[] };
					testApi.expect(result.success, JSON.stringify(result.logs)).toBe(true);
				} finally {
					if (previousBuildKey === undefined) delete process.env.EXACT_BUILD_KEY;
					else process.env.EXACT_BUILD_KEY = previousBuildKey;
				}
				testApi.expect(entries?.['./Area']).toMatch(/^\/assets\/.+\.js$/);
				const emitted = await readdir(path.join(root, 'dist'));
				testApi.expect(emitted.some((file) => file.endsWith('.css'))).toBe(true);
				testApi.expect(emitted.some((file) => file.endsWith('.svg'))).toBe(true);
				testApi.expect(emitted.filter((file) => file.endsWith('.js')).length).toBeGreaterThan(2);
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		},
		60_000
	);
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

async function linkExactPackages(root: string): Promise<void> {
	const scope = path.join(root, 'node_modules', '@exactjs');
	await mkdir(scope, { recursive: true });
	for (const [name, relative] of [
		['microfrontends', 'plugins/microfrontends'],
		['core', 'packages/core'],
		['dom', 'packages/dom'],
		['hydrate', 'packages/hydrate'],
		['reactive', 'packages/reactive'],
		['jsx', 'packages/jsx-runtime']
	] as const)
		await symlink(path.join(repositoryRoot, relative), path.join(scope, name), 'junction');
}

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
