import { cp, readFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import {
	isProductionSourceDirectory,
	isProductionSourceFile
} from './package-source-selection.mjs';

const packageRoot = path.resolve(process.argv[2] ?? process.cwd());
const sourceRoot = path.join(packageRoot, 'src');
const outputRoot = path.join(packageRoot, 'dist');
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const publishedBuildFactsPath = manifest.exactComponentLibrary?.build
	? path.resolve(packageRoot, manifest.exactComponentLibrary.build)
	: undefined;
const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const compilerModule = path.join(repositoryRoot, 'packages/compiler/dist/index.js');
const { compileProject } = await import(pathToFileURL(compilerModule).href);
const componentLibraryBuildModule = path.join(
	repositoryRoot,
	'packages/compiler/dist/component-library-build.js'
);
const stageRoot = await mkdtemp(path.join(tmpdir(), 'exact-package-'));
const emittedRuntimeDependencies = new Map();
const componentBuildModules = new Map();
const componentBuildExports = [];
const excludesFixtureArtifacts = (manifest.files ?? []).some(
	(entry) => typeof entry === 'string' && entry.startsWith('!') && entry.includes('.fixtures.')
);
const inputs = manifest.exactCompileModules
	? declaredCompileModules(manifest.exactCompileModules)
	: await productionSources(sourceRoot);

try {
	for (const target of ['client', 'server']) {
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
			componentBuildModules.set(packageModulePath(outputFile), result.componentBuild);
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
		validateRuntimeDependencies();
		await verifyCompiledExports(target, targetDirectory);
	}
	await writeComponentLibraryBuildFacts();
} finally {
	await rm(stageRoot, { recursive: true, force: true });
}

function packageNameForSpecifier(specifier) {
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

function declaredCompileModules(declaration) {
	if (!Array.isArray(declaration) || !declaration.length)
		throw new TypeError('exactCompileModules must be a non-empty array');
	return declaration.map((relative) => {
		if (typeof relative !== 'string' || !/\.[cm]?[jt]sx?$/i.test(relative))
			throw new TypeError('exactCompileModules entries must be source module paths');
		const filename = path.resolve(packageRoot, relative);
		if (path.relative(sourceRoot, filename).startsWith('..'))
			throw new Error(`exactCompileModules entry escapes the package source root: ${relative}`);
		return filename;
	});
}

function declaredTargetDirectory(target) {
	const directory = manifest.exactTargetDirectories?.[target] ?? target;
	if (typeof directory !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(directory))
		throw new TypeError(`Invalid ${target} exactTargetDirectories entry`);
	return directory;
}

async function prepareTargetTree(targetDirectory) {
	const targetRoot = path.join(outputRoot, targetDirectory);
	await rm(targetRoot, { recursive: true, force: true });
	await mkdir(targetRoot, { recursive: true });
	for (const entry of await readdir(outputRoot, { withFileTypes: true })) {
		if (['client', 'server'].map(declaredTargetDirectory).includes(entry.name)) continue;
		await cp(path.join(outputRoot, entry.name), path.join(targetRoot, entry.name), {
			recursive: entry.isDirectory(),
			force: true,
			filter: (source) =>
				path.resolve(source) !== publishedBuildFactsPath && !isUnpublishedSupportArtifact(source)
		});
	}
	await rebaseSourceMaps(targetRoot);
}

async function rebaseSourceMaps(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			await rebaseSourceMaps(filename);
		} else if (entry.name.endsWith('.map')) {
			const map = JSON.parse(await readFile(filename, 'utf8'));
			if (Array.isArray(map.sources))
				map.sources = map.sources.map((source) =>
					typeof source === 'string' && !/^(?:[a-z]+:|\/)/i.test(source) ? `../${source}` : source
				);
			await writeFile(filename, JSON.stringify(map));
		}
	}
}

