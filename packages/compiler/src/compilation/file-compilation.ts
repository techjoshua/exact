import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectInputFiles, commonRoot, outputPathFor } from '../paths.js';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type { CompileFileOptions, CompileFileResult, CompileProjectOptions } from '../types.js';
import { capabilityCompilationOptions } from './capability-options.js';
import { transformSource } from './transformation.js';
import { createOwnedNativeCompilationSession } from './native-session.js';

/** Compiles one input file and optionally writes code and its source map. */
export async function compileFile(
	inputFile: string,
	options: CompileFileOptions = {}
): Promise<CompileFileResult> {
	const ownedSession = createOwnedNativeCompilationSession(options.session);
	if (ownedSession) {
		try {
			return await compileFile(inputFile, { ...options, session: ownedSession });
		} finally {
			ownedSession.dispose();
		}
	}
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
	return {
		...result,
		inputFile,
		outputFile,
		sourceMapFile
	};
}

/** Compiles all transformable files found under the provided input paths. */
export async function compileProject(
	inputs: readonly string[],
	options: CompileProjectOptions = {}
): Promise<CompileFileResult[]> {
	const ownedSession = createOwnedNativeCompilationSession(options.session);
	if (ownedSession) {
		try {
			return await compileProject(inputs, { ...options, session: ownedSession });
		} finally {
			ownedSession.dispose();
		}
	}
	const files = await collectInputFiles(inputs);
	const rootDir = options.rootDir ?? commonRoot(files);
	const results: CompileFileResult[] = [];

	for (const file of files) {
		results.push(
			await compileFile(file, {
				outDir: options.outDir,
				rootDir,
				target: options.target,
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
