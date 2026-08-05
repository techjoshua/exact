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
		await plugin.generateBundle?.call(
			{ emitFile: (asset) => (assets.push(asset), 'asset') },
			{},
			{}
		);

		expect(watched).toContain(path.join(fixture.libraryRoot, 'package.json'));
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
	writeFileSync(libraryModule, 'export function Card() { return () => null; }\n');
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
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify(facts)
	);
	const pageSource =
		"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }";
	writeFileSync(pageFile, pageSource);
	return { root, pageFile, pageSource, libraryRoot, libraryModule };
}
