import path from 'node:path';
import type {
	ExactPublishedModuleArtifacts,
	ExactPublishedComponentBuildFacts
} from '../contracts/transform.js';

/** Rejects foreign owner identities and path escapes before generating executable module imports. */
export function validatePublishedModuleArtifacts(
	artifacts: ExactPublishedModuleArtifacts,
	componentIds: readonly string[]
): void {
	for (const file of [artifacts.clientModule, artifacts.serverModule])
		validatePublishedArtifactPath(file);
	const build = artifacts.build;
	for (const entries of [
		build?.clientRegistrations,
		build?.serverRegistrations,
		build?.operations,
		build?.boundaries,
		build?.exposureRoots
	])
		if (!Array.isArray(entries))
			throw new Error('Invalid published artifact registration products');
	for (const entry of [...build.clientRegistrations, ...build.serverRegistrations])
		if (
			!entry ||
			typeof entry.id !== 'string' ||
			!entry.id ||
			typeof entry.name !== 'string' ||
			!entry.name ||
			typeof entry.exportName !== 'string' ||
			!entry.exportName ||
			typeof entry.componentId !== 'string' ||
			!entry.componentId ||
			!componentIds.includes(entry.componentId)
		)
			throw new Error('Invalid published artifact registration owner');
	for (const entry of [...build.operations, ...build.exposureRoots])
		if (!entry || !componentIds.includes(entry.componentId))
			throw new Error('Invalid published artifact operation owner');
	for (const entry of build.boundaries) {
		if (!entry || typeof entry !== 'object')
			throw new Error('Invalid published artifact boundary owner');
		const owner = entry.ownerComponentId ?? entry.componentId;
		if (owner && !componentIds.includes(owner))
			throw new Error('Invalid published artifact boundary owner');
	}
}

/** Package paths must remain relative on both POSIX and Windows, regardless of the build host. */
export function validatePublishedArtifactPath(file: unknown): asserts file is string {
	if (
		typeof file !== 'string' ||
		!file ||
		path.isAbsolute(file) ||
		/^[a-z]:/i.test(file) ||
		file
			.replaceAll('\\', '/')
			.split('/')
			.some((segment) => !segment || segment === '.' || segment === '..')
	)
		throw new Error('Invalid published artifact module path');
}

/** Confirms each generated target module owns the implementations it will be asked to provide. */
export function validatePublishedArtifactModuleOwners(
	modules: ExactPublishedComponentBuildFacts['modules']
): void {
	const moduleOwners = new Map(
		modules.map((module) => [
			module.path,
			new Set(module.facts.components.map((component) => component.id))
		])
	);
	for (const module of modules) {
		const artifacts = module.artifacts;
		if (!artifacts) continue;
		for (const [filename, registrations] of [
			[artifacts.clientModule, artifacts.build.clientRegistrations],
			[artifacts.serverModule, artifacts.build.serverRegistrations]
		] as const) {
			const owners = moduleOwners.get(filename);
			if (!owners || registrations.some((entry) => !owners.has(entry.componentId!)))
				throw new Error('Invalid published paired artifact module owner');
		}
	}
}

/**
 * Checks published selection evidence against its canonical module owners.
 * This validates inert producer records. Only the normal publisher inspects executable namespaces.
 */
export function validatePublishedSelectionEvidence(
	modules: ExactPublishedComponentBuildFacts['modules'],
	exports: ExactPublishedComponentBuildFacts['exports']
): void {
	const owners = new Map(modules.map((module) => [module.path, module.facts.components]));
	const publicSelections = new Map<string, string>();
	for (const record of exports) {
		if (record.target === undefined) continue;
		if (record.target !== 'client' && record.target !== 'server')
			throw new Error('Invalid inspected public component target');
		const key = [record.module, record.exportName].join('\0');
		const destination = [record.target, record.componentModule, record.componentId].join('\0');
		if (publicSelections.has(key) && publicSelections.get(key) !== destination)
			throw new Error('Conflicting inspected public component selections');
		publicSelections.set(key, destination);
	}
	for (const module of modules) {
		const selections = new Map<string, string>();
		for (const edge of module.facts.componentImports) {
			if (edge.executable === undefined) continue;
			const selected = edge.executable;
			if (
				!selected ||
				(selected.target !== 'client' && selected.target !== 'server') ||
				!edge.moduleSpecifier.startsWith('.') ||
				!edge.canonicalComponentId
			)
				throw new Error('Invalid inspected relative component selection');
			validatePublishedArtifactPath(selected.module);
			if (!owners.get(selected.module)?.some((owner) => owner.id === edge.canonicalComponentId))
				throw new Error('Inspected relative component selection has no direct module owner');
			const key = [edge.ownerComponentId, edge.moduleSpecifier, edge.exportName].join('\0');
			const destination = [selected.target, selected.module, edge.canonicalComponentId].join('\0');
			if (selections.has(key) && selections.get(key) !== destination)
				throw new Error('Conflicting inspected relative component selections');
			selections.set(key, destination);
		}
	}
}
