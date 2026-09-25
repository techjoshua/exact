import { cp, readFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ExactComponentBuildFacts } from '../contracts/transform.js';
import { compileProject } from '../compilation/file-compilation.js';
import { publishLibraryFacts } from './exports.js';
import { readLibraryManifest } from './manifest.js';
import { withLibraryOutput } from './output.js';
import { emitLibraryDeclarations } from './declarations.js';
import { transform } from 'esbuild';
import { isProductionSourceDirectory, isProductionSourceFile } from './sources.js';

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
	const outputRoot = path.join(packageRoot, 'dist');
	const manifest = await readLibraryManifest(packageRoot);
	const publishedBuildFactsPath = manifest.exactComponentLibrary?.build
		? path.resolve(packageRoot, manifest.exactComponentLibrary.build)
		: undefined;
	const excludesFixtureArtifacts = (manifest.files ?? []).some(
		(entry) => entry.startsWith('!') && entry.includes('.fixtures.')
	);
	const inputs = manifest.exactCompileModules
		? declaredCompileModules(manifest.exactCompileModules)
		: await productionSources(sourceRoot);
	await withLibraryOutput(packageRoot, options.declarations === false, async () => {
		if (options.declarations !== false)
			await emitLibraryDeclarations(
				packageRoot,
				options.project,
				excludesFixtureArtifacts,
				['client', 'server'].map(declaredTargetDirectory)
			);
		const stageRoot = await mkdtemp(path.join(tmpdir(), 'exact-package-'));
		const emittedRuntimeDependencies = new Map<string, Set<string>>();
		const componentBuildModules = new Map<string, ExactComponentBuildFacts>();

		try {
			for (const target of ['client', 'server'] as const) {
				const targetDirectory = declaredTargetDirectory(target);
				await prepareTargetTree(targetDirectory);
				const generatedRoot = path.join(stageRoot, target);
				const results = await compileProject(inputs, {
					outDir: generatedRoot,
					rootDir: sourceRoot,
					root: packageRoot,
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
						.replace(/\.[cm]?tsx?$/i, '.js');
					componentBuildModules.set(
						path.relative(packageRoot, outputFile).replaceAll('\\', '/'),
						result.componentBuild
					);
					const generated = await readFile(result.outputFile, 'utf8');
					const emitted = await transform(generated, {
						format: 'esm',
						loader: result.outputFile.endsWith('x') ? 'tsx' : 'ts',
						sourcemap: false,
						target: 'es2022'
					});
					await mkdir(path.dirname(outputFile), { recursive: true });
					await writeFile(outputFile, emitted.code);
				}
				await copyGeneratedEnhancementFacades(
					generatedRoot,
					path.join(outputRoot, targetDirectory)
				);
				validateRuntimeDependencies();
			}
			await publishLibraryFacts(packageRoot, manifest, componentBuildModules);
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
				await cp(path.join(outputRoot, entry.name), path.join(targetRoot, entry.name), {
					recursive: entry.isDirectory(),
					force: true,
					filter: (source) =>
						path.resolve(source) !== publishedBuildFactsPath &&
						!isUnpublishedSupportArtifact(source)
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
				/(?:^|\.)test\.[^/\\]+$/i.test(basename) ||
				(excludesFixtureArtifacts && /(?:^|\.)fixtures?\.[^/\\]+$/i.test(basename))
			);
		}
	});
	function declaredCompileModules(declaration: string[]) {
		if (!Array.isArray(declaration) || !declaration.length)
			throw new TypeError('exactCompileModules must be a non-empty array');
		return declaration.map((relative) => {
			if (typeof relative !== 'string' || !/\.[cm]?[jt]sx?$/i.test(relative))
				throw new TypeError('exactCompileModules entries must be source module paths');
			const filename = path.resolve(packageRoot, relative);
			const withinSource = path.relative(sourceRoot, filename);
			if (withinSource.startsWith('..') || path.isAbsolute(withinSource))
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

	async function productionSources(directory: string): Promise<string[]> {
		const sources: string[] = [];
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const filename = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				if (!isProductionSourceDirectory(entry.name)) continue;
				sources.push(...(await productionSources(filename)));
			} else if (isProductionSourceFile(entry.name, excludesFixtureArtifacts)) {
				sources.push(filename);
			}
		}
		return sources.sort();
	}
}
