import { cp, readFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

const packageRoot = path.resolve(process.argv[2] ?? process.cwd());
const sourceRoot = path.join(packageRoot, 'src');
const outputRoot = path.join(packageRoot, 'dist');
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const compilerModule = path.join(repositoryRoot, 'packages/compiler/dist/index.js');
const { compileProject } = await import(pathToFileURL(compilerModule).href);
const stageRoot = await mkdtemp(path.join(tmpdir(), 'exact-package-'));
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
			if (!result.outputFile) continue;
			const relative = path.relative(generatedRoot, result.outputFile);
			const outputFile = path
				.join(outputRoot, targetDirectory, relative)
				.replace(/\.[cm]?tsx?$/i, '.js');
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
		await verifyCompiledExports(target, targetDirectory);
	}
} finally {
	await rm(stageRoot, { recursive: true, force: true });
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
			force: true
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
		const relative = subpath === '.' ? 'index.js' : `${subpath.replace(/^\.\//, '')}.js`;
		const entry = path.join(outputRoot, targetDirectory, relative);
		const exports = await import(`${pathToFileURL(entry).href}?exact-build=${Date.now()}`);
		for (const name of names) {
			const component = exports[name];
			const contract = component?.[Symbol.for('@exactjs/component-contract')];
			if (typeof component !== 'function' || !contract?.definition) {
				throw new Error(
					`${manifest.name} ${target} export ${subpath}:${name} is not a compiled component artifact`
				);
			}
		}
	}
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

async function productionSources(directory) {
	const sources = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			sources.push(...(await productionSources(filename)));
		} else if (
			/\.[cm]?[jt]sx?$/i.test(entry.name) &&
			!/\.d\.[cm]?ts$/i.test(entry.name) &&
			!/(?:^|\.)test\.[cm]?[jt]sx?$/i.test(entry.name)
		) {
			sources.push(filename);
		}
	}
	return sources.sort();
}
