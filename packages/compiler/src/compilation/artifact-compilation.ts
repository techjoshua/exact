import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverExactPackageManifests } from '../artifacts.js';
import type { ExactCompilerSession } from '../expression/project.js';
import { artifactPathsFor, withArtifactMetadata } from '../paths.js';
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

	return {
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
		manifest
	};
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
	return compileArtifactPlanEntries(entries, {
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
		...capabilityCompilationOptions(options)
	});
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
		...capabilityOptions
	});
	return writeArtifactPlanEntry(entry, base, client, server, sourceMap);
}
