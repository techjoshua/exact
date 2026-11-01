import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type {
	ExactResolvedComponentCandidate,
	ExactResolvedDependencyEdge,
	ExactResolvedPackageInstance
} from './contracts.js';
import { validateExactComponentParticipation } from './participation.js';

it.each([
	'dist',
	'..dist',
	'unknown inspected',
	'unknown missing evidence',
	'unknown client evidence'
])('resolves compiler facts and relative imports from a %s facade', async (mode) => {
	const directory = mode.startsWith('unknown') ? 'dist' : mode;
	const root = mkdtempSync(path.join(tmpdir(), 'exact-component-participation-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const marker = createPackage(root, '@exactjs/component-library', '0.1.0', 'marker', {
		exactComponentLibraryProtocol: 1
	});
	const library = createPackage(root, '@acme/cards', '1.2.3', 'cards', {
		exports: { '.': `./${directory}/index.js` },
		dependencies: { '@exactjs/component-library': '^0.1.0' },
		exactComponentLibrary: { protocol: 1, build: `./${directory}/exact-component-build.json` }
	});
	const facadeModule = path.join(library.root, directory, 'index.js');
	const implementationModule = path.join(library.root, directory, 'components', 'card.js');
	mkdirSync(path.dirname(implementationModule), { recursive: true });
	writeFileSync(facadeModule, "export { Card } from './components/card.js';\n");
	writeFileSync(implementationModule, 'export function Card() { return () => null; }\n');
	writeFileSync(
		path.join(library.root, directory, 'exact-component-build.json'),
		JSON.stringify(
			mode.startsWith('unknown')
				? {
						...buildFacts(),
						modules: buildFacts().modules.map((module) => ({
							...module,
							facts: {
								...module.facts,
								components: module.facts.components.map((component) => ({
									...component,
									placement: 'unknown',
									artifactTargets: []
								}))
							}
						})),
						exports: buildFacts().exports.map((record) => ({
							...record,
							...(mode === 'unknown missing evidence'
								? {}
								: { target: mode === 'unknown client evidence' ? 'client' : 'server' })
						}))
					}
				: buildFacts(),
			(_key, value) =>
				typeof value === 'string' ? value.replace(/^dist\//, `${directory}/`) : value
		)
	);
	const candidate: ExactResolvedComponentCandidate = Object.freeze({
		importerModuleId: '/app/Page.tsx',
		moduleSpecifier: '@acme/cards',
		exportName: 'Card',
		resolvedModuleId: facadeModule,
		packageInstanceKey: library.key,
		reason: 'ssr'
	});
	const instances = new Map([
		[library.key, library],
		[marker.key, marker]
	]);
	const edges: readonly ExactResolvedDependencyEdge[] = [
		{
			owner: library.key,
			candidate: marker.key,
			specifier: '@exactjs/component-library',
			kind: 'dependency'
		}
	];

	const selection = validateExactComponentParticipation(library, candidate, instances, edges);
	if (mode === 'unknown missing evidence' || mode === 'unknown client evidence') {
		await expect(selection).rejects.toMatchObject({ code: 'build-facts-invalid' });
		return;
	}
	await expect(selection).resolves.toMatchObject({
		componentId: '@acme/cards:Card',
		componentBuild: {
			filename: implementationModule,
			componentImports: [{ moduleSpecifier: './icon.js', exportName: 'Icon' }]
		}
	});
});

it.each([
	'valid',
	'dot-prefixed importer',
	'foreign importer',
	'wrong export',
	'wrong identity',
	'missing identity',
	'client-only edge',
	'unknown inspected',
	'unknown missing evidence',
	'unknown wrong target',
	'unknown wrong destination',
	'unknown wrong canonical identity'
])('validates internal component edges from published canonical facts: %s', async (mode) => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-internal-participation-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const marker = createPackage(root, '@exactjs/component-library', '0.1.0', 'marker', {
		exactComponentLibraryProtocol: 1
	});
	const library = createPackage(root, '@acme/cards', '1.2.3', 'cards', {
		exports: { '.': './dist/index.js' },
		dependencies: { '@exactjs/component-library': '^0.1.0' },
		exactComponentLibrary: { protocol: 1, build: './dist/facts.json' }
	});
	const facts = buildFacts();
	const originalOwner = facts.modules[0]!;
	const owner =
		mode === 'dot-prefixed importer'
			? { ...originalOwner, path: '..owners/card.js' }
			: originalOwner;
	const iconId = 'opaque-private-icon-identity';
	const internal = {
		path: 'dist/components/icon.js',
		facts: {
			protocol: 1 as const,
			components: [
				{
					id: iconId,
					placement: mode.startsWith('unknown') ? ('unknown' as const) : ('isomorphic' as const),
					artifactTargets: mode.startsWith('unknown') ? [] : (['client', 'server'] as const)
				}
			],
			componentImports: [],
			rendererEnhancements: []
		}
	};
	writeFileSync(
		path.join(library.root, 'dist/facts.json'),
		JSON.stringify({
			...facts,
			exports: facts.exports.map((entry) => ({ ...entry, componentModule: owner.path })),
			modules: [
				{
					...owner,
					facts: {
						...owner.facts,
						componentImports: [
							{
								...owner.facts.componentImports[0],
								...(mode === 'missing identity'
									? {}
									: { canonicalComponentId: mode === 'wrong identity' ? 'unrelated' : iconId }),
								artifactTargets: mode.startsWith('unknown')
									? []
									: mode === 'client-only edge'
										? ['client']
										: ['client', 'server'],
								...(mode.startsWith('unknown') && mode !== 'unknown missing evidence'
									? {
											executable: {
												target: mode === 'unknown wrong target' ? 'client' : 'server',
												module:
													mode === 'unknown wrong destination' ? 'dist/missing.js' : internal.path
											},
											...(mode === 'unknown wrong canonical identity'
												? { canonicalComponentId: 'unrelated' }
												: {})
										}
									: {})
							}
						]
					}
				},
				internal
			]
		})
	);
	const candidate: ExactResolvedComponentCandidate = {
		importerModuleId:
			mode === 'foreign importer' ? '/app/Page.tsx' : path.join(library.root, owner.path),
		moduleSpecifier: './icon.js',
		exportName: mode === 'wrong export' ? 'Unrelated' : 'Icon',
		resolvedModuleId: path.join(library.root, internal.path),
		packageInstanceKey: library.key,
		reason: 'ssr'
	};
	const result = validateExactComponentParticipation(
		library,
		candidate,
		new Map([
			[library.key, library],
			[marker.key, marker]
		]),
		[
			{
				owner: library.key,
				candidate: marker.key,
				specifier: '@exactjs/component-library',
				kind: 'dependency'
			}
		]
	);
	if (mode === 'valid' || mode === 'dot-prefixed importer' || mode === 'unknown inspected')
		await expect(result).resolves.toMatchObject({
			componentId: iconId,
			componentBuild: { filename: candidate.resolvedModuleId }
		});
	else await expect(result).rejects.toMatchObject({ code: 'build-facts-invalid' });
});

