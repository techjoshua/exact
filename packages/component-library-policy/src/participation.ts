import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
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
}>;

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
	const resolvedModule = packageModulePath(instance.root, candidate.resolvedModuleId);
	const selected = buildFacts.exports.find(
		(record) =>
			normalizeModulePath(record.module) === resolvedModule &&
			record.exportName === candidate.exportName
	);
	if (!selected) {
		throw new ExactComponentParticipationError(
			'build-facts-invalid',
			`${instance.name} build facts do not map ${resolvedModule}#${candidate.exportName}`
		);
	}
	return Object.freeze({
		markerVersion: marker.version,
		buildFactsPath,
		buildFacts,
		componentId: selected.componentId
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
	for (const module of facts.modules) {
		const modulePath = normalizeModulePath(module.path);
		if (modulePath !== module.path || modules.has(modulePath) || module.facts?.protocol !== 1)
			invalidBuildFacts(instance, `invalid or duplicate module ${String(module.path)}`);
		modules.set(modulePath, module);
	}
	let previous = '';
	const exportsSeen = new Set<string>();
	for (const record of facts.exports) {
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
