import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts
} from '@exactjs/compiler';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import {
	ExactComponentAuthorizationError,
	createExactComponentAuthorizationSession,
	exactComponentAuthorizationIdentity,
	readExactComponentAuthorizationIdentity,
	normalizeExactComponentLibraryPolicy,
	type ExactComponentAuthorizationSession,
	type ExactResolvedComponentCandidate,
	type ExactResolvedPackageInstance
} from './index.js';

describe('@exactjs/component-library-policy', () => {
	it('normalizes the fixed trusted defaults and rejects ambiguous selectors', () => {
		const policy = normalizeExactComponentLibraryPolicy(undefined);

		expect(policy).toMatchObject({
			mode: 'trusted',
			allow: [],
			deny: [],
			trustedScopes: [],
			includeDefaultTrustedScopes: true,
			unauthorizedOptionalEnhancements: 'error',
			policyHash: expect.any(String)
		});
		expect(() => normalizeExactComponentLibraryPolicy({ allow: ['@acme/'] })).not.toThrow();
		expect(() => normalizeExactComponentLibraryPolicy({ allow: ['acme/'] })).toThrow(
			'scope ending in /'
		);
		expect(() =>
			normalizeExactComponentLibraryPolicy({
				allow: [{ package: '@acme/cards', version: 'not semver' }]
			})
		).toThrow('valid semver range');
		expect(() => normalizeExactComponentLibraryPolicy({ unexpected: true } as never)).toThrow(
			'unexpected is not a supported property'
		);
		expect(() =>
			normalizeExactComponentLibraryPolicy({
				allow: [{ package: '@acme/cards', unexpected: true } as never]
			})
		).toThrow('unexpected is not a supported property');
	});

	it('authorizes a resolver-proven root dependency and emits deterministic redacted output', async () => {
		const fixture = createFixture();
		const first = await authorizeRootFixture(fixture, 'build-one');
		const second = await authorizeRootFixture(fixture, 'build-one');

		expect(first).toEqual(second);
		expect(first.manifest.packages).toEqual([
			expect.objectContaining({
				name: '@acme/cards',
				version: '1.2.3',
				decision: 'root',
				reasons: ['ssr'],
				integrityHash: expect.any(String)
			})
		]);
		expect(first.audit.packages[0]?.provenance).toEqual([
			{ owner: 'application', specifier: '@acme/cards', kind: 'dependency' }
		]);
		expect(JSON.stringify(first)).not.toContain(fixture.root);
		expect(JSON.stringify(first)).not.toContain('sha512-secret-integrity');
		expect(exactComponentAuthorizationIdentity(first.manifest)).toEqual({
			protocol: 1,
			buildKey: 'build-one',
			fingerprint: first.manifest.fingerprint
		});
		const manifestPath = path.join(fixture.root, 'component-library-authorization.json');
		writeFileSync(manifestPath, JSON.stringify(first.manifest));
		await expect(readExactComponentAuthorizationIdentity(manifestPath)).resolves.toEqual({
			protocol: 1,
			buildKey: 'build-one',
			fingerprint: first.manifest.fingerprint
		});
	});

	it('applies deny before root and constrained allow rules by resolved instance', async () => {
		const fixture = createFixture();
		const denied = createSession(fixture, {
			deny: [{ package: '@acme/cards', version: '^1.0.0' }]
		});
		recordCandidateGraph(denied, fixture);

		await expect(denied.authorizeResolvedComponent(fixture.candidate)).rejects.toMatchObject({
			code: 'explicitly-denied'
		});

		const allowed = createSession(fixture, {
			mode: 'root',
			allow: [
				{
					package: '@acme/cards',
					version: '^1.2.0',
					integrity: 'sha512-secret-integrity'
				}
			]
		});
		recordCandidateGraph(allowed, fixture, false);
		await expect(allowed.authorizeResolvedComponent(fixture.candidate)).resolves.toMatchObject({
			outcome: 'authorized'
		});
	});

	it('applies trusted scopes, disabled defaults, all mode, and optional dependency rules', async () => {
		const fixture = createFixture();
		const scoped = createSession(fixture, {
			trustedScopes: ['@acme/'],
			includeDefaultTrustedScopes: false
		});
		recordCandidateGraph(scoped, fixture, false);
		await scoped.authorizeResolvedComponent(fixture.candidate);
		expect((await scoped.commitGeneration()).manifest.packages[0]?.decision).toBe('scope');

		const all = createSession(fixture, {
			mode: 'all',
			includeDefaultTrustedScopes: false
		});
		recordCandidateGraph(all, fixture, false);
		await all.authorizeResolvedComponent(fixture.candidate);
		expect((await all.commitGeneration()).manifest.packages[0]?.decision).toBe('all');

		const optional = createSession(fixture);
		recordCandidateGraph(optional, fixture, false);
		optional.recordDependencyEdge({
			owner: 'application',
			candidate: fixture.library.key,
			specifier: '@acme/cards',
			kind: 'optionalDependency'
		});
		await expect(optional.authorizeResolvedComponent(fixture.candidate)).rejects.toMatchObject({
			code: 'not-allowed'
		});

		const explicitlyAllowed = createSession(fixture, { allow: ['@acme/cards'] });
		recordCandidateGraph(explicitlyAllowed, fixture, false);
		explicitlyAllowed.recordDependencyEdge({
			owner: 'application',
			candidate: fixture.library.key,
			specifier: '@acme/cards',
			kind: 'optionalDependency'
		});
		await explicitlyAllowed.authorizeResolvedComponent(fixture.candidate);
		expect((await explicitlyAllowed.commitGeneration()).manifest.packages[0]?.decision).toBe(
			'allow'
		);
	});

	it('keeps duplicate physical instances separate even when names and versions match', async () => {
		const fixture = createFixture();
		const first = addLibrary(fixture, '@vendor/icons', '2.0.0', 'icons-one');
		const second = addLibrary(fixture, '@vendor/icons', '2.0.0', 'icons-two');
		const session = createSession(fixture, { mode: 'all' });
		session.recordImporterFacts('/app/Page.tsx', importerFacts([['@vendor/icons', 'Icon']]), 'v1');
		recordPackage(session, first.instance, first.marker);
		recordPackage(session, second.instance, second.marker);
		await session.authorizeResolvedComponent(first.candidate);
		await session.authorizeResolvedComponent(second.candidate);

		const packages = (await session.commitGeneration()).manifest.packages;
		expect(packages).toHaveLength(2);
		expect(new Set(packages.map((candidate) => candidate.instanceId)).size).toBe(2);
		expect(packages.map((candidate) => candidate.name)).toEqual(['@vendor/icons', '@vendor/icons']);
	});

	it('requires the production marker edge and never imports candidate code to validate it', async () => {
		const fixture = createFixture();
		const executed = path.join(fixture.root, 'executed.txt');
		writeFileSync(
			fixture.candidate.resolvedModuleId,
			`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(executed)}, 'bad');`
		);
		const session = createSession(fixture);
		session.recordImporterFacts('/app/Page.tsx', importerFacts(), 'v1');
		session.recordPackageInstance(fixture.library);
		session.recordDependencyEdge({
			owner: 'application',
			candidate: fixture.library.key,
			specifier: '@acme/cards',
			kind: 'dependency'
		});

		await expect(session.authorizeResolvedComponent(fixture.candidate)).rejects.toMatchObject({
			code: 'unmarked'
		});
		expect(() => rmSync(executed)).toThrow();
	});

	it('rejects malformed nested build facts before candidate evaluation', async () => {
		const fixture = createFixture();
		const factsPath = path.join(fixture.library.root, 'dist', 'exact-component-build.json');
		const facts = JSON.parse(readFileSync(factsPath, 'utf8')) as {
			modules: Array<{ facts: { components: Array<{ artifactTargets: string[] }> } }>;
		};
		facts.modules[0]!.facts.components[0]!.artifactTargets = ['server', 'worker'];
		writeFileSync(factsPath, JSON.stringify(facts));
		const session = createSession(fixture);
		recordCandidateGraph(session, fixture);

		await expect(session.authorizeResolvedComponent(fixture.candidate)).rejects.toMatchObject({
			code: 'build-facts-invalid'
		});
	});

	it('delegates only across an authorized production dependency edge', async () => {
		const fixture = createFixture();
		const child = addLibrary(fixture, '@vendor/icons', '2.0.0', 'icons');
		const session = createSession(fixture);
		session.recordImporterFacts(
			'/app/Page.tsx',
			importerFacts([
				['@acme/cards', 'Card'],
				['@vendor/icons', 'Icon']
			]),
			'v1'
		);
		recordPackage(session, fixture.library, fixture.marker);
		recordPackage(session, child.instance, child.marker);
		session.recordDependencyEdge({
			owner: 'application',
			candidate: fixture.library.key,
			specifier: '@acme/cards',
			kind: 'dependency'
		});
		session.recordDependencyEdge({
			owner: fixture.library.key,
			candidate: child.instance.key,
			specifier: '@vendor/icons',
			kind: 'dependency'
		});
		await session.authorizeResolvedComponent(fixture.candidate);
		await session.authorizeResolvedComponent(child.candidate);

		const committed = await session.commitGeneration();
		expect(committed.manifest.packages.map((record) => record.decision).sort()).toEqual([
			'delegated',
			'root'
		]);

		const peerSession = createSession(fixture);
		peerSession.recordImporterFacts(
			'/app/Page.tsx',
			importerFacts([['@vendor/icons', 'Icon']]),
			'v1'
		);
		recordPackage(peerSession, child.instance, child.marker);
		peerSession.recordDependencyEdge({
			owner: fixture.library.key,
			candidate: child.instance.key,
			specifier: '@vendor/icons',
			kind: 'peerDependency'
		});
		await expect(peerSession.authorizeResolvedComponent(child.candidate)).rejects.toMatchObject({
			code: 'not-allowed'
		});
	});

	it('feeds published importer facts into transitive component authorization', async () => {
		const fixture = createFixture();
		const child = addLibrary(fixture, '@vendor/icons', '2.0.0', 'published-icons');
		writeBuildFacts(fixture.library, 'Card', [
			{
				ownerComponentId: '@acme/cards:Card',
				moduleSpecifier: '@vendor/icons',
				exportName: 'Icon',
				artifactTargets: ['client', 'server'],
				reason: 'render'
			}
		]);
		const session = createSession(fixture);
		session.recordImporterFacts('/app/Page.tsx', importerFacts(), 'v1');
		recordPackage(session, fixture.library, fixture.marker);
		recordPackage(session, child.instance, child.marker);
		session.recordDependencyEdge({
			owner: 'application',
			candidate: fixture.library.key,
			specifier: '@acme/cards',
			kind: 'dependency'
		});
		session.recordDependencyEdge({
			owner: fixture.library.key,
			candidate: child.instance.key,
			specifier: '@vendor/icons',
			kind: 'dependency'
		});
		const parent = await session.authorizeResolvedComponent(fixture.candidate);
		expect(parent).toMatchObject({
			outcome: 'authorized',
			componentBuild: {
				filename: fixture.candidate.resolvedModuleId,
				packageName: '@acme/cards'
			}
		});
		await expect(
			session.authorizeResolvedComponent({
				...child.candidate,
				importerModuleId: fixture.candidate.resolvedModuleId
			})
		).resolves.toMatchObject({ outcome: 'authorized' });

		expect(
			(await session.commitGeneration()).manifest.packages.map((entry) => entry.decision).sort()
		).toEqual(['delegated', 'root']);
	});

	it('validates package participation once within a generation', async () => {
		const fixture = createFixture();
		const session = createSession(fixture);
		recordCandidateGraph(session, fixture);

		await session.authorizeResolvedComponent(fixture.candidate);
		expect(session.getTelemetry()).toMatchObject({
			state: 'open',
			authorizedPackages: 1,
			participationCacheEntries: 1
		});
		rmSync(path.join(fixture.library.root, 'dist', 'exact-component-build.json'));
		await expect(session.authorizeResolvedComponent(fixture.candidate)).resolves.toMatchObject({
			outcome: 'authorized'
		});
	});

	it('omits only optional enhancements under the explicit exclude policy', async () => {
		const fixture = createFixture();
		const session = createSession(fixture, {
			mode: 'root',
			unauthorizedOptionalEnhancements: 'exclude'
		});
		session.recordImporterFacts(
			'/app/Page.tsx',
			{
				...importerFacts([]),
				rendererEnhancements: [
					{
						identity: 'cards:lift',
						moduleSpecifier: '@acme/cards',
						exportName: 'Card'
					}
				]
			},
			'v1'
		);
		recordPackage(session, fixture.library, fixture.marker);
		const optional = {
			...fixture.candidate,
			reason: 'server-enhancement' as const,
			optionalEnhancementIdentity: 'cards:lift'
		};

		await expect(session.authorizeResolvedComponent(optional)).resolves.toEqual({
			outcome: 'omitted',
			enhancementIdentity: 'cards:lift'
		});
		const committed = await session.commitGeneration();
		expect(committed.manifest.omittedEnhancements).toEqual(['cards:lift']);
		expect(committed.audit.omittedEnhancements[0]).toMatchObject({
			packageName: '@acme/cards',
			reason: 'not-allowed'
		});
	});

	it('fences changed importer versions and releases rejected generations', () => {
		const fixture = createFixture();
		const session = createSession(fixture);
		session.recordImporterFacts('/app/Page.tsx', importerFacts(), 'v1');
		expect(() => session.recordImporterFacts('/app/Page.tsx', importerFacts(), 'v2')).toThrowError(
			ExactComponentAuthorizationError
		);
		session.rejectGeneration();
		expect(session.getTelemetry()).toEqual({
			state: 'rejected',
			importers: 0,
			packageInstances: 0,
			dependencyEdges: 0,
			authorizedPackages: 0,
			omittedEnhancements: 0,
			participationCacheEntries: 0
		});
		expect(() => session.recordPackageInstance(fixture.library)).toThrowError(
			ExactComponentAuthorizationError
		);
	});
});

type Fixture = ReturnType<typeof createFixture>;

function createFixture() {
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

function addLibrary(fixture: Fixture, name: string, version: string, directory: string) {
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

function writeBuildFacts(
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

function importerFacts(
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
	});
}

function createSession(
	fixture: Fixture,
	config?: Parameters<typeof createExactComponentAuthorizationSession>[0]['config']
): ExactComponentAuthorizationSession {
	return createExactComponentAuthorizationSession({ buildKey: `build:${fixture.root}`, config });
}

function recordPackage(
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

function recordCandidateGraph(
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

async function authorizeRootFixture(fixture: Fixture, buildKey: string) {
	const session = createExactComponentAuthorizationSession({ buildKey });
	recordCandidateGraph(session, fixture);
	await session.authorizeResolvedComponent(fixture.candidate);
	return session.commitGeneration();
}
