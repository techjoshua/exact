import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	createExactBuildInspectionCatalog,
	createExactInspectionBuildKey,
	createExactInspectionRedactions
} from '../language-tools/build-catalog.js';
import { discoverExactPackageManifests } from '../artifacts.js';
import type { ExactCompilerSession } from '../expression/project.js';
import { artifactPathsFor, commonRoot, withArtifactMetadata } from '../paths.js';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type {
	CompileArtifactPlanEntriesOptions,
	CompileArtifactsOptions,
	CompileArtifactsResult,
	ExactArtifactPlanEntry,
	ExactCompilerManifest,
	ModuleRewriteOptions,
	TransformOptions
} from '../types.js';
import type { ExactSourceInspection } from '../language-tools/contracts.js';
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

/** Compiles one source file into paired client/server artifacts plus an artifact manifest. */
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
	const capabilityOptions = capabilityCompilationOptions(options);
	const discoveredManifests =
		options.discoverPackageManifests === false
			? []
			: (await discoverExactPackageManifests(path.dirname(inputFile))).map(
					(entry) => entry.manifest
				);
	const importedManifests = [...(options.importedManifests ?? []), ...discoveredManifests];
	const manifestBase = analyzeSource(source, {
		filename,
		session: options.session,
		importedManifests,
		assetRules: options.assetRules,
		jsxInterop: options.jsxInterop,
		pluginRegistry: options.pluginRegistry,
		generatedValidation: options.generatedValidation,
		...capabilityOptions
	});
	const client = transformSource(source, {
		filename,
		session: options.session,
		target: 'client',
		importedManifests,
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		jsxInterop: options.jsxInterop,
		assetRules: options.assetRules,
		pluginRegistry: options.pluginRegistry,
		generatedValidation: options.generatedValidation,
		emitInspection: options.emitInspection,
		instrumentInspection: options.instrumentInspection,
		...capabilityOptions
	});
	const server = transformSource(source, {
		filename,
		session: options.session,
		target: 'server',
		importedManifests,
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		jsxInterop: options.jsxInterop,
		assetRules: options.assetRules,
		pluginRegistry: options.pluginRegistry,
		generatedValidation: options.generatedValidation,
		emitInspection: false,
		instrumentInspection: false,
		...capabilityOptions
	});
	const paths = artifactPathsFor(inputFile, options.outDir, options.rootDir);
	const shared = !options.sourceMap && sharedArtifactResult(manifestBase, client, server);
	const manifest = withArtifactMetadata(manifestBase, inputFile, {
		...paths,
		...(!shared ? { sharedFile: undefined } : {})
	});
	const clientMapFile = client.map ? sourceMapPathFor(paths.clientFile) : undefined;
	const serverMapFile = server.map ? sourceMapPathFor(paths.serverFile) : undefined;

	await mkdir(path.dirname(paths.clientFile), { recursive: true });
	await writeFile(
		paths.clientFile,
		shared
			? sharedArtifactFacade(manifestBase, paths.sharedFile, paths.clientFile)
			: clientMapFile
				? withSourceMappingUrl(client.code, path.basename(clientMapFile))
				: client.code
	);
	await writeFile(
		paths.serverFile,
		shared
			? sharedArtifactFacade(manifestBase, paths.sharedFile, paths.serverFile)
			: serverMapFile
				? withSourceMappingUrl(server.code, path.basename(serverMapFile))
				: server.code
	);
	if (shared) await writeFile(paths.sharedFile, shared.code);
	else await removeGeneratedArtifact(paths.sharedFile);
	if (clientMapFile && client.map)
		await writeFile(
			clientMapFile,
			`${JSON.stringify(withSourceMapFile(client.map, path.basename(paths.clientFile)), null, 2)}\n`
		);
	if (serverMapFile && server.map)
		await writeFile(
			serverMapFile,
			`${JSON.stringify(withSourceMapFile(server.map, path.basename(paths.serverFile)), null, 2)}\n`
		);
	await writeFile(paths.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

	const result: CompileArtifactsResult = {
		inputFile,
		clientFile: paths.clientFile,
		serverFile: paths.serverFile,
		...(shared ? { sharedFile: paths.sharedFile } : {}),
		manifestFile: paths.manifestFile,
		clientMapFile,
		serverMapFile,
		client,
		server,
		...(shared ? { shared } : {}),
		manifest,
		...(client.inspectionCatalog
			? { inspection: Object.freeze({ inspection: client.inspectionCatalog }) }
			: {})
	};
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
		importedManifests: options.importedManifests,
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		session: options.session,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		jsxInterop: options.jsxInterop,
		assetRules: options.assetRules,
		pluginRegistry: options.pluginRegistry,
		discoverPackageManifests: options.discoverPackageManifests,
		emitInspection: options.emitInspection,
		instrumentInspection: options.instrumentInspection,
		...capabilityCompilationOptions(options)
	});
	const sources = new Map<string, string>();
	for (const result of results)
		sources.set(path.resolve(result.inputFile), await readFile(result.inputFile, 'utf8'));
	return finalizeArtifactInspection(results, options, sources);
}

