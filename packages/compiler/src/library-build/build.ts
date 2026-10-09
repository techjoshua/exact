import { cp, readFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
	ExactComponentBuildFacts,
	ExactPublishedModuleArtifacts
} from '../contracts/transform.js';
import { libraryArtifactProducts } from './artifacts.js';
import { compileProject } from '../compilation/file-compilation.js';
import { publishLibraryFacts } from './exports.js';
import { readLibraryManifest } from './manifest.js';
import { withLibraryOutput } from './output.js';
import { emitLibraryDeclarations } from './declarations.js';
import { transform } from 'esbuild';
import { libraryProjectSources } from './sources.js';
import { withOwnedNativeCompilationSession } from '../compilation/native-session.js';
import { loadExactPackageEnhancements } from '@exactjs/config/node';

/** Options for a library rooted at a package containing src/ and package.json. */
export interface LibraryBuildOptions {
	/** Package directory; defaults to the current working directory. */
	root?: string;
	/** TypeScript configuration, relative to the package; defaults to tsconfig.json. */
	project?: string;
	/** Set false only when the caller has already emitted TypeScript output into dist/. */
	declarations?: boolean;
}

/**
 * Builds unbundled client/server library artifacts and static component metadata.
 * Owns declaration emission. Export validation executes the author's
 * emitted modules. Restores the previous dist tree on failure; concurrent builds of one
 * package are rejected. Dependencies and package exports remain author-owned.
 */
