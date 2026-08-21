import { readFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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
const inputs = await productionSources(sourceRoot);

try {
	for (const target of ['client', 'server']) {
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
			const outputFile = path.join(outputRoot, target, relative).replace(/\.[cm]?tsx?$/i, '.js');
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
		await verifyCompiledExports(target);
	}
} finally {
	await rm(stageRoot, { recursive: true, force: true });
}

async function verifyCompiledExports(target) {
	const expected = manifest.exactCompiledComponents ?? [];
	if (!Array.isArray(expected)) throw new TypeError('exactCompiledComponents must be an array');
	const entry = path.join(outputRoot, target, 'index.js');
	const exports = await import(`${pathToFileURL(entry).href}?exact-build=${Date.now()}`);
	for (const name of expected) {
		const component = exports[name];
		const contract = component?.[Symbol.for('@exactjs/component-contract')];
		if (typeof component !== 'function' || !contract?.definition) {
			throw new Error(
				`${manifest.name} ${target} export ${name} is not a compiled component artifact`
			);
		}
	}
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