/** Compiles precomputed artifact plan entries, sharing manifests so cross-file analysis can see siblings. */
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
	const manifestBases = new Map<string, ExactCompilerManifest>();
	const sources = new Map<string, string>();

	for (const entry of entries) {
		const source = await readFile(entry.inputFile, 'utf8');
		sources.set(path.resolve(entry.inputFile), source);
	}
	const dependencyAnalysis = await collectPlacementAnalysisDependencies(sources, options.session);
	const dependencyGraph = dependencyAnalysis.graph;
	const localDependencies = dependencyAnalysis.localDependencies;
	const packageManifests =
		options.discoverPackageManifests === false || !entries.length
			? []
			: (await discoverExactPackageManifests(path.dirname(entries[0]!.inputFile))).map(
					(entry) => entry.manifest
				);
	const externalManifests = [...(options.importedManifests ?? []), ...packageManifests];
	const capabilityOptions = capabilityCompilationOptions(options);
	for (const [inputFile, source] of sources) {
		const entry = entries.find((candidate) => path.resolve(candidate.inputFile) === inputFile);
		const filename = entry ? (options.filename?.(entry) ?? entry.inputFile) : inputFile;
		manifestBases.set(
			inputFile,
			analyzeSource(source, {
				filename,
				session: options.session,
				importedManifests: externalManifests,
				assetRules: options.assetRules,
				pluginRegistry: options.pluginRegistry,
				generatedValidation: options.generatedValidation,
				...capabilityOptions
			})
		);
	}
	const importedManifests = externalManifests;

	for (const entry of entries) {
		const filename = options.filename?.(entry) ?? entry.inputFile;
		const inputFile = path.resolve(entry.inputFile);
		const dependencies = transitiveDependencies(inputFile, dependencyGraph);
		results.push(
			await compileArtifactPlanEntry(
				entry,
				filename,
				importedManifests,
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
				options.pluginRegistry,
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
	importedManifests: readonly ExactCompilerManifest[] = [],
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
	pluginRegistry?: TransformOptions['pluginRegistry'],
	generatedValidation?: TransformOptions['generatedValidation'],
	emitInspection?: TransformOptions['emitInspection'],
	instrumentInspection?: TransformOptions['instrumentInspection'],
	capabilityOptions: CapabilityCompilationOptions = {}
): Promise<CompileArtifactsResult> {
	const source = await readFile(entry.inputFile, 'utf8');
	const base = analyzeSource(source, {
		filename,
		session,
		importedManifests,
		assetRules,
		jsxInterop,
		pluginRegistry,
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
		session,
		target: 'client',
		importedManifests,
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
		pluginRegistry,
		generatedValidation,
		emitInspection,
		instrumentInspection,
		...capabilityOptions
	});
	const server = transformSource(source, {
		filename,
		session,
		target: 'server',
		importedManifests,
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
		pluginRegistry,
		generatedValidation,
		emitInspection: false,
		instrumentInspection: false,
		...capabilityOptions
	});
	const result = await writeArtifactPlanEntry(entry, base, client, server, sourceMap);
	return client.inspectionCatalog
		? {
				...result,
				inspection: Object.freeze({ inspection: client.inspectionCatalog })
			}
		: result;
}

async function finalizeArtifactInspection(
	results: readonly CompileArtifactsResult[],
	options: CompileArtifactsOptions,
	sources: ReadonlyMap<string, string>
): Promise<CompileArtifactsResult[]> {
	const inspected = results.filter(
		(
			result
		): result is CompileArtifactsResult & { inspection: { inspection: ExactSourceInspection } } =>
			result.inspection !== undefined
	);
	if (!inspected.length) return [...results];
	const rootComponentId =
		options.inspection?.rootComponentId ??
		inspected.flatMap((result) => result.inspection.inspection.components)[0]?.id;
	if (!rootComponentId) return [...results];
	const projectRoot = path.resolve(
		options.inspection?.projectRoot ??
			options.rootDir ??
			commonRoot(results.map((result) => result.inputFile))
	);
	const sourceRecord: Record<string, string> = {};
	for (const [filename, source] of sources) sourceRecord[filename] = source;
	const inspections = inspected.map((result) => result.inspection.inspection);
	const buildKey =
		options.inspection?.buildKey ??
		createExactInspectionBuildKey(
			projectRoot,
			inspections.map((inspection) => ({
				filename: inspection.filename,
				source:
					sourceRecord[inspection.filename] ?? sourceRecord[path.resolve(inspection.filename)]!
			}))
		);
	const executionRoot = options.inspection?.executionRoot ?? rootComponentId;
	const catalog = createExactBuildInspectionCatalog({
		buildKey,
		root: projectRoot,
		...(options.inspection?.producer ? { producer: options.inspection.producer } : {}),
		roots: [
			{
				executionRoot,
				rootComponentId,
				inspections,
				sources: sourceRecord,
				redactions: createExactInspectionRedactions(
					results.map((result) => result.manifest),
					options.inspection?.redactions
				)
			}
		]
	});
	const inspectionFile = path.resolve(
		options.inspection?.outputFile ??
			path.join(options.outDir, '.exact-inspection', `${buildKey}.json`)
	);
	if (!isWithinDirectory(path.resolve(options.outDir), inspectionFile))
		throw new Error(`Inspection output ${inspectionFile} must remain inside artifact output`);
	await mkdir(path.dirname(inspectionFile), { recursive: true });
	await writeFile(inspectionFile, `${JSON.stringify(catalog, null, 2)}\n`);
	return results.map((result) =>
		result.inspection
			? {
					...result,
					inspection: Object.freeze({
						inspectionFile,
						inspection: result.inspection.inspection
					})
				}
			: result
	);
}

function isWithinDirectory(directory: string, candidate: string): boolean {
	const relative = path.relative(directory, candidate);
	return (
		relative !== '' &&
		relative !== '..' &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}
