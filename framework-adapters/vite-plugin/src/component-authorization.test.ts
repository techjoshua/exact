import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';

describe('@exactjs/vite-plugin: component authorization', () => {
	it('authorizes before returning a server component resolution and emits private manifests', async () => {
		const fixture = createViteFixture();
		const plugin = exact({
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		const watched: string[] = [];
		await plugin.buildStart?.call({ addWatchFile: (file) => watched.push(file) });
		plugin.transform(fixture.pageSource, fixture.pageFile);

		await expect(
			plugin.resolveId?.call(
				{
					addWatchFile: (file) => watched.push(file),
					resolve: async () => ({ id: fixture.libraryModule })
				},
				'@acme/cards',
				fixture.pageFile
			)
		).resolves.toEqual({ id: fixture.libraryModule });
		const assets: Array<{ fileName?: string; source?: string }> = [];
		await plugin.buildEnd?.call({ emitFile: (asset) => (assets.push(asset), 'asset') }, undefined);

		expect(watched).toContain(path.join(fixture.libraryRoot, 'package.json'));
		expect(watched).toContain(path.join(fixture.libraryRoot, 'dist', 'exact-component-build.json'));
		expect(assets.map((asset) => asset.fileName)).toEqual([
			'.exact/component-library-authorization.json',
			'.exact/component-library-audit.json'
		]);
		expect(JSON.parse(assets[0]!.source!).packages[0]).toMatchObject({
			name: '@acme/cards',
			decision: 'root',
			reasons: ['ssr']
		});
	});

	it('rejects a denied server package while leaving the same client-only resolution alone', async () => {
		const fixture = createViteFixture();
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@acme/cards'] } };\n"
		);
		const server = exact({
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		await server.buildStart?.call({ addWatchFile() {} });
		server.transform(fixture.pageSource, fixture.pageFile);
		await expect(
			server.resolveId?.call(
				{ resolve: async () => ({ id: fixture.libraryModule }) },
				'@acme/cards',
				fixture.pageFile
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
			client.resolveId?.call(
				{ resolve: async () => ({ id: fixture.libraryModule }) },
				'@acme/cards',
				fixture.pageFile
			)
		).toBeNull();
	});

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

	it('revalidates the committed graph when policy changes and recovers after correction', async () => {
		const fixture = createViteFixture();
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
	});
});

function createViteFixture() {
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
			},
			{
				subpath: '.',
				condition: 'default',
				module: 'dist/index.js',
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
