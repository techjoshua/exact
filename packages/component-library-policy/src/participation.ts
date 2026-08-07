import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts
} from '@exactjs/compiler';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import type {
	ExactComponentAuthorizationErrorCode,
	ExactResolvedComponentCandidate,
	ExactResolvedDependencyEdge,
	ExactResolvedPackageInstance
} from './contracts.js';

/** Validated inert marker and static build-facts evidence for one package candidate. */
export type ExactComponentParticipation = Readonly<{
	markerVersion: string;
	buildFactsPath: string;
	buildFacts: ExactPublishedComponentBuildFacts;
	componentId: string;
	componentBuild: ExactComponentBuildFacts;
}>;

type ExactValidatedPackageParticipation = Readonly<{
	markerVersion: string;
	buildFactsPath: string;
	buildFacts: ExactPublishedComponentBuildFacts;
}>;

/** Generation-scoped validator that reads participation metadata once per package instance. */
export class ExactComponentParticipationValidator {
	readonly #packages = new Map<string, Promise<ExactValidatedPackageParticipation>>();

	/** Validates one selected component export while reusing its package's inert metadata read. */
	async validate(
		instance: ExactResolvedPackageInstance,
		candidate: ExactResolvedComponentCandidate,
		instances: ReadonlyMap<string, ExactResolvedPackageInstance>,
		edges: readonly ExactResolvedDependencyEdge[]
	): Promise<ExactComponentParticipation> {
		let pending = this.#packages.get(instance.key);
		if (!pending) {
			pending = validatePackageParticipation(instance, instances, edges);
			this.#packages.set(instance.key, pending);
		}
		return selectComponentParticipation(instance, candidate, await pending);
	}

	/** Releases all successful and rejected validation entries with their build generation. */
	clear(): void {
		this.#packages.clear();
	}

	/** Number of package-instance validations retained by the active generation. */
	get size(): number {
		return this.#packages.size;
	}
}

/** Failure produced while reading inert participation metadata before candidate evaluation. */
export class ExactComponentParticipationError extends Error {
	readonly code: ExactComponentAuthorizationErrorCode;

	constructor(code: ExactComponentAuthorizationErrorCode, message: string) {
		super(message);
		this.name = 'ExactComponentParticipationError';
		this.code = code;
	}
}

/**
 * Validates a candidate's declared production marker edge and static build facts.
 * No marker or candidate implementation module is imported during this operation.
 */
export async function validateExactComponentParticipation(
	instance: ExactResolvedPackageInstance,
	candidate: ExactResolvedComponentCandidate,
	instances: ReadonlyMap<string, ExactResolvedPackageInstance>,
	edges: readonly ExactResolvedDependencyEdge[]
): Promise<ExactComponentParticipation> {
	const validated = await validatePackageParticipation(instance, instances, edges);
	return selectComponentParticipation(instance, candidate, validated);
}

async function validatePackageParticipation(
	instance: ExactResolvedPackageInstance,
	instances: ReadonlyMap<string, ExactResolvedPackageInstance>,
	edges: readonly ExactResolvedDependencyEdge[]
): Promise<ExactValidatedPackageParticipation> {
	const manifest = await readManifest(instance);
	const markerRange = manifest.dependencies?.['@exactjs/component-library'];
	if (typeof markerRange !== 'string') {
		throw new ExactComponentParticipationError(
			'unmarked',
			`${instance.name} must declare @exactjs/component-library in production dependencies`
		);
	}
	const markerEdge = edges.find(
		(edge) =>
			edge.owner === instance.key &&
			edge.specifier === '@exactjs/component-library' &&
			edge.kind === 'dependency'
	);
	const marker = markerEdge ? instances.get(markerEdge.candidate) : undefined;
	if (!marker || marker.name !== '@exactjs/component-library') {
		throw new ExactComponentParticipationError(
			'unmarked',
			`${instance.name} has no resolver-proven production marker instance`
		);
	}
	const markerManifest = await readManifest(marker);
	if (
		!semver.satisfies(marker.version, markerRange) ||
		markerManifest.exactComponentLibraryProtocol !== 1
	) {
		throw new ExactComponentParticipationError(
			'marker-incompatible',
			`${instance.name} resolved an incompatible @exactjs/component-library marker`
		);
	}
	const declaration = manifest.exactComponentLibrary;
	if (!declaration || declaration.protocol !== 1 || typeof declaration.build !== 'string') {
		throw new ExactComponentParticipationError(
			'build-facts-missing',
			`${instance.name} must publish protocol-1 exactComponentLibrary.build facts`
		);
	}
	const buildFactsPath = packageRelativePath(instance.root, declaration.build, 'build facts');
	let buildFacts: ExactPublishedComponentBuildFacts;
	try {
		buildFacts = JSON.parse(
			await readFile(buildFactsPath, 'utf8')
		) as ExactPublishedComponentBuildFacts;
	} catch (error) {
		throw new ExactComponentParticipationError(
			'build-facts-missing',
			`Unable to read ${instance.name} component build facts: ${errorMessage(error)}`
		);
	}
	validatePublishedBuildFacts(buildFacts, instance, manifest);
	return Object.freeze({ markerVersion: marker.version, buildFactsPath, buildFacts });
}

