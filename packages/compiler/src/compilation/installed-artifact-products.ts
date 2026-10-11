import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createExactPublishedComponentBuildFacts } from '../component-library-build.js';
import {
	validatePublishedModuleArtifacts,
	validatePublishedArtifactPath
} from './published-artifact-validation.js';
import type { ExactArtifactGraphInput, ExactArtifactGraph } from '../types.js';
import type { ExactPublishedComponentBuildFacts } from '../contracts/transform.js';

type InstalledProducts = Pick<
	ExactArtifactGraph,
	'clientIslands' | 'serverParts' | 'operations' | 'boundaries'
>;

/** Reads independently built registration products from the reached component closure, without evaluating packages. */
export function installedArtifactProducts(
	results: readonly ExactArtifactGraphInput[],
	rootDir: string
): InstalledProducts {
	const output: InstalledProducts = {
		clientIslands: [],
		serverParts: [],
		operations: [],
		boundaries: []
	};
	const visited = new Set<string>();
	const packages = new Map<string, ExactPublishedComponentBuildFacts | undefined>();
	const requests = new Map<string, string>();
	for (const result of results)
		for (const edge of [
			...result.build.componentBuild.componentImports,
			...result.build.componentBuild.rendererEnhancements
		])
			if (!edge.moduleSpecifier.startsWith('.') && !path.isAbsolute(edge.moduleSpecifier))
				visit(edge.moduleSpecifier, result.inputFile, edge.exportName);
	return output;

	function visit(request: string, importer: string, exportName: string): void {
		let filename: string;
		try {
			filename = createRequire(importer).resolve(request);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') return;
			throw error;
		}
		const owner = packageRoot(filename);
		if (!owner) return;
		if (!request.startsWith('.') && !path.isAbsolute(request))
			requests.set(
				owner,
				request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0]!
			);
		let facts = packages.get(owner);
		if (!packages.has(owner)) {
			facts = readPublishedFacts(owner);
			packages.set(owner, facts);
		}
		if (!facts) return;
		const selected = facts.exports.find(
			(record) =>
				record.exportName === exportName && path.resolve(owner, record.module) === filename
		);
		const modulePath =
			selected?.componentModule ?? path.relative(owner, filename).replaceAll('\\', '/');
		const module = facts.modules.find((entry) => entry.path === modulePath);
		if (!module) return;
		const key = owner + '\0' + modulePath;
		if (visited.has(key)) return;
		visited.add(key);
		if (module.artifacts) {
			validatePublishedModuleArtifacts(
				module.artifacts,
				module.facts.components.map((component: { readonly id: string }) => component.id)
			);
			for (const [target, registrations] of [
				['client', module.artifacts.build.clientRegistrations],
				['server', module.artifacts.build.serverRegistrations]
			] as const) {
				for (const registration of registrations) {
					const targetModule =
						target === 'client' ? module.artifacts.clientModule : module.artifacts.serverModule;
					const exposed = module.artifacts.build.exposureRoots.some(
						(root) =>
							root.componentId === registration.componentId &&
							root.exportName === registration.exportName
					);
					const publicExport = exposed
						? facts.exports.find(
								(record) =>
									record.componentId === registration.componentId &&
									record.componentModule === targetModule
							)
						: undefined;
					const entry = {
						...registration,
						module: publicExport
							? (requests.get(owner) ?? facts.package.name) +
								(publicExport.subpath === '.' ? '' : publicExport.subpath.slice(1))
							: relativeSpecifier(rootDir, path.resolve(owner, targetModule)),
						exportName: publicExport?.exportName ?? registration.exportName
					};
					(target === 'client' ? output.clientIslands : output.serverParts).push(entry);
				}
			}
			output.operations.push(...module.artifacts.build.operations);
			output.boundaries.push(...module.artifacts.build.boundaries);
		}
		for (const edge of [...module.facts.componentImports, ...module.facts.rendererEnhancements])
			visit(edge.moduleSpecifier, path.resolve(owner, modulePath), edge.exportName);
	}
}

/** Establishes a physical package boundary for a resolved artifact. */
function packageRoot(filename: string): string | undefined {
	let directory = path.dirname(filename);
	while (true) {
		if (existsSync(path.join(directory, 'package.json'))) return directory;
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

/** Keeps package data reads inside their declared physical root. This does not grant server authorization. */
function readPublishedFacts(root: string): ExactPublishedComponentBuildFacts | undefined {
	const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
	const declaration = manifest.exactComponentLibrary;
	if (!declaration) return undefined;
	if (declaration.protocol !== 1 || typeof declaration.build !== 'string')
		throw new Error(`Invalid component library metadata in ${root}`);
	const file = path.resolve(root, declaration.build);
	const relative = path.relative(realpathSync(root), realpathSync(file));
	if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
		throw new Error(`Component library metadata escapes ${root}`);
	const facts = JSON.parse(readFileSync(file, 'utf8')) as ExactPublishedComponentBuildFacts;
	if (
		facts.protocol !== 1 ||
		typeof manifest.name !== 'string' ||
		!manifest.name ||
		typeof manifest.version !== 'string' ||
		!manifest.version ||
		facts.package?.name !== manifest.name ||
		facts.package?.version !== manifest.version ||
		!Array.isArray(facts.modules) ||
		!Array.isArray(facts.exports)
	)
		throw new Error(`Invalid component library metadata in ${root}`);
	for (const module of facts.modules) {
		if (!module || typeof module !== 'object')
			throw new Error(`Invalid component library module facts in ${root}`);
		validatePublishedArtifactPath(module.path);
		if (
			module.facts?.protocol !== 1 ||
			!Array.isArray(module.facts.components) ||
			!Array.isArray(module.facts.componentImports) ||
			!Array.isArray(module.facts.rendererEnhancements)
		)
			throw new Error(`Invalid component library module facts in ${root}`);
		for (const component of module.facts.components)
			if (!component || typeof component.id !== 'string' || !component.id)
				throw new Error(`Invalid component library component identity in ${root}`);
		for (const edge of [...module.facts.componentImports, ...module.facts.rendererEnhancements])
			if (
				!edge ||
				typeof edge.moduleSpecifier !== 'string' ||
				!edge.moduleSpecifier ||
				typeof edge.exportName !== 'string' ||
				!edge.exportName
			)
				throw new Error(`Invalid component library import edge in ${root}`);
		if (module.artifacts)
			validatePublishedModuleArtifacts(
				module.artifacts,
				module.facts.components.map((component: { readonly id: string }) => component.id)
			);
	}
	for (const record of facts.exports) {
		if (
			!record ||
			typeof record !== 'object' ||
			typeof record.exportName !== 'string' ||
			!record.exportName ||
			typeof record.condition !== 'string' ||
			!record.condition ||
			typeof record.subpath !== 'string' ||
			!(record.subpath === '.' || record.subpath.startsWith('./'))
		)
			throw new Error(`Invalid component library export selection in ${root}`);
		validatePublishedArtifactPath(record.module);
		validatePublishedArtifactPath(record.componentModule);
	}
	// Apply the same duplicate-selection and component-ownership rules as the publisher.
	createExactPublishedComponentBuildFacts(facts);
	return facts;
}

function relativeSpecifier(root: string, file: string): string {
	const relative = path.relative(root, file).replaceAll('\\', '/');
	return relative.startsWith('.') ? relative : './' + relative;
}
