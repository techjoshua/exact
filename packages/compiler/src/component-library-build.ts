import { componentLibraryProtocolVersion } from './native/contract-versions.js';
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	validatePublishedModuleArtifacts,
	validatePublishedArtifactModuleOwners
} from './compilation/published-artifact-validation.js';
import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts,
	ExactPublishedModuleArtifacts
} from './contracts/transform.js';

/** Declarative package inputs used to produce inert component-library build facts. */
export type ExactComponentLibraryBuildInput = Readonly<{
	package: Readonly<{ name: string; version: string }>;
	modules: readonly Readonly<{
		path: string;
		facts: ExactComponentBuildFacts | Omit<ExactComponentBuildFacts, 'filename' | 'packageName'>;
		artifacts?: ExactPublishedModuleArtifacts;
	}>[];
	exports: ExactPublishedComponentBuildFacts['exports'];
}>;

/** Creates deterministic protocol-1 static facts without adding trust decisions. */
export function createExactPublishedComponentBuildFacts(
	input: ExactComponentLibraryBuildInput
): ExactPublishedComponentBuildFacts {
	if (!input.package.name || !input.package.version)
		throw new Error('Published component build facts require a package name and version');
	const modules = input.modules
		.map((module) => {
			const modulePath = normalizePackagePath(module.path);
			const facts = module.facts as ExactComponentBuildFacts;
			if (facts.protocol !== 1)
				throw new Error(
					`Component build facts for ${modulePath} use an unsupported protocol. Rebuild the library with a compiler version compatible with the consuming application`
				);
			return Object.freeze({
				path: modulePath,
				...(module.artifacts
					? {
							artifacts: Object.freeze({
								...module.artifacts,
								clientModule: normalizePackagePath(module.artifacts.clientModule),
								serverModule: normalizePackagePath(module.artifacts.serverModule)
							})
						}
					: {}),
				facts: Object.freeze({
					protocol: 1 as const,
					components: Object.freeze([...facts.components]),
					componentImports: Object.freeze([...facts.componentImports]),
					rendererEnhancements: Object.freeze([...facts.rendererEnhancements])
				})
			});
		})
		.sort((left, right) => compareCanonicalStrings(left.path, right.path));
	if (new Set(modules.map((module) => module.path)).size !== modules.length)
		throw new Error('Published component build facts contain duplicate module paths');
	for (const module of modules)
		if (module.artifacts)
			validatePublishedModuleArtifacts(
				module.artifacts,
				module.facts.components.map((component) => component.id)
			);
	validatePublishedArtifactModuleOwners(modules);
	const exports = input.exports
		.map((record) =>
			Object.freeze({
				...record,
				module: normalizePackagePath(record.module),
				componentModule: normalizePackagePath(record.componentModule)
			})
		)
		.sort((left, right) =>
			compareCanonicalStrings(
				[left.subpath, left.condition, left.exportName, left.componentId].join('\0'),
				[right.subpath, right.condition, right.exportName, right.componentId].join('\0')
			)
		);
	const exportSelections = new Map<string, string>();
	for (const record of exports) {
		const selection = [record.subpath, record.condition, record.exportName].join('\0');
		const target = [record.module, record.componentModule, record.componentId].join('\0');
		const existing = exportSelections.get(selection);
		if (existing)
			throw new Error(
				existing === target
					? `Published component build facts contain duplicate export ${record.subpath} (${record.condition})#${record.exportName}`
					: `Published component build facts contain conflicting export ${record.subpath} (${record.condition})#${record.exportName}`
			);
		exportSelections.set(selection, target);
	}
	const moduleComponents = new Map(
		modules.map((module) => [
			module.path,
			new Set(module.facts.components.map((component) => component.id))
		])
	);
	for (const record of exports)
		if (!moduleComponents.get(record.componentModule)?.has(record.componentId))
			throw new Error(
				`Published export ${record.subpath}#${record.exportName} has no ${record.componentId} component in ${record.componentModule}`
			);
	return Object.freeze({
		protocol: componentLibraryProtocolVersion,
		package: Object.freeze({ ...input.package }),
		modules: Object.freeze(modules),
		exports: Object.freeze(exports)
	});
}

/**
 * Writes validated component-library metadata beneath `packageRoot`, creating parent directories
 * and replacing an existing file at `outputPath`. Returns the metadata written.
 * This records facts supplied by an earlier compilation. It does not compile source, emit
 * JavaScript or declarations, configure package exports, or grant consumer authorization.
 * Throws for invalid facts, an output path outside the package root, or a symbolic link in
 * the destination path. A linked package root is resolved to its physical directory.
 */
export async function writeExactPublishedComponentBuildFacts(
	packageRoot: string,
	outputPath: string,
	input: ExactComponentLibraryBuildInput
): Promise<ExactPublishedComponentBuildFacts> {
	const root = path.resolve(packageRoot);
	const output = path.resolve(root, outputPath);
	const relative = path.relative(root, output);
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith('..' + path.sep) ||
		path.isAbsolute(relative)
	)
		throw new Error('Component build-facts output must remain inside the package root');
	const facts = createExactPublishedComponentBuildFacts(input);
	await mkdir(root, { recursive: true });
	const physicalRoot = await realpath(root);
	await rejectOutputLinks(physicalRoot, relative);
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(facts, null, 2)}\n`);
	return facts;
}

function normalizePackagePath(value: string): string {
	const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
	if (
		!normalized ||
		normalized.startsWith('/') ||
		/^[a-z]:/i.test(normalized) ||
		normalized.split('/').every(Boolean) === false ||
		normalized.split('/').some((segment) => segment === '.' || segment === '..')
	)
		throw new Error(`Invalid package-relative component module path: ${value}`);
	return normalized;
}

function compareCanonicalStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/** Rejects linked destinations before creating directories or replacing metadata owned by this write. */
async function rejectOutputLinks(root: string, relative: string): Promise<void> {
	let current = root;
	for (const segment of relative.split(path.sep)) {
		current = path.join(current, segment);
		const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT') return undefined;
			throw error;
		});
		if (info?.isSymbolicLink())
			throw new Error(`Component build-facts output must not contain symbolic links: ${current}`);
	}
}
