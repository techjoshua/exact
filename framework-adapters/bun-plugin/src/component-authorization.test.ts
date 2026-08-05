import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { ExactBunComponentAuthorization } from './component-authorization.js';
import { transformExactBunSource } from './plugin.js';

describe('@exactjs/bun-plugin: component authorization', () => {
	it('authorizes a resolver-owned server candidate without evaluating it', async () => {
		const fixture = createFixture();
		const authorization = new ExactBunComponentAuthorization({
			applicationRoot: fixture.root,
			buildKey: 'bun-fixture'
		});
		onTestFinished(() => authorization.dispose());
		await authorization.start();
		const transformed = transformExactBunSource(fixture.pageSource, fixture.pageFile, {
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		authorization.record(
			fixture.pageFile,
			fixture.pageSource,
			transformed!.componentBuild!
		);

		await expect(
			authorization.authorize('@acme/cards', fixture.pageFile, async () => ({
				path: fixture.libraryModule
			}))
		).resolves.toEqual({ path: fixture.libraryModule });
		const committed = await authorization.commit();

		expect(committed?.manifest.packages[0]).toMatchObject({
			name: '@acme/cards',
			decision: 'root',
			reasons: ['ssr'],
			integrityHash: expect.any(String)
		});
		expect(existsSync(fixture.executedFile)).toBe(false);
	});

	it('rejects an explicitly denied candidate before candidate onLoad', async () => {
		const fixture = createFixture();
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			"export default { componentLibraries: { deny: ['@acme/cards'] } };\n"
		);
		const authorization = new ExactBunComponentAuthorization({ applicationRoot: fixture.root });
		onTestFinished(() => authorization.dispose());
		await authorization.start();
		const transformed = transformExactBunSource(fixture.pageSource, fixture.pageFile, {
			target: 'server',
			applicationRoot: fixture.root,
			reactCompatibility: false
		});
		authorization.record(
			fixture.pageFile,
			fixture.pageSource,
			transformed!.componentBuild!
		);

		await expect(
			authorization.authorize('@acme/cards', fixture.pageFile, async () => ({
				path: fixture.libraryModule
			}))
		).rejects.toMatchObject({ code: 'explicitly-denied' });
		expect(existsSync(fixture.executedFile)).toBe(false);
	});
});

function createFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-bun-component-policy-'));
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
		JSON.stringify({ name: '@app/test', version: '1.0.0', dependencies: { '@acme/cards': '1.0.0' } })
	);
	writeFileSync(
		path.join(root, 'package-lock.json'),
		JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/@acme/cards': { integrity: 'sha512-fixture-integrity' }
			}
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
	writeFileSync(path.join(libraryRoot, 'dist', 'exact-component-build.json'), JSON.stringify(facts));
	const pageSource =
		"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }";
	writeFileSync(pageFile, pageSource);
	return { root, pageFile, pageSource, libraryModule, executedFile };
}
