import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExactCompilerSession } from '../expression/project.js';
import { artifactPathsFor, commonRoot } from '../paths.js';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
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
	removeGeneratedArtifact,
	sharedArtifactFacade,
	sharedArtifactResult
} from './shared-artifact.js';
import {
	capabilityCompilationOptions,
	type CapabilityCompilationOptions
} from './capability-options.js';
import { analyzeSource } from './source-analysis.js';
import { transformSource } from './transformation.js';
import { createOwnedNativeCompilationSession } from './native-session.js';
import { writeArtifactPlanEntry } from './artifact-entry-output.js';
import { createExactInspectionBuildKey } from '../language-tools/build-catalog.js';
import { finalizeArtifactInspection } from './artifact-inspection.js';
import { artifactAnalysis, retainArtifactAnalysis } from './analysis-results.js';
import { createArtifactBuildProducts } from './build-products.js';

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
		assetRules: options.assetRules,
		jsxInterop: options.jsxInterop,
		generatedValidation: options.generatedValidation,
		...capabilityOptions
	});
	const client = transformSource(source, {
		filename,
		buildKey,
		session: options.session,
		target: 'client',
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		jsxInterop: options.jsxInterop,
		assetRules: options.assetRules,
		generatedValidation: options.generatedValidation,
		emitInspection: options.emitInspection,
		instrumentInspection: options.instrumentInspection,
		...capabilityOptions
	});
	const server = transformSource(source, {
		filename,
		buildKey,
		session: options.session,
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
	const shared = !options.sourceMap && sharedArtifactResult(analysis, client, server);
	const clientMapFile = client.map ? sourceMapPathFor(paths.clientFile) : undefined;
	const serverMapFile = server.map ? sourceMapPathFor(paths.serverFile) : undefined;

	await mkdir(path.dirname(paths.clientFile), { recursive: true });
	const outputWrites: Promise<void>[] = [
		writeFile(
			paths.clientFile,
			shared
				? sharedArtifactFacade(analysis, paths.sharedFile, paths.clientFile)
				: clientMapFile
					? withSourceMappingUrl(client.code, path.basename(clientMapFile))
					: client.code
		),
		writeFile(
			paths.serverFile,
			shared
				? sharedArtifactFacade(analysis, paths.sharedFile, paths.serverFile)
				: serverMapFile
					? withSourceMappingUrl(server.code, path.basename(serverMapFile))
					: server.code
		),
		shared ? writeFile(paths.sharedFile, shared.code) : removeGeneratedArtifact(paths.sharedFile)
	];
	if (clientMapFile && client.map)
		outputWrites.push(
			writeFile(
				clientMapFile,
				`${JSON.stringify(withSourceMapFile(client.map, path.basename(paths.clientFile)), null, 2)}\n`
			)
		);
	if (serverMapFile && server.map)
		outputWrites.push(
			writeFile(
				serverMapFile,
				`${JSON.stringify(withSourceMapFile(server.map, path.basename(paths.serverFile)), null, 2)}\n`
			)
		);
	// Every path is independently owned by this artifact generation. Publish them concurrently only
	// after analysis and transformation settle so diagnostics and artifact contents remain ordered.
	await Promise.all(outputWrites);
	const result: CompileArtifactsResult = retainArtifactAnalysis(
		{
			inputFile,
			clientFile: paths.clientFile,
			serverFile: paths.serverFile,
			...(shared ? { sharedFile: paths.sharedFile } : {}),
			clientMapFile,
			serverMapFile,
			client,
			server,
			...(shared ? { shared } : {}),
			build: createArtifactBuildProducts(inputFile, analysis),
			...(client.inspectionCatalog
				? { inspection: Object.freeze({ inspection: client.inspectionCatalog }) }
				: {})
		},
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
	const results = await compileArtifactPlanEntries(entries, {
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
		emitInspection: options.emitInspection,
		instrumentInspection: options.instrumentInspection,
		...capabilityCompilationOptions(options)
	});
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
	const ownedSession = createOwnedNativeCompilationSession(options.session);
	if (ownedSession) {
		try {
			return await compileArtifactPlanEntries(entries, {
				...options,
				session: ownedSession
			});
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
	const dependencyGraph = dependencyAnalysis.graph;
	const localDependencies = dependencyAnalysis.localDependencies;
	const capabilityOptions = capabilityCompilationOptions(options);

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
				capabilityOptions
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
	capabilityOptions: CapabilityCompilationOptions = {}
): Promise<CompileArtifactsResult> {
	const source = await readFile(entry.inputFile, 'utf8');
	const base = analyzeSource(source, {
		filename,
		buildKey,
		session,
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
	const result = await writeArtifactPlanEntry(entry, base, client, server, sourceMap);
	return client.inspectionCatalog
		? retainArtifactAnalysis(
				{
					...result,
					inspection: Object.freeze({ inspection: client.inspectionCatalog })
				},
				artifactAnalysis(result)
			)
		: result;
}
