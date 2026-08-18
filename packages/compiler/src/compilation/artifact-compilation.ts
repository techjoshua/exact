import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExactCompilerSession } from '../expression/project.js';
import { artifactPathsFor, commonRoot } from '../paths.js';
import type {
	CompileArtifactPlanEntriesOptions,
	CompileArtifactsOptions,
	CompileArtifactsResult,
	ExactArtifactPlanEntry,
	ModuleRewriteOptions,
	TransformOptions
} from '../types.js';
import {
	collectPlacementAnalysisDependencies,
	transitiveDependencies
} from './dependency-discovery.js';
import { createExactArtifactPlan } from './artifact-plan.js';
import { artifactModuleRewrite, expandArtifactPlanDependencies } from './artifact-dependencies.js';

import {
	capabilityCompilationOptions,
	type CapabilityCompilationOptions
} from './capability-options.js';
import { analyzeSource } from './source-analysis.js';
import { transformSource } from './transformation.js';
import { createOwnedNativeCompilationSession } from './native-session.js';
import { prepareArtifactPlanEntry, publishArtifactPlanEntry } from './artifact-entry-output.js';
import { createExactInspectionBuildKey } from '../language-tools/build-catalog.js';
import { finalizeArtifactInspection } from './artifact-inspection.js';
import { artifactAnalysis, retainArtifactAnalysis } from './analysis-results.js';
import { validateExactLanguageProjections } from './language-validation.js';
import { loadExactPackageEnhancements } from '@exactjs/config/node';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import { synchronizeNativeProject } from './project-synchronization.js';

const preparedLanguageProjections = new WeakMap<
	CompileArtifactsResult,
	NonNullable<CompileArtifactsResult['client']['inspectionCatalog']>['languageProjection']
>();

/** Compiles one source file into paired client/server artifacts. */
export async function compileFileArtifacts(
	inputFile: string,
	options: CompileArtifactsOptions
): Promise<CompileArtifactsResult> {
	const ownedSession = createOwnedNativeCompilationSession(options.session);
	if (ownedSession) {
		try {
			return await compileFileArtifacts(inputFile, { ...options, session: ownedSession });
		} finally {
			ownedSession.dispose();
		}
	}
	const source = await readFile(inputFile, 'utf8');
	const filename = options.filename ?? inputFile;
	const packageEnhancements =
		options.packageEnhancements ??
		loadExactPackageEnhancements({
			applicationRoot: options.rootDir ?? path.dirname(inputFile)
		}).packageEnhancements;
	const buildKey =
		options.buildKey ??
		options.inspection?.buildKey ??
		createExactInspectionBuildKey(path.dirname(path.resolve(inputFile)), [
			{ filename: path.resolve(inputFile), source }
		]);
	const capabilityOptions = capabilityCompilationOptions(options);
	const analysis = analyzeSource(source, {
		filename,
		buildKey,
		session: options.session,
		packageEnhancements,
		assetRules: options.assetRules,
		jsxInterop: options.jsxInterop,
		generatedValidation: options.generatedValidation,
		...capabilityOptions
	});
	const client = transformSource(source, {
		filename,
		buildKey,
		session: options.session,
		packageEnhancements,
		target: 'client',
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		jsxInterop: options.jsxInterop,
		assetRules: options.assetRules,
		generatedValidation: options.generatedValidation,
		emitInspection: options.languageExtensions === false ? options.emitInspection : true,
		instrumentInspection: options.instrumentInspection,
		...capabilityOptions
	});
	const server = transformSource(source, {
		filename,
		buildKey,
		session: options.session,
		packageEnhancements,
		target: 'server',
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		jsxInterop: options.jsxInterop,
		assetRules: options.assetRules,
		generatedValidation: options.generatedValidation,
		emitInspection: false,
		instrumentInspection: false,
		...capabilityOptions
	});
	const paths = artifactPathsFor(inputFile, options.outDir, options.rootDir);
	const entry = { inputFile, ...paths };
	let result = prepareArtifactPlanEntry(
		entry,
		analysis,
		client,
		server,
		options.sourceMap ?? false
	);
	await validateExactLanguageProjections(
		client.inspectionCatalog ? [client.inspectionCatalog.languageProjection] : [],
		options.rootDir ?? path.dirname(inputFile),
		options.languageExtensions
	);
	await publishArtifactPlanEntry(entry, result);
	if (
		client.inspectionCatalog &&
		options.emitInspection !== undefined &&
		options.emitInspection !== false
	)
		result = retainArtifactAnalysis(
			{ ...result, inspection: Object.freeze({ inspection: client.inspectionCatalog }) },
			analysis
		);
	const finalized = await finalizeArtifactInspection(
		[result],
		options,
		new Map([[path.resolve(inputFile), source]])
	);
	return finalized[0]!;
}

