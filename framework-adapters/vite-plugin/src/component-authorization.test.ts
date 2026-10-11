import { exactEnhancementFacadeRequest } from '@exactjs/compiler/adapter-support';
import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';
import { ExactViteComponentAuthorization } from './component-authorization.js';
import { inspectExactComponentBuildFacts } from '@exactjs/compiler';

describe('@exactjs/vite-plugin: component authorization', () => {
	it('ignores raw source while retaining stale executable generation rejection', async () => {
		const fixture = createViteFixture();
		const plugin = exact({
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		onTestFinished(() => plugin.closeBundle?.());
		await plugin.buildStart?.call({ addWatchFile() {} });
		const source = 'export function Probe(){return()=> <p>source example</p>;}';
		expect((await plugin.transform(source, fixture.pageFile))?.code).toBeTruthy();
		expect(
			plugin.transform(`export default ${JSON.stringify(source)};`, `${fixture.pageFile}?raw`)
		).toBeNull();
		expect(() =>
			plugin.transform(source.replace('source example', 'changed source'), fixture.pageFile)
		).toThrow(/changed during authorization generation/);
	});
	it.each(['error', 'exclude'] as const)(
		'authorizes portable optional requests before provider loading (%s)',
		async (policy) => {
			const fixture = createViteFixture();
			writeFileSync(
				path.join(fixture.root, 'exact.config.mjs'),
				`export default { componentLibraries: { deny: ['@acme/cards'], unauthorizedOptionalEnhancements: '${policy}' } };`
			);
			const plugin = exact({
				target: 'server',
				serverExecutionReason: 'server-test',
				applicationRoot: fixture.root,
				reactCompatibility: false
			});
			onTestFinished(() => plugin.closeBundle?.());
			await plugin.buildStart?.call({ addWatchFile() {} });
			const request = exactEnhancementFacadeRequest({
				identity: '@acme/cards#default',
				moduleSpecifier: '@acme/cards',
				exportName: 'default'
			});
			const secondRequest = exactEnhancementFacadeRequest({
				identity: '@acme/cards#Card',
				moduleSpecifier: '@acme/cards',
				exportName: 'Card'
			});
			plugin.transform(
				`import provider from ${JSON.stringify(request)}; import other from ${JSON.stringify(secondRequest)}; export {provider, other};`,
				fixture.pageFile
			);
			const resolve = () =>
				plugin.resolveId?.call(
					{ resolve: async () => ({ id: fixture.libraryModule }) },
					request,
					fixture.pageFile
				);
			const results = await Promise.allSettled([resolve(), resolve()]);
			if (policy === 'error') {
				for (const result of results)
					expect(result).toMatchObject({
						status: 'rejected',
						reason: { code: 'explicitly-denied' }
					});
			} else {
				for (const result of results) expect(result.status).toBe('fulfilled');
				const resolved = results[0]!.status === 'fulfilled' ? results[0]!.value : undefined;
				expect(results[1]).toEqual({ status: 'fulfilled', value: resolved });
				const id = typeof resolved === 'string' ? resolved : resolved?.id;
				const loaded = await plugin.load?.call({}, id!);
				expect(typeof loaded === 'string' ? loaded : loaded?.code).toContain(
					'exactEnhancementPassThrough'
				);
				await expect(
					plugin.resolveId?.call(
						{ resolve: async () => ({ id: fixture.libraryModule }) },
						secondRequest,
						fixture.pageFile
					)
				).resolves.toBeTruthy();
			}
		}
	);

	it('keeps compiler-owned application components outside published-library authorization', async () => {
		const fixture = createViteFixture();
		const localModule = path.join(fixture.root, 'src', 'Card.tsx');
		writeFileSync(localModule, 'export function Card() { return () => <article />; }\n');
		const pageSource =
			"import { Card } from './Card.js'; export function Page() { return () => <Card />; }";
		const plugin = exact({
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		await plugin.buildStart?.call({ addWatchFile() {} });
		plugin.transform(pageSource, fixture.pageFile);

		await expect(
			plugin.resolveId?.call(
				{ resolve: async () => ({ id: localModule }) },
				'./Card.js',
				fixture.pageFile
			)
		).resolves.toEqual({ id: localModule });
	});

	it.each([false, true])(
		'authorizes concurrent resolutions and terminates cyclic preflight (%s)',
		async (cyclic) => {
			const fixture = createViteFixture(cyclic);
			const plugin = exact({
				target: 'server',
				applicationRoot: fixture.root,
				reactCompatibility: false
			});
			const watched: string[] = [];
			await plugin.buildStart?.call({ addWatchFile: (file) => watched.push(file) });
			plugin.transform(fixture.pageSource, fixture.pageFile);

			// Concurrent initial calls and later cached calls must all enter the consumer graph.
			const resolve = () =>
				plugin.resolveId?.call(
					{
						addWatchFile: (file) => watched.push(file),
						resolve: async () => ({ id: '@acme/cards', external: true })
					},
					'@acme/cards',
					fixture.pageFile
				);
			expect(await Promise.all([resolve(), resolve()])).toEqual([
				{ id: fixture.libraryModule, external: false },
				{ id: fixture.libraryModule, external: false }
			]);
			await expect(resolve()).resolves.toEqual({ id: fixture.libraryModule, external: false });
			const assets: Array<{ fileName?: string; source?: string }> = [];
			await plugin.buildEnd?.call(
				{ emitFile: (asset) => (assets.push(asset), 'asset') },
				undefined
			);

			expect(watched).toContain(path.join(fixture.libraryRoot, 'package.json'));
			expect(watched).toContain(
				path.join(fixture.libraryRoot, 'dist', 'exact-component-build.json')
			);
			expect(assets.map((asset) => asset.fileName)).toEqual([
				'.exact/component-library-authorization.json',
				'.exact/component-library-audit.json'
			]);
			expect(JSON.parse(assets[0]!.source!).packages[0]).toMatchObject({
				name: '@acme/cards',
				decision: 'root',
				reasons: ['ssr']
			});
		}
	);

	it.each(['server', undefined] as const)(
		'rejects a denied development server package while leaving client resolution alone, target=%s',
		async (target) => {
			const fixture = createViteFixture();
			writeFileSync(
				path.join(fixture.root, 'exact.config.mjs'),
				"export default { componentLibraries: { deny: ['@acme/cards'] } };\n"
			);
			const server = exact({
				target,
				applicationRoot: fixture.root,
				reactCompatibility: false
			});
			server.configResolved?.({ command: 'serve' });
			await server.buildStart?.call({ addWatchFile() {} });
			server.transform(fixture.pageSource, fixture.pageFile, { ssr: true });
			await expect(
				server.resolveId?.call(
					{ resolve: async () => ({ id: fixture.libraryModule }) },
					'@acme/cards',
					fixture.pageFile,
					{ ssr: true }
				)
			).rejects.toMatchObject({ code: 'explicitly-denied' });

			const client = exact({
				target: 'client',
				applicationRoot: fixture.root,
				reactCompatibility: false
			});
			await client.buildStart?.call({ addWatchFile() {} });
			client.transform(fixture.pageSource, fixture.pageFile);
			expect(
				await client.resolveId?.call(
					{ resolve: async () => ({ id: fixture.libraryModule }) },
					'@acme/cards',
					fixture.pageFile,
					{ ssr: true }
				)
			).toBeNull();
		}
	);

	it('resolves an excluded optional enhancement to an adapter-owned empty module', async () => {
		const fixture = createViteFixture();
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@acme/cards'], unauthorizedOptionalEnhancements: 'exclude' } };\n"
		);
		const source = `import cards from '@acme/cards' with { type: 'exact-enhancement' };
			export function Page() { return () => <main cards:active />; }`;
		const plugin = exact({
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		await plugin.buildStart?.call({ addWatchFile() {} });
		plugin.transform(source, fixture.pageFile);

		const resolved = await plugin.resolveId?.call(
			{ resolve: async () => ({ id: fixture.libraryModule }) },
			'@acme/cards',
			fixture.pageFile
		);
		expect(resolved).toMatch(/^\0exact:omitted-enhancement\//);
		expect(plugin.load?.call({}, resolved as string)).toEqual({
			code: 'export {};\n',
			moduleType: 'js'
		});
	});

	it('preflights a denied server HMR edge before accepting the changed module', async () => {
		const fixture = createViteFixture();
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@acme/cards'] } };\n"
		);
		const plugin = exact({
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		await plugin.buildStart?.call({ addWatchFile() {} });
		const changed =
			"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }";

		await expect(
			plugin.handleHotUpdate?.call(
				{ addWatchFile() {} },
				{
					file: fixture.pageFile,
					read: async () => changed,
					server: {
						pluginContainer: {
							resolveId: async () => ({ id: fixture.libraryModule })
						}
					}
				}
			)
		).rejects.toMatchObject({ code: 'explicitly-denied' });
	});

	it.each(['replace', 'commit', 'deny', 'dispose'] as const)(
		'fences in-flight authorization when its generation changes (%s)',
		async (transition) => {
			const fixture = createViteFixture(true);
			const authorization = new ExactViteComponentAuthorization();
			onTestFinished(() => authorization.dispose());
			const options = { applicationRoot: fixture.root, watch() {} };
			authorization.open(options);
			authorization.record(
				fixture.pageFile,
				inspectExactComponentBuildFacts(fixture.pageSource, {
					filename: fixture.pageFile,
					target: 'server'
				}),
				fixture.pageSource
			);
			let changed = false;
			const pending = authorization.authorize(
				fixture.libraryModule,
				'@acme/cards',
				fixture.pageFile,
				{
					...options,
					watch() {
						if (changed) return;
						changed = true;
						if (transition === 'dispose') authorization.dispose();
						else if (transition === 'commit') void authorization.commit(options);
						else
							authorization.open({
								...options,
								config: transition === 'deny' ? { deny: ['@acme/cards'] } : undefined
							});
					}
				}
			);
			if (transition === 'dispose') await expect(pending).rejects.toThrow('disposed');
			else if (transition === 'deny')
				await expect(pending).rejects.toMatchObject({ code: 'explicitly-denied' });
			else {
				await expect(pending).resolves.toBeTruthy();
				expect((await authorization.commit())?.manifest.packages).toEqual([
					expect.objectContaining({ name: '@acme/cards', decision: 'root' })
				]);
			}
		}
	);

	it('retains published authority when its source is transformed before root replay', async () => {
		const fixture = createViteFixture(true);
		const authorization = new ExactViteComponentAuthorization();
		onTestFinished(() => authorization.dispose());
		const options = { applicationRoot: fixture.root, watch() {} };
		authorization.open(options);
		authorization.record(
			fixture.pageFile,
			inspectExactComponentBuildFacts(fixture.pageSource, {
				filename: fixture.pageFile,
				target: 'server'
			}),
			fixture.pageSource
		);
		await authorization.authorize(fixture.libraryModule, '@acme/cards', fixture.pageFile, options);
		for (let generation = 0; generation < 3; generation++) {
			authorization.open(options);
			const projection = 'export function Card(){return()=> <section/>;}';
			authorization.record(
				fixture.libraryModule,
				inspectExactComponentBuildFacts(projection, {
					filename: fixture.libraryModule,
					target: 'server'
				}),
				projection
			);
			await expect(
				authorization.authorize(
					fixture.libraryModule,
					'@acme/cards',
					fixture.libraryModule,
					options
				)
			).resolves.toBeTruthy();
			expect((await authorization.commit())?.manifest.packages).toEqual([
				expect.objectContaining({ name: '@acme/cards', decision: 'root' })
			]);
		}
	});

	it.each([false, true])(
		'retains consumer authorization across generation replacement (initial commit: %s)',
		async (initialCommit) => {
			const fixture = createViteFixture(true);
			const authorization = new ExactViteComponentAuthorization();
			onTestFinished(() => authorization.dispose());
			const options = { applicationRoot: fixture.root, watch() {} };
			authorization.open(options);
			authorization.record(
				fixture.pageFile,
				inspectExactComponentBuildFacts(fixture.pageSource, {
					filename: fixture.pageFile,
					target: 'server'
				}),
				fixture.pageSource
			);
			await authorization.authorize(
				fixture.libraryModule,
				'@acme/cards',
				fixture.pageFile,
				options
			);
			if (initialCommit) await authorization.commit();
			for (let generation = 0; generation < 3; generation++) {
				authorization.open(options);
				// Vite can retain the consumer module while reloading only its published child.
				await expect(
					Promise.all(
						[0, 1].map(() =>
							authorization.authorize(
								fixture.libraryModule,
								'@acme/cards',
								fixture.libraryModule,
								options
							)
						)
					)
				).resolves.toHaveLength(2);
				expect((await authorization.commit())?.manifest.packages).toEqual([
					expect.objectContaining({ name: '@acme/cards', decision: 'root' })
				]);
			}
			const metadataPath = path.join(fixture.libraryRoot, 'dist/exact-component-build.json');
			const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
			metadata.modules[0].facts.componentImports = [];
			writeFileSync(metadataPath, JSON.stringify(metadata));
			authorization.open(options);
			await authorization.authorize(
				fixture.libraryModule,
				'@acme/cards',
				fixture.pageFile,
				options
			);
			expect(authorization.requires('@acme/cards', fixture.libraryModule)).toBe(false);
			await authorization.commit();
			const applicationManifest = path.join(fixture.root, 'package.json');
			const originalManifest = readFileSync(applicationManifest, 'utf8');
			const manifest = JSON.parse(originalManifest);
			manifest.dependencies = {};
			writeFileSync(applicationManifest, JSON.stringify(manifest));
			authorization.open(options);
			await expect(
				authorization.authorize(fixture.libraryModule, '@acme/cards', fixture.pageFile, options)
			).rejects.toMatchObject({ code: 'not-allowed' });
			writeFileSync(applicationManifest, originalManifest);
			authorization.open(options);
			await expect(
				authorization.authorize(fixture.libraryModule, '@acme/cards', fixture.pageFile, options)
			).resolves.toBeTruthy();
		}
	);

	it.each([false, true])(
		'revalidates the committed graph and policy after correction (cyclic: %s)',
		async (cyclic) => {
			const fixture = createViteFixture(cyclic);
			const configFile = path.join(fixture.root, 'exact.config.mjs');
			writeFileSync(configFile, 'export default {};\n');
			const plugin = exact({
				target: 'server',
				applicationRoot: fixture.root,
				reactCompatibility: false
			});
			plugin.configResolved?.({ command: 'serve' });
			await plugin.buildStart?.call({ addWatchFile() {} });
			const server = {
				pluginContainer: {
					resolveId: async () => ({ id: fixture.libraryModule })
				}
			};
			await plugin.handleHotUpdate?.call(
				{ addWatchFile() {} },
				{ file: fixture.pageFile, read: async () => fixture.pageSource, server }
			);

			const denied = "export default { componentLibraries: { deny: ['@acme/cards'] } };\n";
			writeFileSync(configFile, denied);
			await expect(
				plugin.handleHotUpdate?.call(
					{ addWatchFile() {} },
					{ file: configFile, read: async () => denied, server }
				)
			).rejects.toMatchObject({ code: 'explicitly-denied' });

			const corrected = 'export default {};\n';
			writeFileSync(configFile, corrected);
			await expect(
				plugin.handleHotUpdate?.call(
					{ addWatchFile() {} },
					{ file: configFile, read: async () => corrected, server }
				)
			).resolves.toBeUndefined();
		}
	);
});

function createViteFixture(cyclic = false) {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-vite-component-policy-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const pageFile = path.join(root, 'src', 'Page.tsx');
	const libraryRoot = path.join(root, 'node_modules', '@acme', 'cards');
	const markerRoot = path.join(root, 'node_modules', '@exactjs', 'component-library');
	const libraryModule = path.join(libraryRoot, 'dist', 'index.js');
	mkdirSync(path.dirname(pageFile), { recursive: true });
	mkdirSync(path.dirname(libraryModule), { recursive: true });
	mkdirSync(markerRoot, { recursive: true });
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: '@app/test',
			version: '1.0.0',
			dependencies: { '@acme/cards': '1.0.0' }
		})
	);
	writeFileSync(
		path.join(libraryRoot, 'package.json'),
		JSON.stringify({
			name: '@acme/cards',
			version: '1.0.0',
			exports: {
				'.': { types: './capability.d.ts', default: './dist/index.js' }
			},
			dependencies: { '@exactjs/component-library': '^0.1.0' },
			exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
		})
	);
	writeFileSync(
		path.join(markerRoot, 'package.json'),
		JSON.stringify({
			name: '@exactjs/component-library',
			version: '0.1.0',
			exactComponentLibraryProtocol: 1
		})
	);
	writeFileSync(
		libraryModule,
		'export function Card() { return () => null; } export default Card;\n'
	);
	writeFileSync(
		path.join(libraryRoot, 'dist', 'index.d.ts'),
		'export declare function Card(props: { active?: boolean; children?: unknown }): unknown; export default Card;\n'
	);
	writeFileSync(
		path.join(libraryRoot, 'capability.d.ts'),
		"export { Card } from './dist/index.js'; export { default } from './dist/index.js' with { type: 'exact-enhancement' };\n"
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
					componentImports: cyclic
						? [
								{
									ownerComponentId: '@acme/cards:Card',
									moduleSpecifier: '@acme/cards',
									exportName: 'Card',
									artifactTargets: ['server'],
									reason: 'render'
								}
							]
						: [],
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
			},
			{
				subpath: '.',
				condition: 'default',
				module: 'dist/index.js',
				componentModule: 'dist/index.js',
				exportName: 'default',
				componentId: '@acme/cards:Card'
			}
		]
	};
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify(facts)
	);
	const pageSource =
		"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }";
	writeFileSync(pageFile, pageSource);
	return { root, pageFile, pageSource, libraryRoot, libraryModule };
}
