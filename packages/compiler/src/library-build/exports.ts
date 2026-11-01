import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts,
	ExactPublishedModuleArtifacts,
	ExactPublishedComponentBuildProjection
} from '../contracts/transform.js';
import type { LibraryManifest } from './manifest.js';
import { writeExactPublishedComponentBuildFacts } from '../component-library-build.js';
import { inspectLibrarySelections } from './export-inspection.js';
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
	const publishedModules = new Map<
		string,
		ExactComponentBuildFacts & ExactPublishedComponentBuildProjection
	>(componentBuildModules);
	const componentBuildExports: ExactPublishedComponentBuildFacts['exports'][number][] = [];
	async function verifyTargets(scope?: LibraryInspectionResolution) {
		for (const target of ['client', 'server'] as const)
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
		target: 'client' | 'server',
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
		const relative = [...publishedModules].flatMap(([modulePath, facts]) =>
			modulePath.startsWith(`dist/${targetDirectory}/`)
				? facts.componentImports.flatMap((edge, index) =>
						edge.moduleSpecifier.startsWith('.') &&
						(!edge.artifactTargets.length || edge.artifactTargets.includes(target))
							? [{ modulePath, edge, index }]
							: []
					)
				: []
		);
		const inspected = await inspectLibrarySelections(
			selections,
			target,
			scope,
			relative.map(({ modulePath, edge }) => ({
				parent: pathToFileURL(
					stagedOutput
						? path.join(stagedOutput, path.relative('dist', modulePath))
						: path.resolve(packageRoot, modulePath)
				).href,
				specifier: edge.moduleSpecifier,
				name: edge.exportName
			}))
		);
		for (const [index, selection] of relative.entries()) {
			const actual = inspected.relatives[index]!;
			const filename = fileURLToPath(actual.url);
			const modulePath = stagedOutput
				? `dist/${path.relative(stagedOutput, filename).replaceAll('\\', '/')}`
				: packageModulePath(filename);
			const canonicalOwner = componentModuleFor(
				actual.identity,
				targetDirectory,
				selection.edge.moduleSpecifier,
				selection.edge.exportName
			);
			if (
				modulePath !== canonicalOwner ||
				(selection.edge.canonicalComponentId &&
					selection.edge.canonicalComponentId !== actual.identity)
			)
				throw new Error('Inspected relative component does not match its direct canonical owner');
			const facts = publishedModules.get(selection.modulePath)!;
			publishedModules.set(selection.modulePath, {
				...facts,
				componentImports: facts.componentImports.map((edge, edgeIndex) =>
					edgeIndex === selection.index
						? {
								...edge,
								canonicalComponentId: actual.identity,
								executable: { target, module: modulePath }
							}
						: edge
				)
			});
		}
		const namespaces = inspected.exports;
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
						componentId: identity,
						target
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
			modules: [...publishedModules]
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