function selectComponentParticipation(
	instance: ExactResolvedPackageInstance,
	candidate: ExactResolvedComponentCandidate,
	validated: ExactValidatedPackageParticipation
): ExactComponentParticipation {
	const { markerVersion, buildFactsPath, buildFacts } = validated;
	const resolvedModule = packageModulePath(instance.root, candidate.resolvedModuleId);
	const resolvedModuleFacts = buildFacts.modules.find(
		(module) => normalizeModulePath(module.path) === resolvedModule
	);
	const selected = buildFacts.exports.find(
		(record) =>
			normalizeModulePath(record.module) === resolvedModule &&
			record.exportName === candidate.exportName
	);
	if (!selected || !resolvedModuleFacts) {
		throw new ExactComponentParticipationError(
			'build-facts-invalid',
			`${instance.name} build facts do not map ${resolvedModule}#${candidate.exportName}`
		);
	}
	return Object.freeze({
		markerVersion,
		buildFactsPath,
		buildFacts,
		componentId: selected.componentId,
		componentBuild: Object.freeze({
			...resolvedModuleFacts.facts,
			filename: candidate.resolvedModuleId,
			packageName: instance.name
		})
	});
}

type PackageManifest = Readonly<{
	name?: string;
	version?: string;
	dependencies?: Readonly<Record<string, string>>;
	exactComponentLibraryProtocol?: number;
	exactComponentLibrary?: Readonly<{ protocol?: number; build?: string }>;
	exports?: unknown;
}>;

async function readManifest(instance: ExactResolvedPackageInstance): Promise<PackageManifest> {
	let manifest: PackageManifest;
	try {
		manifest = JSON.parse(await readFile(instance.manifestPath, 'utf8')) as PackageManifest;
	} catch (error) {
		throw new ExactComponentParticipationError(
			'provenance-unresolved',
			`Unable to read resolved package manifest for ${instance.name}: ${errorMessage(error)}`
		);
	}
	if (manifest.name !== instance.name || manifest.version !== instance.version) {
		throw new ExactComponentParticipationError(
			'provenance-unresolved',
			`Resolver identity for ${instance.name}@${instance.version} does not match its manifest`
		);
	}
	return manifest;
}

function validatePublishedBuildFacts(
	facts: ExactPublishedComponentBuildFacts,
	instance: ExactResolvedPackageInstance,
	manifest: PackageManifest
): void {
	if (
		!facts ||
		facts.protocol !== 1 ||
		facts.package?.name !== instance.name ||
		facts.package?.version !== instance.version ||
		!Array.isArray(facts.modules) ||
		!Array.isArray(facts.exports)
	)
		invalidBuildFacts(instance, 'top-level protocol or package identity is invalid');
	const modules = new Map<string, ExactPublishedComponentBuildFacts['modules'][number]>();
	for (const rawModule of facts.modules as readonly unknown[]) {
		if (!isRecord(rawModule) || !nonemptyString(rawModule.path))
			invalidBuildFacts(instance, 'module record is not an object');
		const modulePath = normalizeModulePath(rawModule.path);
		if (modulePath !== rawModule.path || modules.has(modulePath))
			invalidBuildFacts(instance, `invalid or duplicate module ${String(rawModule.path)}`);
		validateComponentBuildProjection(rawModule.facts, instance, modulePath);
		modules.set(modulePath, rawModule as ExactPublishedComponentBuildFacts['modules'][number]);
	}
	let previous = '';
	const exportsSeen = new Set<string>();
	for (const rawRecord of facts.exports as readonly unknown[]) {
		if (!isRecord(rawRecord)) invalidBuildFacts(instance, 'export record is not an object');
		if (
			!nonemptyString(rawRecord.subpath) ||
			!nonemptyString(rawRecord.condition) ||
			!nonemptyString(rawRecord.module) ||
			!nonemptyString(rawRecord.exportName) ||
			!nonemptyString(rawRecord.componentId) ||
			normalizeModulePath(rawRecord.module) !== rawRecord.module
		)
			invalidBuildFacts(instance, 'export record contains invalid fields');
		const record = rawRecord as ExactPublishedComponentBuildFacts['exports'][number];
		const key = [record.subpath, record.condition, record.exportName, record.componentId].join(
			'\0'
		);
		if (key < previous)
			invalidBuildFacts(instance, 'export records are not deterministically sorted');
		previous = key;
		const unique = [record.subpath, record.condition, record.module, record.exportName].join('\0');
		if (exportsSeen.has(unique)) invalidBuildFacts(instance, 'duplicate export mapping');
		exportsSeen.add(unique);
		const module = modules.get(normalizeModulePath(record.module));
		if (
			!module ||
			!module.facts.components.some((component) => component.id === record.componentId)
		)
			invalidBuildFacts(instance, `export ${record.exportName} has no matching component`);
		const targets = packageExportTargets(manifest.exports, record.subpath, record.condition).map(
			normalizeModulePath
		);
		if (!targets.includes(normalizeModulePath(record.module)))
			invalidBuildFacts(
				instance,
				`export ${record.subpath} condition ${record.condition} does not target ${record.module}`
			);
	}
}

