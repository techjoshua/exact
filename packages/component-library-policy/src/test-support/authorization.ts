import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts
} from '@exactjs/compiler';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished } from 'vitest';
import {
	createExactComponentAuthorizationSession,
	type ExactComponentAuthorizationSession,
	type ExactResolvedComponentCandidate,
	type ExactResolvedPackageInstance
} from '../index.js';

type Fixture = ReturnType<typeof createFixture>;

export function createFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-component-policy-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const marker = createPackage(root, '@exactjs/component-library', '0.1.0', 'marker', {
		exactComponentLibraryProtocol: 1
	});
	const library = createPackage(root, '@acme/cards', '1.2.3', 'cards', {
		exports: { '.': './dist/index.js' },
		dependencies: { '@exactjs/component-library': '^0.1.0' },
		exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
	});
	writeBuildFacts(library, 'Card');
	const candidate: ExactResolvedComponentCandidate = Object.freeze({
		importerModuleId: '/app/Page.tsx',
		moduleSpecifier: '@acme/cards',
		exportName: 'Card',
		resolvedModuleId: path.join(library.root, 'dist', 'index.js'),
		packageInstanceKey: library.key,
		reason: 'ssr'
	});
	return { root, marker, library, candidate };
}

export function addLibrary(fixture: Fixture, name: string, version: string, directory: string) {
	const marker = createPackage(
		fixture.root,
		'@exactjs/component-library',
		'0.1.0',
		`${directory}-marker`,
		{
			exactComponentLibraryProtocol: 1
		}
	);
	const instance = createPackage(fixture.root, name, version, directory, {
		exports: { '.': './dist/index.js' },
		dependencies: { '@exactjs/component-library': '^0.1.0' },
		exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
	});
	writeBuildFacts(instance, 'Icon');
	return {
		marker,
		instance,
		candidate: Object.freeze({
			importerModuleId: '/app/Page.tsx',
			moduleSpecifier: name,
			exportName: 'Icon',
			resolvedModuleId: path.join(instance.root, 'dist', 'index.js'),
			packageInstanceKey: instance.key,
			reason: 'ssr' as const
		})
	};
}

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
	writeFileSync(path.join(packageRoot, 'dist', 'index.js'), 'export const inert = true;\n');
	return Object.freeze({
		key: `${directory}:${name}@${version}`,
		root: packageRoot,
		manifestPath,
		name,
		version,
		integrity: name === '@acme/cards' ? 'sha512-secret-integrity' : `sha512-${directory}`
	});
}

export function writeBuildFacts(
	instance: ExactResolvedPackageInstance,
	exportName: string,
	componentImports: ExactComponentBuildFacts['componentImports'] = []
): void {
	const facts: ExactPublishedComponentBuildFacts = {
		protocol: 1,
		package: { name: instance.name, version: instance.version },
		modules: [
			{
				path: 'dist/index.js',
				facts: {
					protocol: 1,
					components: [
						{
							id: `${instance.name}:${exportName}`,
							placement: 'isomorphic',
							artifactTargets: ['client', 'server']
						}
					],
					componentImports,
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
				exportName,
				componentId: `${instance.name}:${exportName}`
			}
		]
	};
	writeFileSync(
		path.join(instance.root, 'dist', 'exact-component-build.json'),
		JSON.stringify(facts)
	);
}

export function importerFacts(
	edges: readonly (readonly [moduleSpecifier: string, exportName: string])[] = [
		['@acme/cards', 'Card']
	]
): ExactComponentBuildFacts {
	return Object.freeze({
		protocol: 1,
		filename: '/app/Page.tsx',
		components: [
			{ id: 'app:Page', placement: 'isomorphic', artifactTargets: ['client', 'server'] }
		],
		componentImports: edges.map(([moduleSpecifier, exportName]) => ({
			ownerComponentId: 'app:Page',
			moduleSpecifier,
			exportName,
			artifactTargets: ['client', 'server'],
			reason: 'render'
		})),
		rendererEnhancements: []
	} satisfies ExactComponentBuildFacts);
}

export function createSession(
	fixture: Fixture,
	config?: Parameters<typeof createExactComponentAuthorizationSession>[0]['config']
): ExactComponentAuthorizationSession {
	return createExactComponentAuthorizationSession({ buildKey: `build:${fixture.root}`, config });
}

export function recordPackage(
	session: ExactComponentAuthorizationSession,
	instance: ExactResolvedPackageInstance,
	marker: ExactResolvedPackageInstance
): void {
	session.recordPackageInstance(instance);
	session.recordPackageInstance(marker);
	session.recordDependencyEdge({
		owner: instance.key,
		candidate: marker.key,
		specifier: '@exactjs/component-library',
		kind: 'dependency'
	});
}

export function recordCandidateGraph(
	session: ExactComponentAuthorizationSession,
	fixture: Fixture,
	root = true
): void {
	session.recordImporterFacts('/app/Page.tsx', importerFacts(), 'v1');
	recordPackage(session, fixture.library, fixture.marker);
	if (root)
		session.recordDependencyEdge({
			owner: 'application',
			candidate: fixture.library.key,
			specifier: '@acme/cards',
			kind: 'dependency'
		});
}

export async function authorizeRootFixture(fixture: Fixture, buildKey: string) {
	const session = createExactComponentAuthorizationSession({ buildKey });
	recordCandidateGraph(session, fixture);
	await session.authorizeResolvedComponent(fixture.candidate);
	return session.commitGeneration();
}
