import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
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
import { build } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';
import { compileProjectArtifacts } from '@exactjs/compiler';

it.each([false, true])(
	'emits authorization artifacts from a real Vite server build (paired=%s)',
	async (paired) => {
		const fixture = createFixture();
		const entry = await entryFor(fixture, paired);
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
				ssr: entry,
				outDir: path.join(fixture.root, 'dist'),
				rollupOptions: { external: /^@exactjs\/core(?:\/.*)?$/ }
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
	}
);

it.each([
	[false, false],
	[true, false],
	[false, true],
	[true, true]
])(
	'warns at build and rejects execution before denied component effects (transitive=%s, paired=%s)',
	async (transitive, paired) => {
		const fixture = createFixture(transitive);
		const entry = await entryFor(fixture, paired);
		const denied = transitive ? '@vendor/icons' : '@acme/cards';
		writeFileSync(
			path.join(fixture.root, 'exact.config.mjs'),
			`export default { componentLibraries: { deny: [${JSON.stringify(denied)}] } };`
		);
		const candidate = path.join(
			fixture.root,
			'node_modules',
			...denied.split('/'),
			'dist',
			'index.js'
		);
		writeFileSync(
			candidate,
			`throw new Error('DENIED_IMPLEMENTATION_EVALUATED');\n` + readFileSync(candidate, 'utf8')
		);
		const warnings: string[] = [];
		await build({
			root: fixture.root,
			configFile: false,
			logLevel: 'silent',
			plugins: [
				exact({ target: 'server', applicationRoot: fixture.root, reactCompatibility: false })
			],
			build: {
				ssr: entry,
				outDir: path.join(fixture.root, 'dist'),
				rollupOptions: {
					external: /^@exactjs\/core(?:\/.*)?$/,
					onwarn(warning) {
						warnings.push(warning.message);
					}
				}
			}
		});
		expect(warnings.join('\n')).toContain('explicitly-denied');
		const output = readdirSync(path.join(fixture.root, 'dist')).find((name) =>
			/\.m?js$/.test(name)
		)!;
		const execution = spawnSync(process.execPath, [path.join(fixture.root, 'dist', output)], {
			encoding: 'utf8'
		});
		expect(execution.status).not.toBe(0);
		expect(execution.stderr).toContain('explicitly-denied');
		expect(execution.stderr).not.toContain('DENIED_IMPLEMENTATION_EVALUATED');
	}
);

/** Exercises authored source and on-disk paired output through the same real bundler gate. */
async function entryFor(
	fixture: { root: string; entry: string },
	paired: boolean
): Promise<string> {
	if (!paired) return fixture.entry;
	const [artifact] = await compileProjectArtifacts([fixture.entry], {
		rootDir: path.join(fixture.root, 'src'),
		outDir: path.join(fixture.root, '.exact'),
		languageExtensions: false
	});
	return artifact!.serverFile;
}

function createFixture(transitive = false) {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-vite-authorization-build-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const entry = path.join(root, 'src', 'Page.tsx');
	const libraryRoot = path.join(root, 'node_modules', '@acme', 'cards');
	const markerRoot = path.join(root, 'node_modules', '@exactjs', 'component-library');
	mkdirSync(path.dirname(entry), { recursive: true });
	mkdirSync(path.join(libraryRoot, 'dist'), { recursive: true });
	mkdirSync(markerRoot, { recursive: true });
	symlinkSync(
		fileURLToPath(new URL('../../../packages/core', import.meta.url)),
		path.join(root, 'node_modules', '@exactjs', 'core'),
		'junction'
	);
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
		path.join(libraryRoot, 'dist', 'index.js'),
		transitive
			? "import { Icon } from '@vendor/icons'; export function Card() { return () => Icon; }\n"
			: 'export function Card() { return () => null; }\n'
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
	writeFileSync(
		entry,
		"import { Card } from '@acme/cards'; export function Page() { return () => <Card />; }\n"
	);
	return { root, entry };
}

function writeTransitiveLibrary(root: string): void {
	const libraryRoot = path.join(root, 'node_modules', '@vendor', 'icons');
	mkdirSync(path.join(libraryRoot, 'dist'), { recursive: true });
	writeFileSync(
		path.join(libraryRoot, 'package.json'),
		JSON.stringify({
			name: '@vendor/icons',
			version: '2.0.0',
			type: 'module',
			exports: { '.': './dist/index.js' },
			dependencies: { '@exactjs/component-library': '^0.1.0' },
			exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
		})
	);
	writeFileSync(path.join(libraryRoot, 'dist', 'index.js'), 'export const Icon = () => null;\n');
	const facts: ExactPublishedComponentBuildFacts = {
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
				componentModule: 'dist/index.js',
				exportName: 'Icon',
				componentId: '@vendor/icons:Icon'
			}
		]
	};
	writeFileSync(
		path.join(libraryRoot, 'dist', 'exact-component-build.json'),
		JSON.stringify(facts)
	);
}