function validateComponentBuildProjection(
	facts: unknown,
	instance: ExactResolvedPackageInstance,
	modulePath: string
): void {
	if (
		!isRecord(facts) ||
		facts.protocol !== 1 ||
		!Array.isArray(facts.components) ||
		!Array.isArray(facts.componentImports) ||
		!Array.isArray(facts.rendererEnhancements)
	)
		invalidBuildFacts(instance, `module ${modulePath} has an invalid component projection`);
	const projection = facts as ExactPublishedComponentBuildFacts['modules'][number]['facts'];
	const componentIds = new Set<string>();
	for (const component of projection.components) {
		if (
			!isRecord(component) ||
			typeof component.id !== 'string' ||
			!component.id ||
			!['client', 'server', 'isomorphic'].includes(String(component.placement)) ||
			!validArtifactTargets(component.artifactTargets) ||
			componentIds.has(component.id)
		)
			invalidBuildFacts(instance, `module ${modulePath} has an invalid component record`);
		componentIds.add(component.id);
	}
	for (const edge of projection.componentImports)
		if (
			!isRecord(edge) ||
			typeof edge.ownerComponentId !== 'string' ||
			!edge.ownerComponentId ||
			typeof edge.moduleSpecifier !== 'string' ||
			!edge.moduleSpecifier ||
			typeof edge.exportName !== 'string' ||
			!edge.exportName ||
			(edge.canonicalComponentId !== undefined && typeof edge.canonicalComponentId !== 'string') ||
			!validArtifactTargets(edge.artifactTargets) ||
			!['render', 'enhancement', 'registry', 'task-owner', 'continuation'].includes(
				String(edge.reason)
			)
		)
			invalidBuildFacts(instance, `module ${modulePath} has an invalid component import`);
	for (const enhancement of projection.rendererEnhancements)
		if (
			!isRecord(enhancement) ||
			!nonemptyString(enhancement.identity) ||
			!nonemptyString(enhancement.moduleSpecifier) ||
			!nonemptyString(enhancement.exportName)
		)
			invalidBuildFacts(instance, `module ${modulePath} has an invalid renderer enhancement`);
}

function validArtifactTargets(value: unknown): value is readonly ('client' | 'server')[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((target) => target === 'client' || target === 'server') &&
		new Set(value).size === value.length
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function packageExportTargets(exportsValue: unknown, subpath: string, condition: string): string[] {
	if (exportsValue === undefined) return subpath === '.' ? [] : [];
	const root =
		exportsValue &&
		typeof exportsValue === 'object' &&
		!Array.isArray(exportsValue) &&
		Object.keys(exportsValue).some((key) => key.startsWith('.'))
			? (exportsValue as Record<string, unknown>)[subpath]
			: subpath === '.'
				? exportsValue
				: undefined;
	return conditionTargets(root, condition);
}

function conditionTargets(value: unknown, condition: string): string[] {
	if (typeof value === 'string') return condition === 'default' ? [value] : [];
	if (Array.isArray(value)) return value.flatMap((entry) => conditionTargets(entry, condition));
	if (!value || typeof value !== 'object') return [];
	return conditionTargets((value as Record<string, unknown>)[condition], 'default');
}

function packageRelativePath(root: string, value: string, label: string): string {
	if (!value || path.isAbsolute(value))
		throw new ExactComponentParticipationError(
			'build-facts-invalid',
			`Component-library ${label} must be package-relative`
		);
	const resolved = path.resolve(root, value);
	const relative = path.relative(path.resolve(root), resolved);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
		throw new ExactComponentParticipationError(
			'build-facts-invalid',
			`Component-library ${label} escapes the package root`
		);
	return resolved;
}

function packageModulePath(root: string, moduleId: string): string {
	const clean = moduleId.replace(/[?#].*$/, '');
	const relative = path.relative(path.resolve(root), path.resolve(clean));
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
		throw new ExactComponentParticipationError(
			'provenance-unresolved',
			`Resolved component module is outside its package instance`
		);
	return normalizeModulePath(relative.replaceAll(path.sep, '/'));
}

function normalizeModulePath(value: string): string {
	const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
	if (
		!normalized ||
		normalized.startsWith('/') ||
		normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
	)
		return '';
	return normalized;
}

function invalidBuildFacts(instance: ExactResolvedPackageInstance, message: string): never {
	throw new ExactComponentParticipationError(
		'build-facts-invalid',
		`${instance.name} component build facts are invalid: ${message}`
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