function createPackage(
	root: string,
	name: string,
	version: string,
	directory: string,
	extra: Record<string, unknown>
): ExactResolvedPackageInstance {
	const packageRoot = path.join(root, directory);
	mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
	const manifestPath = path.join(packageRoot, 'package.json');
	writeFileSync(manifestPath, JSON.stringify({ name, version, ...extra }));
	return Object.freeze({
		key: `${directory}:${name}@${version}`,
		root: packageRoot,
		manifestPath,
		name,
		version
	});
}

function buildFacts(): ExactPublishedComponentBuildFacts {
	return {
		protocol: 1,
		package: { name: '@acme/cards', version: '1.2.3' },
		modules: [
			{
				path: 'dist/components/card.js',
				facts: {
					protocol: 1,
					components: [
						{
							id: '@acme/cards:Card',
							placement: 'isomorphic',
							artifactTargets: ['client', 'server']
						}
					],
					componentImports: [
						{
							ownerComponentId: '@acme/cards:Card',
							moduleSpecifier: './icon.js',
							exportName: 'Icon',
							artifactTargets: ['client', 'server'],
							reason: 'render'
						}
					],
					rendererEnhancements: []
				}
			}
		],
		exports: [
			{
				subpath: '.',
				condition: 'default',
				module: 'dist/index.js',
				componentModule: 'dist/components/card.js',
				exportName: 'Card',
				componentId: '@acme/cards:Card'
			}
		]
	};
}
