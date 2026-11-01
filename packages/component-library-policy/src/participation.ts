import { validatePublishedComponentProjection } from './published-projection-validation.js';
import { validatePublishedRelativeSelections } from './selection-evidence.js';
import { selectInternalComponent } from './internal-component-selection.js';
import { componentLibraryProtocolVersion } from './protocol-version.js';
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
		markerManifest.exactComponentLibraryProtocol !== componentLibraryProtocolVersion
	) {
		throw new ExactComponentParticipationError(
			'marker-incompatible',
			`${instance.name} resolved an incompatible @exactjs/component-library marker`
		);
	}
	const declaration = manifest.exactComponentLibrary;
	if (
		!declaration ||
		declaration.protocol !== componentLibraryProtocolVersion ||
		typeof declaration.build !== 'string'
	) {
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
	const selected = buildFacts.exports.find(
		(record) =>
			normalizeModulePath(record.module) === resolvedModule &&
			record.exportName === candidate.exportName
	);
	const internal = selected
		? undefined
		: selectInternalComponent(instance, candidate, buildFacts, resolvedModule);
	const componentId = selected?.componentId ?? internal?.componentId;
	const componentModule = selected?.componentModule ?? internal?.module.path;
	const resolvedModuleFacts = selected
		? buildFacts.modules.find(
				(module) =>
					normalizeModulePath(module.path) === normalizeModulePath(selected.componentModule)
			)
		: internal?.module;
	if (!componentId || !componentModule || !resolvedModuleFacts) {
		throw new ExactComponentParticipationError(
			'build-facts-invalid',
			`${instance.name} build facts do not map ${resolvedModule}#${candidate.exportName}`
		);
	}
	const component = resolvedModuleFacts.facts.components.find((entry) => entry.id === componentId)!;
	if (
		selected &&
		((selected.target !== undefined && selected.target !== 'server') ||
			((component.placement === 'unknown' || !component.artifactTargets.length) &&
				selected.target !== 'server'))
	)
		throw new ExactComponentParticipationError(
			'build-facts-invalid',
			`${instance.name} selected component has no inspected server artifact`
		);
	return Object.freeze({
		markerVersion,
		buildFactsPath,
		buildFacts,
		componentId,
		componentBuild: Object.freeze({
			...resolvedModuleFacts.facts,
			filename: path.resolve(instance.root, componentModule),
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
		facts.protocol !== componentLibraryProtocolVersion ||
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
		validatePublishedComponentProjection(rawModule.facts, modulePath, (message) =>
			invalidBuildFacts(instance, message)
		);
		modules.set(modulePath, rawModule as ExactPublishedComponentBuildFacts['modules'][number]);
	}
	validatePublishedRelativeSelections(modules, normalizeModulePath, (message) =>
		invalidBuildFacts(instance, message)
	);
	const publicSelections = new Map<string, string>();
	let previous = '';
	const exportsSeen = new Set<string>();
	for (const rawRecord of facts.exports as readonly unknown[]) {
		if (!isRecord(rawRecord)) invalidBuildFacts(instance, 'export record is not an object');
		if (
			!nonemptyString(rawRecord.subpath) ||
			!nonemptyString(rawRecord.condition) ||
			!nonemptyString(rawRecord.module) ||
			!nonemptyString(rawRecord.componentModule) ||
			!nonemptyString(rawRecord.exportName) ||
			!nonemptyString(rawRecord.componentId) ||
			normalizeModulePath(rawRecord.module) !== rawRecord.module ||
			normalizeModulePath(rawRecord.componentModule) !== rawRecord.componentModule
		)
			invalidBuildFacts(instance, 'export record contains invalid fields');
		const record = rawRecord as ExactPublishedComponentBuildFacts['exports'][number];
		if (record.target !== undefined && record.target !== 'client' && record.target !== 'server')
			invalidBuildFacts(instance, 'invalid inspected export target');
		if (record.target !== undefined) {
			const selection = [record.module, record.exportName].join('\0');
			const destination = [record.target, record.componentModule, record.componentId].join('\0');
			if (publicSelections.has(selection) && publicSelections.get(selection) !== destination)
				invalidBuildFacts(instance, 'conflicting inspected public component selections');
			publicSelections.set(selection, destination);
		}
		const key = [record.subpath, record.condition, record.exportName, record.componentId].join(
			'\0'
		);
		if (key < previous)
			invalidBuildFacts(instance, 'export records are not deterministically sorted');
		previous = key;
		const unique = [record.subpath, record.condition, record.module, record.exportName].join('\0');
		if (exportsSeen.has(unique)) invalidBuildFacts(instance, 'duplicate export mapping');
		exportsSeen.add(unique);
		const module = modules.get(normalizeModulePath(record.componentModule));
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
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	)
		throw new ExactComponentParticipationError(
			'build-facts-invalid',
			`Component-library ${label} escapes the package root`
		);
	return resolved;
}

function packageModulePath(root: string, moduleId: string): string {
	const clean = moduleId.replace(/[?#].*$/, '');
	const relative = path.relative(path.resolve(root), path.resolve(clean));
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	)
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