export async function buildLibrary(options: LibraryBuildOptions = {}): Promise<void> {
	const packageRoot = path.resolve(options.root ?? process.cwd());
	const sourceRoot = path.join(packageRoot, 'src');
	const publishedOutputRoot = path.join(packageRoot, 'dist');
	const manifest = await readLibraryManifest(packageRoot);
	const packageEnhancements = loadExactPackageEnhancements({
		applicationRoot: packageRoot
	}).packageEnhancements;
	const publishedBuildFactsPath = manifest.exactComponentLibrary?.build
		? path.resolve(packageRoot, manifest.exactComponentLibrary.build)
		: undefined;
	const excludesFixtureArtifacts = (manifest.files ?? []).some(
		(entry) => entry.startsWith('!') && entry.includes('.fixtures.')
	);
	// Validate the publication closure even when lowering only declared modules.
	const projectInputs = libraryProjectSources(
		packageRoot,
		options.project ?? 'tsconfig.json',
		excludesFixtureArtifacts
	);
	const inputs = manifest.exactCompileModules
		? declaredCompileModules(manifest.exactCompileModules)
		: projectInputs;
	for (const input of inputs)
		if (/\.c[jt]s$/i.test(input))
			throw new Error(`Library build does not support CommonJS source module ${input}`);
	await withLibraryOutput(
		packageRoot,
		options.declarations === false,
		(outputRoot) =>
			withOwnedNativeCompilationSession(async (session) => {
				if (options.declarations !== false)
					await emitLibraryDeclarations(
						packageRoot,
						options.project,
						excludesFixtureArtifacts,
						['client', 'server'].map(declaredTargetDirectory),
						Boolean(manifest.exactCompileModules),
						outputRoot,
						session
					);
				const stageRoot = await mkdtemp(path.join(tmpdir(), 'exact-package-'));
				const emittedRuntimeDependencies = new Map<string, Set<string>>();
				const componentBuildModules = new Map<string, ExactComponentBuildFacts>();
				const artifactModules = new Map<string, ExactPublishedModuleArtifacts>();

				try {
					for (const target of ['client', 'server'] as const) {
						const targetDirectory = declaredTargetDirectory(target);
						await prepareTargetTree(targetDirectory);
						const generatedRoot = path.join(stageRoot, target);
						const results = await compileProject(inputs, {
							session,
							packageEnhancements,
							outDir: generatedRoot,
							rootDir: sourceRoot,
							root: packageRoot,
							configFile: path.resolve(packageRoot, options.project ?? 'tsconfig.json'),
							packageName: manifest.name,
							target,
							includeAllModules: true,
							generatedValidation: 'semantic'
						});
						for (const result of results) {
							for (const specifier of result.runtimeDependencies) {
								const dependency = packageNameForSpecifier(specifier);
								if (!dependency || dependency === manifest.name) continue;
								const targets = emittedRuntimeDependencies.get(dependency) ?? new Set();
								targets.add(target);
								emittedRuntimeDependencies.set(dependency, targets);
							}
							if (!result.outputFile) continue;
							const relative = path.relative(generatedRoot, result.outputFile);
							const outputFile = path
								.join(outputRoot, targetDirectory, relative)
								.replace(/\.[^.]+$/i, /\.m[jt]s$/i.test(result.inputFile) ? '.mjs' : '.js');
							componentBuildModules.set(
								path.join('dist', path.relative(outputRoot, outputFile)).replaceAll('\\', '/'),
								result.componentBuild
							);
							const generated = await readFile(result.outputFile, 'utf8');
							if (target === 'client' && result.componentBuild.components.length) {
								const pairedModule = (selected: 'client' | 'server') =>
									path
										.join('dist', declaredTargetDirectory(selected), relative)
										.replace(/\.[^.]+$/i, /\.m[jt]s$/i.test(result.inputFile) ? '.mjs' : '.js')
										.replaceAll('\\', '/');
								const products = libraryArtifactProducts(
									await readFile(result.inputFile, 'utf8'),
									result.inputFile,
									packageRoot,
									options.project ?? 'tsconfig.json',
									pairedModule('client'),
									pairedModule('server'),
									{ session, packageEnhancements }
								);
								if (products)
									for (const selected of ['client', 'server'] as const)
										artifactModules.set(pairedModule(selected), products);
							}
							const emitted = await transform(generated, {
								format: 'esm',
								loader: result.outputFile.endsWith('x') ? 'tsx' : 'ts',
								sourcemap: false,
								target: 'es2022'
							});
							await mkdir(path.dirname(outputFile), { recursive: true });
							await writeFile(outputFile, emitted.code);
							// A pre-emitted TypeScript map describes the replaced code, not the lowered module.
							await rm(`${outputFile}.map`, { force: true });
						}
						await copyGeneratedEnhancementFacades(
							generatedRoot,
							path.join(outputRoot, targetDirectory)
						);
					}
					validateRuntimeDependencies();
					await publishLibraryFacts(
						packageRoot,
						manifest,
						componentBuildModules,
						outputRoot,
						artifactModules
					);
				} finally {
					await rm(stageRoot, { recursive: true, force: true });
				}

				async function copyGeneratedEnhancementFacades(generatedRoot: string, targetRoot: string) {
					const source = path.join(generatedRoot, '.exact');
					try {
						await cp(source, path.join(targetRoot, '.exact'), { recursive: true, force: true });
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
					}
				}

				function packageNameForSpecifier(specifier: string) {
					if (specifier.startsWith('node:') || specifier.startsWith('#')) return undefined;
					if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
					return specifier.split('/')[0];
				}

				function validateRuntimeDependencies() {
					const declared = new Set([
						...Object.keys(manifest.dependencies ?? {}),
						...Object.keys(manifest.peerDependencies ?? {}),
						...Object.keys(manifest.optionalDependencies ?? {})
					]);
					const missing = [...emittedRuntimeDependencies]
						.filter(([dependency]) => !declared.has(dependency))
						.map(([dependency, targets]) => `${dependency} (${[...targets].sort().join(', ')})`)
						.sort();
					if (missing.length) {
						throw new Error(
							`${manifest.name} must declare dependencies imported by compiled artifacts: ${missing.join(', ')}`
						);
					}
				}

				/** Copies pre-emitted support modules and declarations into an independent target tree. */
				async function prepareTargetTree(targetDirectory: string) {
					const targetRoot = path.join(outputRoot, targetDirectory);
					await rm(targetRoot, { recursive: true, force: true });
					await mkdir(targetRoot, { recursive: true });
					for (const entry of await readdir(outputRoot, { withFileTypes: true })) {
						if (['client', 'server'].map(declaredTargetDirectory).includes(entry.name)) continue;
						if (
							entry.isDirectory() &&
							(await declarationOnlyTree(path.join(outputRoot, entry.name)))
						)
							continue;
						await cp(path.join(outputRoot, entry.name), path.join(targetRoot, entry.name), {
							recursive: entry.isDirectory(),
							force: true,
							filter: (source) =>
								path.resolve(publishedOutputRoot, path.relative(outputRoot, source)) !==
									publishedBuildFactsPath && !isUnpublishedSupportArtifact(source)
						});
					}
					await rebaseSourceMaps(targetRoot);
				}

				/** Preserves source locations after moving the TypeScript output one directory deeper. */
				async function rebaseSourceMaps(directory: string) {
					for (const entry of await readdir(directory, { withFileTypes: true })) {
						const filename = path.join(directory, entry.name);
						if (entry.isDirectory()) {
							await rebaseSourceMaps(filename);
						} else if (entry.name.endsWith('.map')) {
							const map = JSON.parse(await readFile(filename, 'utf8'));
							if (Array.isArray(map.sources))
								map.sources = map.sources.map((source: unknown) =>
									typeof source === 'string' && !/^(?:[a-z]+:|\/)/i.test(source)
										? `../${source}`
										: source
								);
							await writeFile(filename, JSON.stringify(map));
						}
					}
				}

				function isUnpublishedSupportArtifact(filename: string) {
					const basename = path.basename(filename);
					return (
						/(?:^|\.)(?:test|spec|jest)\.[^/\\]+$/i.test(basename) ||
						(excludesFixtureArtifacts && /(?:^|\.)fixtures?\.[^/\\]+$/i.test(basename))
					);
				}
			}),
		manifest.exactComponentLibrary
			? [
					path.relative(
						path.join(packageRoot, 'dist'),
						path.resolve(packageRoot, manifest.exactComponentLibrary.build)
					)
				]
			: []
	);
	function declaredCompileModules(declaration: string[]) {
		if (!Array.isArray(declaration) || !declaration.length)
			throw new TypeError('exactCompileModules must be a non-empty array');
		return declaration.map((relative) => {
			if (typeof relative !== 'string' || !/\.[cm]?[jt]sx?$/i.test(relative))
				throw new TypeError('exactCompileModules entries must be source module paths');
			const filename = path.resolve(packageRoot, relative);
			const withinSource = path.relative(sourceRoot, filename);
			if (
				withinSource === '..' ||
				withinSource.startsWith('..' + path.sep) ||
				path.isAbsolute(withinSource)
			)
				throw new Error(`exactCompileModules entry escapes the package source root: ${relative}`);
			return filename;
		});
	}

	function declaredTargetDirectory(target: string) {
		const directory = manifest.exactTargetDirectories?.[target] ?? target;
		if (typeof directory !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(directory))
			throw new TypeError(`Invalid ${target} exactTargetDirectories entry`);
		return directory;
	}
}

/** Dedicated declaration-only trees stay shared instead of being duplicated in executable targets. */
async function declarationOnlyTree(directory: string): Promise<boolean> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!(await declarationOnlyTree(path.join(directory, entry.name)))) return false;
		} else if (!/\.d\.[cm]?ts(?:\.map)?$/i.test(entry.name)) return false;
	}
	return true;
}
