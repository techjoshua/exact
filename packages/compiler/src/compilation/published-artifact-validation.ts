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
