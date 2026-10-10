import path from 'node:path';
import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts,
	ExactPublishedModuleArtifacts
} from '../contracts/transform.js';
import type { LibraryManifest } from './manifest.js';
import { writeExactPublishedComponentBuildFacts } from '../component-library-build.js';
import { inspectLibraryExports } from './export-inspection.js';
import {
	type LibraryInspectionResolution,
	withLibraryInspectionResolution
} from './inspection-resolution.js';

/** Validates freshly emitted paired exports, then publishes their deterministic compiler facts. */
export async function publishLibraryFacts(
	packageRoot: string,
	manifest: LibraryManifest,
	componentBuildModules: ReadonlyMap<string, ExactComponentBuildFacts>,
	stagedOutput?: string,
	artifactModules: ReadonlyMap<string, ExactPublishedModuleArtifacts> = new Map()
): Promise<void> {
	const componentBuildExports: ExactPublishedComponentBuildFacts['exports'][number][] = [];
	async function verifyTargets(scope?: LibraryInspectionResolution) {
		for (const target of ['client', 'server'])
			await verifyCompiledExports(
				target,
				manifest.exactTargetDirectories?.[target] ?? target,
				scope
			);
	}
	if (stagedOutput) await withLibraryInspectionResolution(packageRoot, stagedOutput, verifyTargets);
	else await verifyTargets();
	await writeComponentLibraryBuildFacts();
	async function verifyCompiledExports(
		target: string,
		targetDirectory: string,
		scope?: LibraryInspectionResolution
	) {
		const expected = normalizedCompiledComponents();
		const selections: {
			subpath: string;
			names: string[];
			condition: string;
			modulePath: string;
			entry: string;
		}[] = [];
		for (const [subpath, names] of Object.entries(expected)) {
			if (!names.length) continue;
			const candidates = compiledExportTargets(subpath, targetDirectory);
			if (!candidates.length)
				throw new Error(
					`${manifest.name} has no ${target} artifact export for ${subpath}. Add an export condition pointing into dist/${targetDirectory}/ for this subpath`
				);
			for (const candidate of candidates) {
				const entry = path.resolve(packageRoot, candidate.path);
				const relative = path.relative(path.join(packageRoot, 'dist', targetDirectory), entry);
				if (
					!relative ||
					relative === '..' ||
					relative.startsWith('..' + path.sep) ||
					path.isAbsolute(relative)
				)
					throw new Error(`Library export escapes its target directory: ${candidate.path}`);
				selections.push({
					subpath,
					names,
					condition: candidate.condition,
					modulePath: packageModulePath(entry),
					entry: stagedOutput
						? path.join(stagedOutput, path.relative(path.join(packageRoot, 'dist'), entry))
						: entry
				});
			}
		}
		const namespaces = await inspectLibraryExports(selections, target, scope);
		for (const [index, selection] of selections.entries()) {
			const { subpath, names, condition, modulePath } = selection;
			const namespace = namespaces[index]!;
			for (const name of names) {
				const identity = namespace[name]!;
				const componentModule = componentModuleFor(identity, targetDirectory, subpath, name);
				if (manifest.exactComponentLibrary)
					componentBuildExports.push({
						subpath,
						condition,
						module: modulePath,
						componentModule,
						exportName: name,
						componentId: identity
					});
			}
		}
	}

	function componentModuleFor(
		identity: string,
		targetDirectory: string,
		subpath: string,
		exportName: string
	) {
		const prefix = `dist/${targetDirectory}/`;
		const candidates = [...componentBuildModules]
			.filter(
				([modulePath, facts]) =>
					modulePath.startsWith(prefix) &&
					facts.components.some((component) => component.id === identity)
			)
			.map(([modulePath]) => modulePath);
		if (candidates.length !== 1)
			throw new Error(
				`${manifest.name} ${subpath}:${exportName} must have exactly one target-local compiler owner; found ${candidates.length}`
			);
		return candidates[0]!;
	}

	async function writeComponentLibraryBuildFacts() {
		const declaration = manifest.exactComponentLibrary;
		if (!declaration) return;
		if (declaration.protocol !== 1 || typeof declaration.build !== 'string')
			throw new Error(
				`${manifest.name} must declare exactComponentLibrary with protocol: 1 and a package-relative build facts path in build`
			);
		if (!manifest.exactCompiledComponents)
			throw new Error(
				`${manifest.name} component libraries must declare exactCompiledComponents with the component export names for each public subpath`
			);
		const relativeFacts = path.relative(
			path.join(packageRoot, 'dist'),
			path.resolve(packageRoot, declaration.build)
		);
		const destination =
			stagedOutput &&
			relativeFacts !== '..' &&
			!relativeFacts.startsWith('..' + path.sep) &&
			!path.isAbsolute(relativeFacts)
				? path.join(stagedOutput, relativeFacts)
				: declaration.build;
		await writeExactPublishedComponentBuildFacts(packageRoot, destination, {
			package: { name: manifest.name, version: manifest.version },
			modules: [...componentBuildModules]
				.filter(
					([, facts]) =>
						facts.components.length ||
						facts.componentImports.length ||
						facts.rendererEnhancements.length
				)
				.map(([modulePath, facts]) => ({
					path: modulePath,
					facts,
					...(artifactModules.has(modulePath)
						? { artifacts: artifactModules.get(modulePath)! }
						: {})
				})),
			exports: componentBuildExports
		});
	}

	function compiledExportTargets(subpath: string, targetDirectory: string) {
		const declaration = normalizeExports(manifest.exports)[subpath];
		const prefix = `dist/${targetDirectory}/`;
		return exportTargets(declaration).filter((candidate) => {
			const modulePath = normalizePath(candidate.path);
			return modulePath.startsWith(prefix) && /\.m?js$/.test(modulePath);
		});
	}

	function normalizedCompiledComponents(): Record<string, string[]> {
		const declaration = manifest.exactCompiledComponents ?? [];
		if (Array.isArray(declaration)) return { '.': declaration };
		if (
			declaration &&
			typeof declaration === 'object' &&
			Object.values(declaration).every(Array.isArray)
		)
			return declaration;
		throw new TypeError('exactCompiledComponents must be an array or subpath-to-array map');
	}

	function normalizeExports(value: LibraryManifest['exports']): Record<string, unknown> {
		if (typeof value === 'string' || Array.isArray(value) || !value) return { '.': value };
		return Object.keys(value as object).some((key) => key.startsWith('.'))
			? (value as Record<string, unknown>)
			: { '.': value };
	}

	function exportTargets(
		value: unknown,
		inheritedCondition = 'default'
	): { path: string; condition: string }[] {
		if (typeof value === 'string') return [{ condition: inheritedCondition, path: value }];
		if (Array.isArray(value))
			return value.flatMap((entry) => exportTargets(entry, inheritedCondition));
		if (!value || typeof value !== 'object') return [];
		return Object.entries(value).flatMap(([condition, entry]) => exportTargets(entry, condition));
	}

	function packageModulePath(filename: string) {
		return normalizePath(path.relative(packageRoot, filename));
	}

	function normalizePath(value: string) {
		return value.replaceAll('\\', '/').replace(/^\.\//, '');
	}
}
