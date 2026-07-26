import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectInputFiles, commonRoot, manifestPathFor, outputPathFor } from '../paths.js';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type { CompileFileOptions, CompileFileResult, CompileProjectOptions } from '../types.js';
import { capabilityCompilationOptions } from './capability-options.js';
import { transformSource } from './transformation.js';

/** Compiles one input file and optionally writes code, source map, and manifest artifacts. */
export async function compileFile(
	inputFile: string,
	options: CompileFileOptions = {}
): Promise<CompileFileResult> {
	const source = await readFile(inputFile, 'utf8');
	const result = transformSource(source, {
		filename: options.filename ?? inputFile,
		session: options.session,
		target: options.target,
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		jsxInterop: options.jsxInterop,
		assetRules: options.assetRules,
		preserveClientAssetImports: options.preserveClientAssetImports,
		pluginRegistry: options.pluginRegistry,
		generatedValidation: options.generatedValidation,
		...capabilityCompilationOptions(options)
	});
	const outputFile = options.outDir
		? outputPathFor(inputFile, options.outDir, options.rootDir)
		: undefined;
	const sourceMapFile = outputFile && result.map ? sourceMapPathFor(outputFile) : undefined;
	const manifestFile = outputFile && options.emitManifest ? manifestPathFor(outputFile) : undefined;

	if (outputFile) {
		await mkdir(path.dirname(outputFile), { recursive: true });
		await writeFile(
			outputFile,
			sourceMapFile ? withSourceMappingUrl(result.code, path.basename(sourceMapFile)) : result.code
		);
	}
	if (sourceMapFile && result.map) {
		await mkdir(path.dirname(sourceMapFile), { recursive: true });
		await writeFile(
			sourceMapFile,
			`${JSON.stringify(withSourceMapFile(result.map, path.basename(outputFile!)), null, 2)}\n`
		);
	}
	if (manifestFile) {
		await mkdir(path.dirname(manifestFile), { recursive: true });
		await writeFile(manifestFile, `${JSON.stringify(result.manifest, null, 2)}\n`);
	}

	return {
		...result,
		inputFile,
		outputFile,
		sourceMapFile,
		manifestFile
	};
}

/** Compiles all transformable files found under the provided input paths. */
export async function compileProject(
	inputs: readonly string[],
	options: CompileProjectOptions = {}
): Promise<CompileFileResult[]> {
	const files = await collectInputFiles(inputs);
	const rootDir = options.rootDir ?? commonRoot(files);
	const results: CompileFileResult[] = [];

	for (const file of files) {
		results.push(
			await compileFile(file, {
				outDir: options.outDir,
				rootDir,
				target: options.target,
				emitManifest: options.emitManifest,
				serverComponents: options.serverComponents,
				sourceMap: options.sourceMap,
				session: options.session,
				moduleRewrite: options.moduleRewrite,
				moduleTransform: options.moduleTransform,
				jsxInterop: options.jsxInterop,
				assetRules: options.assetRules,
				preserveClientAssetImports: options.preserveClientAssetImports,
				pluginRegistry: options.pluginRegistry,
				...capabilityCompilationOptions(options)
			})
		);
	}

	return results;
}