/** Compiles all artifact plan entries for the provided source inputs. */
export async function compileProjectArtifacts(
	inputs: readonly string[],
	options: CompileArtifactsOptions
): Promise<CompileArtifactsResult[]> {
	const ownedSession = createOwnedNativeCompilationSession(options.session);
	if (ownedSession) {
		try {
			return await compileProjectArtifacts(inputs, { ...options, session: ownedSession });
		} finally {
			ownedSession.dispose();
		}
	}
	const plan = await createExactArtifactPlan(inputs, options);
	const entries = await expandArtifactPlanDependencies(plan.entries, options);
	const packageEnhancements =
		options.packageEnhancements ??
		loadExactPackageEnhancements({
			applicationRoot: options.rootDir ?? commonRoot(plan.entries.map((entry) => entry.inputFile))
		}).packageEnhancements;
	const results = await compileArtifactPlanEntriesInternal(
		entries,
		{
			filename: (entry) =>
				entries.length === 1 ? (options.filename ?? entry.inputFile) : entry.inputFile,
			serverComponents: options.serverComponents,
			buildKey: options.buildKey ?? options.inspection?.buildKey,
			sourceMap: options.sourceMap,
			session: options.session,
			moduleRewrite: options.moduleRewrite,
			moduleTransform: options.moduleTransform,
			jsxInterop: options.jsxInterop,
			assetRules: options.assetRules,
			emitInspection: options.languageExtensions === false ? options.emitInspection : true,
			instrumentInspection: options.instrumentInspection,
			packageEnhancements,
			...capabilityCompilationOptions(options)
		},
		false,
		options.emitInspection !== undefined && options.emitInspection !== false
	);
	await validateExactLanguageProjections(
		results.flatMap((result) => {
			const projection = preparedLanguageProjections.get(result);
			return projection ? [projection] : [];
		}),
		options.rootDir ?? commonRoot(entries.map((entry) => entry.inputFile)),
		options.languageExtensions
	);
	await Promise.all(
		results.map((result, index) => publishArtifactPlanEntry(entries[index]!, result))
	);
	const sources = new Map<string, string>();
	for (const result of results)
		sources.set(path.resolve(result.inputFile), await readFile(result.inputFile, 'utf8'));
	return finalizeArtifactInspection(results, options, sources);
}

/** Compiles precomputed artifact plan entries through one owned project session. */
export async function compileArtifactPlanEntries(
	entries: readonly ExactArtifactPlanEntry[],
	options: CompileArtifactPlanEntriesOptions = {}
): Promise<CompileArtifactsResult[]> {
	return compileArtifactPlanEntriesInternal(entries, options, true);
}

async function compileArtifactPlanEntriesInternal(
	entries: readonly ExactArtifactPlanEntry[],
	options: CompileArtifactPlanEntriesOptions,
	publish: boolean,
	retainInspection = options.emitInspection !== undefined && options.emitInspection !== false
): Promise<CompileArtifactsResult[]> {
	const ownedSession = createOwnedNativeCompilationSession(options.session);
	if (ownedSession) {
		try {
			return await compileArtifactPlanEntriesInternal(
				entries,
				{
					...options,
					session: ownedSession
				},
				publish,
				retainInspection
			);
		} finally {
			ownedSession.dispose();
		}
	}
	const results: CompileArtifactsResult[] = [];
	const sources = new Map<string, string>();

	for (const entry of entries) {
		const source = await readFile(entry.inputFile, 'utf8');
		sources.set(path.resolve(entry.inputFile), source);
	}
	const buildKey =
		options.buildKey ??
		createExactInspectionBuildKey(
			commonRoot(entries.map((entry) => entry.inputFile)),
			[...sources].map(([filename, source]) => ({ filename, source }))
		);
	const dependencyAnalysis = await collectPlacementAnalysisDependencies(sources, options.session);
	await synchronizeNativeProject(
		[...sources.keys()],
		{
			packageEnhancements: options.packageEnhancements,
			session: options.session
		},
		sources
	);
	const dependencyGraph = dependencyAnalysis.graph;
	const localDependencies = dependencyAnalysis.localDependencies;
	const capabilityOptions = capabilityCompilationOptions(options);
	const packageEnhancements =
		options.packageEnhancements ??
		loadExactPackageEnhancements({
			applicationRoot: commonRoot(entries.map((entry) => entry.inputFile))
		}).packageEnhancements;

	for (const entry of entries) {
		const filename = options.filename?.(entry) ?? entry.inputFile;
		const inputFile = path.resolve(entry.inputFile);
		const dependencies = transitiveDependencies(inputFile, dependencyGraph);
		results.push(
			await compileArtifactPlanEntry(
				entry,
				filename,
				buildKey,
				options.serverComponents ?? false,
				options.sourceMap ?? false,
				dependencies,
				dependencies.includes(inputFile),
				entries,
				localDependencies.get(inputFile) ?? [],
				options.moduleRewrite,
				options.moduleTransform,
				options.jsxInterop,
				options.session,
				options.assetRules,
				options.generatedValidation,
				options.emitInspection,
				options.instrumentInspection,
				packageEnhancements,
				capabilityOptions,
				publish,
				retainInspection
			)
		);
	}

	return results;
}

