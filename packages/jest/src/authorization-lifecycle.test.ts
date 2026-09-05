import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { exactJestAuthorizationCacheEnvironment } from './authorization-cache.js';
import exactJestGlobalSetup from './global-setup.js';
import exactJestGlobalTeardown from './global-teardown.js';
import exactJestResolver from './resolver.js';
import { createTransformer } from './transformer.js';

describe('@exactjs/jest: component authorization lifecycle', () => {
	it('preflights without evaluation, shares an immutable resolution, and removes it', async () => {
		const fixture = createFixture();
		await exactJestGlobalSetup({}, projectConfig(fixture));
		const cachePath = process.env[exactJestAuthorizationCacheEnvironment];
		expect(cachePath).toBeDefined();
		expect(existsSync(fixture.executedFile)).toBe(false);
		expect(
			exactJestResolver('@acme/cards', {
				basedir: path.dirname(fixture.pageFile),
				defaultResolver: () => {
					throw new Error('authorized component fell through');
				}
			})
		).toBe(fixture.libraryModule);
		expect(() =>
			createTransformer().process(`${fixture.pageSource}\n// changed`, fixture.pageFile)
		).toThrow('authorization generation is stale');

		await exactJestGlobalTeardown();
		expect(cachePath && existsSync(cachePath)).toBe(false);
		expect(process.env[exactJestAuthorizationCacheEnvironment]).toBeUndefined();
	});

	it('rejects denied components during setup before worker resolution', async () => {
		const fixture = createFixture();
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@acme/cards'] } };\n"
		);

		await expect(exactJestGlobalSetup({}, projectConfig(fixture))).rejects.toMatchObject({
			code: 'explicitly-denied'
		});
		expect(existsSync(fixture.executedFile)).toBe(false);
		expect(process.env[exactJestAuthorizationCacheEnvironment]).toBeUndefined();
	});

	it('preflights transitive package component facts before workers start', async () => {
		const fixture = createFixture(true);
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@vendor/icons'] } };\n"
		);

		await expect(exactJestGlobalSetup({}, projectConfig(fixture))).rejects.toMatchObject({
			code: 'explicitly-denied'
		});
		expect(process.env[exactJestAuthorizationCacheEnvironment]).toBeUndefined();
	});
});

function createFixture(transitive = false) {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-jest-component-policy-'));
	onTestFinished(async () => {
		await exactJestGlobalTeardown();
		rmSync(root, { recursive: true, force: true });
	});
	const pageFile = path.join(root, 'src', 'Page.tsx');
	const libraryRoot = path.join(root, 'node_modules', '@acme', 'cards');
	const libraryModule = path.join(libraryRoot, 'dist', 'index.js');
	const markerRoot = path.join(root, 'node_modules', '@exactjs', 'component-library');
	const executedFile = path.join(root, 'executed.txt');
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
			main: './dist/index.js',
			exports: { '.': './dist/index.js' },
			dependencies: {
				'@exactjs/component-library': '^0.1.0',
				...(transitive ? { '@vendor/icons': '2.0.0' } : {})
			},
			exactComponentLibrary: { protocol: 2, build: './dist/exact-component-build.json' }
		})
	);
	writeFileSync(
		path.join(markerRoot, 'package.json'),
		JSON.stringify({
			name: '@exactjs/component-library',
			version: '0.1.0',
			exactComponentLibraryProtocol: 2
		})
	);
	writeFileSync(
		libraryModule,
		`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(executedFile)}, 'executed'); export function Card() { return () => null; }\n`
	);
	const facts: ExactPublishedComponentBuildFacts = {
		protocol: 2,
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
					componentImports: transitive
						? [
								{
									ownerComponentId: '@acme/cards:Card',
									moduleSpecifier: '@vendor/icons',
									exportName: 'Icon',
									artifactTargets: ['client', 'server'],
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
			}
		]
	};
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify(facts)
	);
	if (transitive) writeTransitiveLibrary(root);
	const pageSource =
		"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }";
	writeFileSync(pageFile, pageSource);
	return { root, pageFile, pageSource, libraryModule, executedFile };
}

function writeTransitiveLibrary(root: string): void {
	const libraryRoot = path.join(root, 'node_modules', '@vendor', 'icons');
	mkdirSync(path.join(libraryRoot, 'dist'), { recursive: true });
	writeFileSync(
		path.join(libraryRoot, 'package.json'),
		JSON.stringify({
			name: '@vendor/icons',
			version: '2.0.0',
			main: './dist/index.js',
			exports: { '.': './dist/index.js' },
			dependencies: { '@exactjs/component-library': '^0.1.0' },
			exactComponentLibrary: { protocol: 2, build: './dist/exact-component-build.json' }
		})
	);
	writeFileSync(path.join(libraryRoot, 'dist', 'index.js'), 'export const Icon = () => null;\n');
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify({
			protocol: 2,
			package: { name: '@vendor/icons', version: '2.0.0' },
			modules: [
				{
					path: 'dist/index.js',
					facts: {
						protocol: 1,
						components: [
							{
								id: '@vendor/icons:Icon',
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
					exportName: 'Icon',
					componentId: '@vendor/icons:Icon'
				}
			]
		} satisfies ExactPublishedComponentBuildFacts)
	);
}

function projectConfig(fixture: ReturnType<typeof createFixture>) {
	return {
		rootDir: fixture.root,
		roots: [path.join(fixture.root, 'src')],
		cacheDirectory: path.join(fixture.root, '.jest-cache'),
		id: 'test'
	};
}
