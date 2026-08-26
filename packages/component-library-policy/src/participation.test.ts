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

it('resolves compiler facts and relative imports from the implementation behind a facade', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-component-participation-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const marker = createPackage(root, '@exactjs/component-library', '0.1.0', 'marker', {
		exactComponentLibraryProtocol: 2
	});
	const library = createPackage(root, '@acme/cards', '1.2.3', 'cards', {
		exports: { '.': './dist/index.js' },
		dependencies: { '@exactjs/component-library': '^0.1.0' },
		exactComponentLibrary: { protocol: 2, build: './dist/exact-component-build.json' }
	});
	const facadeModule = path.join(library.root, 'dist', 'index.js');
	const implementationModule = path.join(library.root, 'dist', 'components', 'card.js');
	mkdirSync(path.dirname(implementationModule), { recursive: true });
	writeFileSync(facadeModule, "export { Card } from './components/card.js';\n");
	writeFileSync(implementationModule, 'export function Card() { return () => null; }\n');
	writeFileSync(
		path.join(library.root, 'dist', 'exact-component-build.json'),
		JSON.stringify(buildFacts())
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

	await expect(
		validateExactComponentParticipation(library, candidate, instances, edges)
	).resolves.toMatchObject({
		componentId: '@acme/cards:Card',
		componentBuild: {
			filename: implementationModule,
			componentImports: [{ moduleSpecifier: './icon.js', exportName: 'Icon' }]
		}
	});
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
		protocol: 2,
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