async function compileArtifactPlanEntry(
	entry: ExactArtifactPlanEntry,
	filename: string,
	buildKey: string,
	serverComponents = false,
	sourceMap = false,
	dependencies: readonly string[] = [],
	preserveComponentHoisting = false,
	entries: readonly ExactArtifactPlanEntry[] = [],
	localDependencies: readonly { specifier: string; file: string }[] = [],
	moduleRewrite?: ModuleRewriteOptions,
	moduleTransform?: import('../types.js').ModuleTransform,
	jsxInterop?: TransformOptions['jsxInterop'],
	session?: ExactCompilerSession,
	assetRules?: TransformOptions['assetRules'],
	generatedValidation?: TransformOptions['generatedValidation'],
	emitInspection?: TransformOptions['emitInspection'],
	instrumentInspection?: TransformOptions['instrumentInspection'],
	packageEnhancements: readonly ExactPackageEnhancementImport[] = [],
	capabilityOptions: CapabilityCompilationOptions = {},
	publish = true,
	retainInspection = emitInspection !== undefined && emitInspection !== false
): Promise<CompileArtifactsResult> {
	const source = await readFile(entry.inputFile, 'utf8');
	const base = analyzeSource(source, {
		filename,
		buildKey,
		session,
		packageEnhancements,
		assetRules,
		jsxInterop,
		generatedValidation,
		emitInspection,
		instrumentInspection,
		...capabilityOptions
	});
	base.dependencies = [
		...new Set(
			dependencies.map((dependency) =>
				path.relative(path.dirname(path.resolve(filename)), dependency).replaceAll(path.sep, '/')
			)
		)
	].sort();
	const client = transformSource(source, {
		filename,
		buildKey,
		session,
		packageEnhancements,
		target: 'client',
		serverComponents,
		sourceMap,
		preserveComponentHoisting,
		moduleRewrite: artifactModuleRewrite(
			entry,
			'client',
			entries,
			localDependencies,
			moduleRewrite
		),
		moduleTransform,
		jsxInterop,
		assetRules,
		generatedValidation,
		emitInspection,
		instrumentInspection,
		...capabilityOptions
	});
	const server = transformSource(source, {
		filename,
		buildKey,
		session,
		packageEnhancements,
		target: 'server',
		serverComponents,
		sourceMap,
		preserveComponentHoisting,
		moduleRewrite: artifactModuleRewrite(
			entry,
			'server',
			entries,
			localDependencies,
			moduleRewrite
		),
		moduleTransform,
		jsxInterop,
		assetRules,
		generatedValidation,
		emitInspection: false,
		instrumentInspection: false,
		...capabilityOptions
	});
	const result = prepareArtifactPlanEntry(entry, base, client, server, sourceMap);
	if (client.inspectionCatalog)
		preparedLanguageProjections.set(result, client.inspectionCatalog.languageProjection);
	if (publish) await publishArtifactPlanEntry(entry, result);
	if (!client.inspectionCatalog || !retainInspection) return result;
	const inspected = retainArtifactAnalysis(
		{
			...result,
			inspection: Object.freeze({ inspection: client.inspectionCatalog })
		},
		artifactAnalysis(result)
	);
	preparedLanguageProjections.set(inspected, client.inspectionCatalog.languageProjection);
	return inspected;
}
