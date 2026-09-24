import { motionHydrationModes } from '../../test-support/motion-hydration.js';
import { spawnSync } from 'node:child_process';
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
	testApi.it('builds a denied edge but rejects it before implementation effects', async () => {
		const fixture = await createAuthorizationFixture();
		const plugin = exact({
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		try {
			await linkExactPackages(fixture.root);
			await writeFile(
				path.join(fixture.root, 'exact.config.mjs'),
				"export default { componentLibraries: { deny: ['@acme/cards'] } };\n"
			);
			const candidate = path.join(
				fixture.root,
				'node_modules',
				'@acme',
				'cards',
				'dist',
				'index.js'
			);
			await writeFile(
				candidate,
				"throw new Error('DENIED_IMPLEMENTATION_EVALUATED');\n" +
					(await readFile(candidate, 'utf8'))
			);
			const bun = (
				globalThis as unknown as {
					Bun: {
						build(options: Record<string, unknown>): Promise<{ success: boolean; logs: unknown[] }>;
					};
				}
			).Bun;
			const result = await bun.build({
				entrypoints: [fixture.entry],
				target: 'bun',
				format: 'esm',
				outdir: fixture.outdir,
				external: ['@exactjs/core'],
				plugins: [plugin]
			});
			testApi.expect(result.success).toBe(true);
			const output = (await readdir(fixture.outdir)).find((name) => /\.m?js$/.test(name))!;
			const execution = spawnSync(process.execPath, [path.join(fixture.outdir, output)], {
				encoding: 'utf8'
			});
			testApi.expect(execution.status).not.toBe(0);
			testApi.expect(execution.stderr).toContain('explicitly-denied');
			testApi.expect(execution.stderr).not.toContain('DENIED_IMPLEMENTATION_EVALUATED');
		} finally {
			await plugin.dispose();
			await rm(fixture.root, { recursive: true, force: true });
		}
	});
	testApi.it(
		'coordinates and publishes a production remote exposure',
		async () => {
			const root = await mkdtemp(path.join(os.tmpdir(), 'exact-bun-remote-build-'));
			try {
				await mkdir(path.join(root, 'src'), { recursive: true });
				await linkExactPackages(root);
				// Match the linked workspace implementation across independent package releases.
				const { version } = JSON.parse(
					await readFile(
						path.join(root, 'node_modules/@exactjs/microfrontends/package.json'),
						'utf8'
					)
				) as { version: string };
				await writeFile(
					path.join(root, 'package.json'),
					JSON.stringify({
						name: '@fixture/bun-remote',
						private: true,
						type: 'module',
						dependencies: { '@exactjs/microfrontends': version }
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
				const emitted = await readdir(path.join(root, 'dist'), { recursive: true });
				const entry = entries!['./Area']!.slice('/assets/'.length);
				testApi.expect(entry).not.toContain(':');
				testApi.expect(emitted).toContain(entry);
				testApi
					.expect((await readFile(path.join(root, 'dist', entry), 'utf8')).length)
					.toBeGreaterThan(0);
				testApi.expect(emitted.some((file) => file.endsWith('.css'))).toBe(true);
				testApi.expect(emitted.some((file) => file.endsWith('.svg'))).toBe(true);
				testApi.expect(emitted.filter((file) => file.endsWith('.js')).length).toBeGreaterThan(2);
				for (const filename of emitted.filter((file) => file.endsWith('.js'))) {
					const source = await readFile(path.join(root, 'dist', filename), 'utf8');
					for (const match of source.matchAll(/["'](\/assets[^"']+)["']/g)) {
						testApi.expect(match[1]).toMatch(/^\/assets\//);
						testApi.expect(emitted).toContain(match[1]!.slice('/assets/'.length));
					}
				}
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
			const exactPlugin = exact({ applicationRoot: root });
			try {
				const result = await bun.build({
					entrypoints: [entry],
					target: 'browser',
					format: 'esm',
					splitting: true,
					sourcemap: 'external',
					// This case observes transformed source rather than runtime linkage. The remote-build
					// acceptance above owns the fully bundled eXact runtime graph.
					external: ['@exactjs/core', '@exactjs/dom/*'],
					plugins: [exactPlugin]
				});

				testApi.expect(result.success).toBe(true);
				testApi.expect(result.logs).toEqual([]);
				const output = result.outputs.find((item) => item.kind === 'entry-point');
				testApi.expect(output).toBeDefined();
				const outputText = await output!.text();
				testApi.expect(outputText).toContain('@exactjs/core/runtime/render-operations');
				testApi.expect(outputText).not.toContain('@exactjs/dom/runtime/render-program');
				testApi.expect(outputText).toContain('template: "<button>');
				const sourceMap = result.outputs.find((item) => item.kind === 'sourcemap');
				testApi.expect(await sourceMap!.text()).toContain('entry.tsx');
			} finally {
				await exactPlugin.dispose();
			}
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
				const exactPlugin = exact({
					target: 'server',
					applicationRoot: fixture.root,
					reactCompatibility: false
				});
				try {
					const result = await bun.build({
						entrypoints: [fixture.entry],
						target: 'bun',
						format: 'esm',
						outdir: fixture.outdir,
						external: ['@exactjs/core'],
						plugins: [exactPlugin]
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
					await exactPlugin.dispose();
				}
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
				componentModule: 'dist/index.js',
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

describeBun('installed enhancement packages', () => {
	for (const mode of ['authored', 'paired', 'published'] as const) {
		testApi.it(
			`renders installed themes and excludes denied providers (${mode})`,
			async () => {
				const { createInstalledThemeFixture } = await import(
					'../../test-support/installed-theme.js'
				);
				const { exact: builtExact } = await import('../dist/index.js');
				for (const availability of ['enabled', 'excluded', 'absent'] as const) {
					if (availability === 'absent' && mode === 'authored') continue;
					const fixture = await createInstalledThemeFixture(mode, availability);
					const plugin = builtExact({
						target: 'server',
						applicationRoot: fixture.root,
						serverComponents: true,
						reactCompatibility: false
					});
					try {
						const bun = (
							globalThis as unknown as {
								Bun: {
									build(
										options: Record<string, unknown>
									): Promise<{ success: boolean; logs: unknown[] }>;
								};
							}
						).Bun;
						const result = await bun.build({
							entrypoints: [path.join(fixture.root, 'run.ts')],
							target: 'bun',
							format: 'esm',
							outdir: path.join(fixture.root, 'dist'),
							plugins: [plugin]
						});
						testApi.expect(result.success).toBe(true);
						const execution = spawnSync(
							process.execPath,
							[path.join(fixture.root, 'dist/run.js')],
							{ encoding: 'utf8', timeout: 10_000 }
						);
						testApi.expect(execution.status, execution.stderr).toBe(0);
						testApi.expect(JSON.parse(execution.stdout)).toEqual({
							scope: availability === 'enabled',
							field: availability === 'enabled',
							input: true
						});
					} finally {
						await plugin.dispose();
						await fixture.dispose();
					}
				}
			},
			30_000
		);
	}
});

describeBun('Bun provider resolution fallback', () => {
	testApi.it(
		'preserves conditions and aliases without evaluating providers, and distinguishes absence',
		async () => {
			const { createBunBuildResolver } = await import('../dist/build-resolver.js');
			const root = await mkdtemp(path.join(os.tmpdir(), 'exact-bun-resolution-'));
			try {
				const provider = path.join(root, 'node_modules/@fixture/provider');
				await mkdir(provider, { recursive: true });
				await writeFile(
					path.join(provider, 'package.json'),
					JSON.stringify({
						name: '@fixture/provider',
						type: 'module',
						exports: {
							'.': {
								'exact-server': './server.js',
								browser: './browser.js',
								default: './default.js'
							}
						}
					})
				);
				for (const name of ['server', 'browser', 'default'])
					await writeFile(
						path.join(provider, `${name}.js`),
						"throw new Error('RESOLVER_EVALUATED_PROVIDER');"
					);
				for (const target of ['bun', 'browser'] as const) {
					const resolve = createBunBuildResolver({
						config: {
							target,
							conditions: target === 'bun' ? ['exact-server'] : [],
							alias: { alias: '@fixture/provider' }
						},
						onResolve() {},
						onLoad() {},
						resolve: async () => {
							throw new Error('build.resolve() is not implemented yet');
						}
					});
					try {
						const options = { kind: 'import-statement', resolveDir: root } as const;
						const directories = Array.from({ length: 20 }, (_, index) =>
							path.join(root, `source-${index}`)
						);
						await Promise.all(
							directories.map((directory) => mkdir(directory, { recursive: true }))
						);
						const paths = await Promise.all(
							directories.map((resolveDir) =>
								resolve('alias', { kind: 'import-statement', resolveDir })
							)
						);
						testApi
							.expect(
								paths.every(
									(value) =>
										value.path ===
										path.join(provider, target === 'bun' ? 'server.js' : 'browser.js')
								)
							)
							.toBe(true);

						const broken = path.join(root, 'node_modules/@fixture/broken');
						await mkdir(broken, { recursive: true });
						await writeFile(
							path.join(broken, 'package.json'),
							JSON.stringify({ name: '@fixture/broken', exports: './missing.js' })
						);
						await testApi
							.expect(resolve('@fixture/broken', options))
							.rejects.not.toMatchObject({ code: 'MODULE_NOT_FOUND' });
						testApi.expect(await resolve('alias', options)).toEqual({
							path: path.join(provider, target === 'bun' ? 'server.js' : 'browser.js')
						});
						await testApi
							.expect(resolve('@fixture/missing', options))
							.rejects.toMatchObject({ code: 'MODULE_NOT_FOUND' });
					} finally {
						await resolve.dispose();
					}
					await testApi
						.expect(resolve('alias', { kind: 'import-statement', resolveDir: root }))
						.rejects.toThrow('disposed');
				}
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		},
		30_000
	);
});

describeBun('shared SSR and hydration contracts', () => {
	for (const mode of motionHydrationModes)
		testApi.it(
			`preserves SSR and hydration with Bun (${mode})`,
			async () => {
				const { createMotionHydrationFixture } = await import(
					'../../test-support/motion-hydration.js'
				);
				const { exact: builtExact } = await import('../dist/index.js');
				const fixture = await createMotionHydrationFixture(mode);
				try {
					for (const target of ['server', 'client'] as const) {
						const plugin = builtExact({
							target,
							applicationRoot: fixture.root,
							serverComponents: fixture.partitioned,
							reactCompatibility: false
						});
						try {
							const bun = (
								globalThis as unknown as {
									Bun: {
										build(
											options: Record<string, unknown>
										): Promise<{ success: boolean; logs: unknown[] }>;
									};
								}
							).Bun;
							const result = await bun.build({
								entrypoints: [path.join(fixture.root, `${target}.tsx`)],
								outdir: path.join(fixture.root, 'out'),
								naming: '[name].mjs',
								target: target === 'server' ? 'bun' : 'browser',
								format: 'esm',
								plugins: [plugin]
							});
							testApi.expect(result.success, JSON.stringify(result.logs)).toBe(true);
						} finally {
							await plugin.dispose();
						}
					}
					const runner = fileURLToPath(
						new URL('../../test-support/verify-motion-hydration.mjs', import.meta.url)
					);
					const checked = spawnSync(
						process.env.npm_node_execpath ?? 'node',
						[runner, fixture.root, ...(fixture.shell ? ['shell'] : [])],
						{ encoding: 'utf8', timeout: 15000 }
					);
					testApi.expect(checked.status, checked.stderr).toBe(0);
					testApi.expect(checked.stderr).toBe('');
				} finally {
					await fixture.dispose();
				}
			},
			60000
		);
});
