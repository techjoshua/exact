import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectInputFiles, commonRoot, outputPathFor } from '../paths.js';
import {
	createLineSourceMap,
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
	options: CompileFileOptions
): Promise<PreparedCompileFile> {
	const source = await readFile(inputFile, 'utf8');
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
		target: options.target,
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
					options.target === 'client' ? '@exactjs/dom/framework/enhancements' : undefined
				).code
			: result.code;
	return Object.freeze({
		...result,
		code: executable,
		map:
			result.map && executable !== result.code
				? createLineSourceMap(options.filename ?? inputFile, source, executable)
				: result.map,
		source,
		inputFile,
		outputFile,
		sourceMapFile
	});
}

async function publishPreparedFile(prepared: PreparedCompileFile): Promise<void> {
	const { outputFile, sourceMapFile, map } = prepared;
	if (outputFile) {
		await mkdir(path.dirname(outputFile), { recursive: true });
		await writeFile(
			outputFile,
			sourceMapFile
				? withSourceMappingUrl(prepared.code, path.basename(sourceMapFile))
				: prepared.code
		);
	}
	if (sourceMapFile && map) {
		await mkdir(path.dirname(sourceMapFile), { recursive: true });
		await writeFile(
			sourceMapFile,
			`${JSON.stringify(withSourceMapFile(map, path.basename(outputFile!)), null, 2)}\n`
		);
	}
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

	for (const file of files) {
		prepared.push(
			await prepareFile(file, {
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
				packageEnhancements: options.packageEnhancements,
				...capabilityCompilationOptions(options)
			})
		);
	}
	await validatePreparedFiles(prepared, options.root ?? rootDir, options);
	for (const result of prepared) await publishPreparedFile(result);
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
