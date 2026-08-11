import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import webpack, { type Configuration, type Stats } from 'webpack';
import { expect, it, onTestFinished } from 'vitest';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

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

it('emits and publishes a real client remote exposure generation', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-webpack-remote-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(path.join(root, 'src'), { recursive: true });
	linkExactPackages(root);
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: '@fixture/webpack-remote',
			private: true,
			type: 'module',
			dependencies: { '@exactjs/microfrontends': '^0.1.0' }
		})
	);
	writeFileSync(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: { jsx: 'preserve', target: 'ES2022', module: 'ESNext' },
			include: ['src']
		})
	);
	writeFileSync(
		path.join(root, 'exact.config.mjs'),
		`export default { plugins: { microfrontends(config) { config.exposes['./Area'] = { component: './src/Area.tsx' }; } } };\n`
	);
	writeFileSync(path.join(root, 'src', 'page.ts'), 'export const page = true;\n');
	writeFileSync(
		path.join(root, 'src', 'Area.tsx'),
		`export default function Area() { return () => <section>webpack remote</section>; }\n`
	);
	const previousBuildKey = process.env.EXACT_BUILD_KEY;
	process.env.EXACT_BUILD_KEY = '0123456789abcdef0123456789abcdef01234567';
	let entries: Readonly<Record<string, string>> | undefined;
	let development: Readonly<Record<string, string>> | undefined;
	try {
		const { ExactWebpackPlugin } = await import('../dist/index.js');
		const stats = await compileConfiguration({
			mode: 'development',
			target: 'web',
			context: root,
			entry: './src/page.ts',
			output: {
				path: path.join(root, 'dist'),
				filename: '[name].[contenthash].mjs',
				chunkFilename: '[name].[contenthash].mjs',
				module: true,
				publicPath: '/assets/'
			},
			experiments: { outputModule: true },
			resolve: {
				extensions: ['.tsx', '.ts', '.js'],
				modules: [path.join(root, 'node_modules'), path.resolve(repositoryRoot, 'node_modules')]
			},
			resolveLoader: { modules: [path.resolve(repositoryRoot, 'node_modules'), 'node_modules'] },
			plugins: [
				new ExactWebpackPlugin({
					target: 'client',
					applicationRoot: root,
					reactCompatibility: false,
					sourceMap: false,
					onRemoteEntries: (value) => (entries = value),
					onRemoteDevelopmentEntries: (value) => (development = value)
				})
			]
		});
		expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
	} finally {
		if (previousBuildKey === undefined) delete process.env.EXACT_BUILD_KEY;
		else process.env.EXACT_BUILD_KEY = previousBuildKey;
	}
	expect(entries?.['./Area']).toMatch(/^\/assets\/exact-remote-Area\..+\.mjs$/);
	expect(development?.['./Area']).toContain('virtual:exact-remote-entry');
	const files = readDirectory(path.join(root, 'dist'));
	expect(files.some((file) => /^exact-remote-Area\..+\.mjs$/.test(file))).toBe(true);
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

function compileConfiguration(config: Configuration): Promise<Stats> {
	return new Promise((resolve, reject) => {
		webpack(config, (error, stats) => {
			if (error) reject(error);
			else if (!stats) reject(new Error('Webpack did not return compilation stats'));
			else resolve(stats);
		});
	});
}

function linkExactPackages(root: string): void {
	const scope = path.join(root, 'node_modules', '@exactjs');
	mkdirSync(scope, { recursive: true });
	for (const [name, relative] of [
		['microfrontends', 'plugins/microfrontends'],
		['core', 'packages/core'],
		['dom', 'packages/dom'],
		['hydrate', 'packages/hydrate'],
		['reactive', 'packages/reactive'],
		['jsx', 'packages/jsx-runtime']
	] as const)
		symlinkSync(path.join(repositoryRoot, relative), path.join(scope, name), 'junction');
}

function readDirectory(root: string, relative = ''): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
		const next = path.join(relative, entry.name);
		if (entry.isDirectory()) files.push(...readDirectory(root, next));
		else files.push(next.replaceAll('\\', '/'));
	}
	return files;
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
