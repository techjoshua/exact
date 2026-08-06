import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';

it('emits authorization artifacts from a real Vite server build', async () => {
	const fixture = createFixture();
	await build({
		root: fixture.root,
		configFile: false,
		logLevel: 'silent',
		plugins: [
			exact({
				target: 'server',
				applicationRoot: fixture.root,
				reactCompatibility: false
			})
		],
		build: {
			ssr: fixture.entry,
			outDir: path.join(fixture.root, 'dist'),
			rollupOptions: { external: ['@exactjs/core'] }
		}
	});

	const outputs = readdirSync(path.join(fixture.root, 'dist'), { recursive: true }).map((entry) =>
		String(entry).replaceAll('\\', '/')
	);
	expect(outputs).toContain('.exact/component-library-authorization.json');
	const manifest = JSON.parse(
		readFileSync(
			path.join(fixture.root, 'dist', '.exact', 'component-library-authorization.json'),
			'utf8'
		)
	) as {
		packages: unknown[];
	};
	expect(manifest.packages).toEqual([
		expect.objectContaining({ name: '@acme/cards', decision: 'root', reasons: ['ssr'] })
	]);
});

it('rejects an unauthorized component during a real Vite server build', async () => {
	const fixture = createFixture();
	writeFileSync(
		path.join(fixture.root, 'exact.config.mjs'),
		"export default { componentLibraries: { deny: ['@acme/cards'] } };\n"
	);

	await expect(
		build({
			root: fixture.root,
			configFile: false,
			logLevel: 'silent',
			plugins: [
				exact({
					target: 'server',
					applicationRoot: fixture.root,
					reactCompatibility: false
				})
			],
			build: {
				ssr: fixture.entry,
				outDir: path.join(fixture.root, 'dist'),
				rollupOptions: { external: ['@exactjs/core'] }
			}
		})
	).rejects.toMatchObject({
		errors: [expect.objectContaining({ pluginCode: 'explicitly-denied' })]
	});
});

function createFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-vite-authorization-build-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const entry = path.join(root, 'src', 'Page.tsx');
	const libraryRoot = path.join(root, 'node_modules', '@acme', 'cards');
	const markerRoot = path.join(root, 'node_modules', '@exactjs', 'component-library');
	mkdirSync(path.dirname(entry), { recursive: true });
	mkdirSync(path.join(libraryRoot, 'dist'), { recursive: true });
	mkdirSync(markerRoot, { recursive: true });
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: '@app/vite-authorization',
			version: '1.0.0',
			type: 'module',
			dependencies: { '@acme/cards': '1.0.0' }
		})
	);
	writeFileSync(
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
	writeFileSync(
		path.join(markerRoot, 'package.json'),
		JSON.stringify({
			name: '@exactjs/component-library',
			version: '0.1.0',
			exactComponentLibraryProtocol: 1
		})
	);
	writeFileSync(
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
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify(facts)
	);
	writeFileSync(
		entry,
		"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }\n"
	);
	return { root, entry };
}
