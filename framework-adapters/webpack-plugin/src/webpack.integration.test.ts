import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import webpack, { type Configuration, type Stats } from 'webpack';
import { expect, it, onTestFinished } from 'vitest';

it('gates a real Webpack server compilation before building a denied component module', async () => {
	const fixture = createFixture(true);
	const stats = await compile(fixture.root);

	expect(stats.hasErrors()).toBe(true);
	expect(stats.toJson({ all: false, errors: true }).errors?.[0]?.message).toContain(
		'matches deny rule @acme/cards'
	);
	expect(stats.toJson({ all: false, modules: true }).modules ?? []).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: expect.stringContaining('@acme/cards') })
		])
	);
});

it('emits authorization artifacts from a real authorized Webpack server compilation', async () => {
	const fixture = createFixture(false);
	const stats = await compile(fixture.root);

	expect(stats.hasErrors()).toBe(false);
	const manifest = JSON.parse(
		readFileSync(
			path.join(fixture.root, 'dist', '.exact', 'component-library-authorization.json'),
			'utf8'
		)
	) as { packages: Array<{ name: string; decision: string }> };
	expect(manifest.packages).toEqual([
		expect.objectContaining({ name: '@acme/cards', decision: 'root' })
	]);
	const inspection = JSON.parse(
		readFileSync(
			path.join(fixture.root, 'dist', '.exact-inspection', 'webpack-integration.json'),
			'utf8'
		)
	) as { componentAuthorization?: { fingerprint: string; packages: unknown[] } };
	expect(inspection.componentAuthorization).toMatchObject({
		fingerprint: expect.any(String),
		packages: [expect.objectContaining({ name: '@acme/cards', decision: 'root' })]
	});
});

async function compile(applicationRoot: string): Promise<Stats> {
	const { ExactWebpackPlugin } = await import('../dist/index.js');
	const repoModules = path.resolve(import.meta.dirname, '../../../node_modules');
	const config: Configuration = {
		mode: 'development',
		target: 'node',
		context: applicationRoot,
		entry: './src/Page.tsx',
		output: { path: path.join(applicationRoot, 'dist'), filename: 'server.js' },
		resolve: {
			extensions: ['.tsx', '.ts', '.js'],
			modules: [path.join(applicationRoot, 'node_modules'), repoModules]
		},
		resolveLoader: { modules: [repoModules, 'node_modules'] },
		plugins: [
			new ExactWebpackPlugin({
				target: 'server',
				applicationRoot,
				reactCompatibility: false,
				sourceMap: false,
				debug: { catalog: true, buildKey: 'webpack-integration' }
			})
		]
	};
	return new Promise((resolve, reject) => {
		webpack(config, (error, stats) => {
			if (error) reject(error);
			else if (!stats) reject(new Error('Webpack did not return compilation stats'));
			else resolve(stats);
		});
	});
}

function createFixture(denied: boolean): { root: string } {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-webpack-authorization-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const libraryRoot = path.join(root, 'node_modules', '@acme', 'cards');
	const markerRoot = path.join(root, 'node_modules', '@exactjs', 'component-library');
	mkdirSync(path.join(root, 'src'), { recursive: true });
	mkdirSync(path.join(libraryRoot, 'dist'), { recursive: true });
	mkdirSync(markerRoot, { recursive: true });
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: 'webpack-authorization-fixture',
			private: true,
			dependencies: { '@acme/cards': '1.0.0' }
		})
	);
	writeFileSync(
		path.join(root, 'exact.config.mjs'),
		`export default ${JSON.stringify({
			componentLibraries: denied ? { deny: ['@acme/cards'] } : undefined
		})};\n`
	);
	writeFileSync(
		path.join(root, 'src', 'Page.tsx'),
		`import { Card } from '@acme/cards';
		export function Page() { return () => <Card />; }\n`
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
		path.join(libraryRoot, 'package.json'),
		JSON.stringify({
			name: '@acme/cards',
			version: '1.0.0',
			exports: { '.': './dist/index.js' },
			dependencies: { '@exactjs/component-library': '^0.1.0' },
			exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
		})
	);
	writeFileSync(
		path.join(libraryRoot, 'dist', 'index.js'),
		`export function Card() { return () => 'card'; }\n`
	);
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify({
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
		})
	);
	return { root };
}