async function verifyCompiledExports(target, targetDirectory) {
	const expected = normalizedCompiledComponents();
	for (const [subpath, names] of Object.entries(expected)) {
		if (!names.length) continue;
		const candidates = compiledExportTargets(subpath, targetDirectory);
		if (!candidates.length)
			throw new Error(`${manifest.name} has no ${target} artifact export for ${subpath}`);
		for (const candidate of candidates) {
			const entry = path.resolve(packageRoot, candidate.path);
			const namespace = await import(`${pathToFileURL(entry).href}?exact-build=${Date.now()}`);
			const modulePath = packageModulePath(entry);
			for (const name of names) {
				const component = namespace[name];
				const contract = component?.[Symbol.for('@exactjs/component-contract')];
				const identity = component?.[Symbol.for('@exactjs/component')];
				if (
					typeof component !== 'function' ||
					!contract?.artifact ||
					contract.artifact.target !== target ||
					contract.artifact.id !== identity ||
					typeof identity !== 'string'
				) {
					throw new Error(
						`${manifest.name} ${target} export ${subpath}:${name} is not a compiled component artifact`
					);
				}
				if (target === 'client' && contract.placement === 'server') {
					throw new Error(
						`${manifest.name} client export ${subpath}:${name} contains a server boundary instead of an executable client artifact`
					);
				}
				const componentModule = componentModuleFor(identity, targetDirectory, subpath, name);
				if (manifest.exactComponentLibrary)
					componentBuildExports.push({
						subpath,
						condition: candidate.condition,
						module: modulePath,
						componentModule,
						exportName: name,
						componentId: identity
					});
			}
		}
	}
}

function componentModuleFor(identity, targetDirectory, subpath, exportName) {
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
	return candidates[0];
}

async function writeComponentLibraryBuildFacts() {
	const declaration = manifest.exactComponentLibrary;
	if (!declaration) return;
	if (declaration.protocol !== 2 || typeof declaration.build !== 'string')
		throw new Error(`${manifest.name} must declare protocol-2 exactComponentLibrary.build`);
	if (!manifest.exactCompiledComponents)
		throw new Error(`${manifest.name} component libraries must declare exactCompiledComponents`);
	const { writeExactPublishedComponentBuildFacts } = await import(
		pathToFileURL(componentLibraryBuildModule).href
	);
	await writeExactPublishedComponentBuildFacts(packageRoot, declaration.build, {
		package: { name: manifest.name, version: manifest.version },
		modules: [...componentBuildModules]
			.filter(
				([, facts]) =>
					facts.components.length ||
					facts.componentImports.length ||
					facts.rendererEnhancements.length
			)
			.map(([modulePath, facts]) => ({ path: modulePath, facts })),
		exports: componentBuildExports
	});
}

function compiledExportTargets(subpath, targetDirectory) {
	const declaration = normalizeExports(manifest.exports)[subpath];
	const prefix = `dist/${targetDirectory}/`;
	return exportTargets(declaration).filter((candidate) => {
		const modulePath = normalizePath(candidate.path);
		return modulePath.startsWith(prefix) && modulePath.endsWith('.js');
	});
}

function normalizedCompiledComponents() {
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

function normalizeExports(value) {
	if (typeof value === 'string' || Array.isArray(value) || !value) return { '.': value };
	return Object.keys(value).some((key) => key.startsWith('.')) ? value : { '.': value };
}

function exportTargets(value, inheritedCondition = 'default') {
	if (typeof value === 'string') return [{ condition: inheritedCondition, path: value }];
	if (Array.isArray(value))
		return value.flatMap((entry) => exportTargets(entry, inheritedCondition));
	if (!value || typeof value !== 'object') return [];
	return Object.entries(value).flatMap(([condition, entry]) => exportTargets(entry, condition));
}

function packageModulePath(filename) {
	return normalizePath(path.relative(packageRoot, filename));
}

function normalizePath(value) {
	return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isUnpublishedSupportArtifact(filename) {
	const basename = path.basename(filename);
	return (
		/(?:^|\.)test\.[^/\\]+$/i.test(basename) ||
		(excludesFixtureArtifacts && /(?:^|\.)fixtures?\.[^/\\]+$/i.test(basename))
	);
}

async function productionSources(directory) {
	const sources = [];
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
