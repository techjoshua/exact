import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { transformExactWebpackSource } from './plugin.js';
import {
	authorizeWebpackResolvedComponent,
	commitWebpackAuthorizationGeneration,
	createWebpackCompilerSession,
	disposeWebpackCompilerSession,
	recordWebpackComponentBuildFacts,
	resetWebpackAuthorizationGeneration
} from './sessions.js';

describe('@exactjs/webpack-plugin: component authorization', () => {
	it('joins loader facts to a resolved package and commits server manifests without evaluation', async () => {
		const fixture = createFixture();
		const owned = createWebpackCompilerSession(false);
		onTestFinished(() => disposeWebpackCompilerSession(owned.id));
		const options = { target: 'server', applicationRoot: fixture.root } as const;
		resetWebpackAuthorizationGeneration(owned.id, options);
		transformExactWebpackSource(
			fixture.pageSource,
			fixture.pageFile,
			{ ...options, reactCompatibility: false, __exactSessionId: owned.id },
			owned.session
		);

		await authorizeWebpackResolvedComponent(
			owned.id,
			options,
			'@acme/cards',
			fixture.pageFile,
			fixture.libraryModule
		);
		const committed = await commitWebpackAuthorizationGeneration(owned.id, options);

		expect(committed?.manifest.packages[0]).toMatchObject({
			name: '@acme/cards',
			decision: 'root',
			reasons: ['ssr']
		});
		expect(existsSync(fixture.executedFile)).toBe(false);
	});

	it('rejects a denied candidate before Webpack can build its module', async () => {
		const fixture = createFixture();
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@acme/cards'] } };\n"
		);
		const owned = createWebpackCompilerSession(false);
		onTestFinished(() => disposeWebpackCompilerSession(owned.id));
		const options = { target: 'server', applicationRoot: fixture.root } as const;
		resetWebpackAuthorizationGeneration(owned.id, options);
		transformExactWebpackSource(
			fixture.pageSource,
			fixture.pageFile,
			{ ...options, reactCompatibility: false, __exactSessionId: owned.id },
			owned.session
		);

		await expect(
			authorizeWebpackResolvedComponent(
				owned.id,
				options,
				'@acme/cards',
				fixture.pageFile,
				fixture.libraryModule
			)
		).rejects.toMatchObject({ code: 'explicitly-denied' });
		expect(existsSync(fixture.executedFile)).toBe(false);
	});

	it('returns an omitted decision only for an explicitly excluded enhancement', async () => {
		const fixture = createFixture();
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@acme/cards'], unauthorizedOptionalEnhancements: 'exclude' } };\n"
		);
		const owned = createWebpackCompilerSession(false);
		onTestFinished(() => disposeWebpackCompilerSession(owned.id));
		const options = { target: 'server', applicationRoot: fixture.root } as const;
		resetWebpackAuthorizationGeneration(owned.id, options);
		recordWebpackComponentBuildFacts(owned.id, fixture.pageFile, fixture.pageSource, {
			protocol: 1,
			filename: fixture.pageFile,
			components: [],
			componentImports: [],
			rendererEnhancements: [
				{ identity: '@acme/cards#default', moduleSpecifier: '@acme/cards', exportName: 'Card' }
			]
		});

		await expect(
			authorizeWebpackResolvedComponent(
				owned.id,
				options,
				'@acme/cards',
				fixture.pageFile,
				fixture.libraryModule
			)
		).resolves.toBe('omitted');
		expect(existsSync(fixture.executedFile)).toBe(false);
	});

	it('preflights denied transitive imports from published component facts', async () => {
		const fixture = createFixture(true);
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@vendor/icons'] } };\n"
		);
		const owned = createWebpackCompilerSession(false);
		onTestFinished(() => disposeWebpackCompilerSession(owned.id));
		const options = { target: 'server', applicationRoot: fixture.root } as const;
		resetWebpackAuthorizationGeneration(owned.id, options);
		transformExactWebpackSource(
			fixture.pageSource,
			fixture.pageFile,
			{ ...options, reactCompatibility: false, __exactSessionId: owned.id },
			owned.session
		);

		await expect(
			authorizeWebpackResolvedComponent(
				owned.id,
				options,
				'@acme/cards',
				fixture.pageFile,
				fixture.libraryModule,
				async (request) => {
					if (request === '@vendor/icons') return fixture.childModule!;
					throw new Error(`Unexpected request ${request}`);
				}
			)
		).rejects.toMatchObject({ code: 'explicitly-denied' });
	});
});

function createFixture(transitive = false) {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-webpack-component-policy-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
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
			exports: { '.': './dist/index.js' },
			dependencies: {
				'@exactjs/component-library': '^0.1.0',
				...(transitive ? { '@vendor/icons': '2.0.0' } : {})
			},
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
		`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(executedFile)}, 'executed'); export function Card() { return () => null; }\n`
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
				exportName: 'Card',
				componentId: '@acme/cards:Card'
			}
		]
	};
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify(facts)
	);
	const childModule = transitive ? writeTransitiveLibrary(root) : undefined;
	const pageSource =
		"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }";
	writeFileSync(pageFile, pageSource);
	return { root, pageFile, pageSource, libraryModule, childModule, executedFile };
}

function writeTransitiveLibrary(root: string): string {
	const libraryRoot = path.join(root, 'node_modules', '@vendor', 'icons');
	const module = path.join(libraryRoot, 'dist', 'index.js');
	mkdirSync(path.dirname(module), { recursive: true });
	writeFileSync(
		path.join(libraryRoot, 'package.json'),
		JSON.stringify({
			name: '@vendor/icons',
			version: '2.0.0',
			exports: { '.': './dist/index.js' },
			dependencies: { '@exactjs/component-library': '^0.1.0' },
			exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
		})
	);
	writeFileSync(module, 'export const Icon = () => null;\n');
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify({
			protocol: 1,
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
					exportName: 'Icon',
					componentId: '@vendor/icons:Icon'
				}
			]
		} satisfies ExactPublishedComponentBuildFacts)
	);
	return module;
}
