import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectInputFiles, commonRoot, outputPathFor } from '../paths.js';
import {
	composeExactSourceMaps,
	createGeneratedSuffixSourceMap,
	sourceMapPathFor,
	withSourceMapFile,
	withSourceMappingUrl
} from '../source-maps.js';
import type { CompileFileOptions, CompileFileResult, CompileProjectOptions } from '../types.js';
import { capabilityCompilationOptions } from './capability-options.js';
import { transformSource } from './transformation.js';
import { createOwnedNativeCompilationSession } from './native-session.js';
import { validateExactLanguageProjections } from './language-validation.js';
import { loadExactPackageEnhancements } from '@exactjs/config/node';
import { prependExactEnhancementRegistrations } from './enhancement-registrations.js';
import { materializeExactPhysicalEnhancementFacades } from './physical-enhancement-facades.js';
import { synchronizeNativeProject } from './project-synchronization.js';
import { publishOutputTransaction, type CompilerOutputMutation } from './output-transaction.js';

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
	const prepared = await prepareFile(inputFile, options);
	await validatePreparedFiles([prepared], options.root ?? path.dirname(inputFile), options);
	await publishPreparedFile(prepared);
	return publicPreparedResult(prepared, options.emitInspection);
}

async function prepareFile(
	inputFile: string,
	options: CompileFileOptions,
	loadedSource?: string
): Promise<PreparedCompileFile> {
	const target = options.target ?? 'client';
	const source = loadedSource ?? (await readFile(inputFile, 'utf8'));
	const packageEnhancements =
		options.packageEnhancements ??
		loadExactPackageEnhancements({
			applicationRoot: options.root ?? path.dirname(inputFile)
		}).packageEnhancements;
	const result = transformSource(source, {
		filename: options.filename ?? inputFile,
		root: options.root,
		configFile: options.configFile,
		session: options.session,
		packageEnhancements,
		target,
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		jsxInterop: options.jsxInterop,
		assetRules: options.assetRules,
		preserveClientAssetImports: options.preserveClientAssetImports,
		generatedValidation: options.generatedValidation,
		emitInspection: true,
		...capabilityCompilationOptions(options)
	});
	const outputFile = options.outDir
		? outputPathFor(inputFile, options.outDir, options.rootDir)
		: undefined;
	const sourceMapFile = outputFile && result.map ? sourceMapPathFor(outputFile) : undefined;

	const rendererEnhancements = result.rendererEnhancements ?? [];
	const executable =
		outputFile && rendererEnhancements.length
			? materializeExactPhysicalEnhancementFacades(
					prependExactEnhancementRegistrations(result.code, rendererEnhancements),
					rendererEnhancements,
					inputFile,
					options.outDir ?? path.dirname(outputFile),
					target === 'client' ? '@exactjs/dom/framework/enhancements' : undefined
				).code
			: result.code;
	return Object.freeze({
		...result,
		code: executable,
		map:
			result.map && executable !== result.code
				? composeExactSourceMaps(
						createGeneratedSuffixSourceMap(result.filename, result.code, executable),
						result.map
					)
				: result.map,
		source,
		inputFile,
		outputFile,
		sourceMapFile
	});
}

async function publishPreparedFile(prepared: PreparedCompileFile): Promise<void> {
	await publishOutputTransaction(preparedFileMutations(prepared));
}

/** Prepares code and map replacements so they publish as one generation. */
function preparedFileMutations(prepared: PreparedCompileFile): CompilerOutputMutation[] {
	const { outputFile, sourceMapFile, map } = prepared;
	if (!outputFile) return [];
	return [
		{
			file: outputFile,
			content: sourceMapFile
				? withSourceMappingUrl(prepared.code, path.basename(sourceMapFile))
				: prepared.code
		},
		...(sourceMapFile && map
			? [
					{
						file: sourceMapFile,
						content: `${JSON.stringify(withSourceMapFile(map, path.basename(outputFile)), null, 2)}\n`
					}
				]
			: [])
	];
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
	const files = await collectInputFiles(inputs, options.includeAllModules);
	const rootDir = options.rootDir ?? commonRoot(files);
	const prepared: PreparedCompileFile[] = [];
	const packageEnhancements =
		options.packageEnhancements ??
		loadExactPackageEnhancements({
			applicationRoot: options.root ?? rootDir
		}).packageEnhancements;
	const synchronizedSources = await synchronizeNativeProject(files, {
		root: options.root,
		configFile: options.configFile,
		packageEnhancements,
		session: options.session
	});

	for (const file of files) {
		prepared.push(
			await prepareFile(
				file,
				{
					outDir: options.outDir,
					rootDir,
					root: options.root,
					configFile: options.configFile,
					target: options.target,
					serverComponents: options.serverComponents,
					sourceMap: options.sourceMap,
					session: options.session,
					moduleRewrite: options.moduleRewrite,
					moduleTransform: options.moduleTransform,
					jsxInterop: options.jsxInterop,
					assetRules: options.assetRules,
					preserveClientAssetImports: options.preserveClientAssetImports,
					generatedValidation: options.generatedValidation,
					languageExtensions: options.languageExtensions,
					packageEnhancements,
					...capabilityCompilationOptions(options)
				},
				synchronizedSources.get(file)
			)
		);
	}
	await validatePreparedFiles(prepared, options.root ?? rootDir, options);
	await publishOutputTransaction(prepared.flatMap(preparedFileMutations));
	return prepared.map((result) => publicPreparedResult(result, options.emitInspection));
}

type PreparedCompileFile = CompileFileResult & Readonly<{ source: string }>;

function publicPreparedResult(
	prepared: PreparedCompileFile,
	emitInspection: CompileFileOptions['emitInspection']
): CompileFileResult {
	const { source: _source, inspectionCatalog, ...result } = prepared;
	return {
		...result,
		...(emitInspection === true || emitInspection === 'auto' ? { inspectionCatalog } : {})
	};
}

async function validatePreparedFiles(
	files: readonly PreparedCompileFile[],
	root: string,
	options: Readonly<{ languageExtensions?: CompileProjectOptions['languageExtensions'] }>
): Promise<void> {
	await validateExactLanguageProjections(
		files.flatMap((file) =>
			file.inspectionCatalog ? [file.inspectionCatalog.languageProjection] : []
		),
		root,
		options.languageExtensions
	);
}
