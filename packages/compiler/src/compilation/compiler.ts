import { type ModuleRewriteOptions } from '@exact/expressions';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	artifactGraphEntryFromCompileResult,
	createExactArtifactGraph,
	diffExactArtifactPlans,
	discoverExactPackageManifests,
	readExactArtifactManifestEntries
} from '../artifacts.js';
import type { ExactCompilerSession } from '../expression/project.js';
import { invalidateExpressionModule } from '../expression/session.js';
import { artifactPathsFor, collectInputFiles, commonRoot, withArtifactMetadata } from '../paths.js';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type {
	CompileArtifactPlanEntriesOptions,
	CompileArtifactsOptions,
	CompileArtifactsResult,
	ExactArtifactDevState,
	ExactArtifactDevStateOptions,
	ExactArtifactDevStateUpdate,
	ExactArtifactPlan,
	ExactArtifactPlanEntry,
	ExactArtifactPlanOptions,
	ExactCompilerManifest,
	TransformOptions,
	TransformResult
} from '../types.js';
import {
	collectPlacementAnalysisDependencies,
	transitiveDependencies
} from './dependency-discovery.js';
import { affectedArtifactInputs } from './dev-state-planning.js';

import {
	analyzeSource,
	capabilityCompilationOptions,
	transformSource,
	type CapabilityCompilationOptions
} from './source-analysis.js';
export {
	assertExactArtifactTarget,
	createExactArtifactComponentEdges,
	createExactArtifactGraph,
	createExactArtifactRegistryModules,
	createPackageExportMap,
	diffExactArtifactPlans,
	discoverExactPackageManifests,
	exactExportConditions,
	readExactArtifactManifestEntries,
	resolveExactArtifactImport
} from '../artifacts.js';
export { ExactCompilerSession } from '../expression/project.js';
export type {
	ExactCompilerInvalidation,
	ExactCompilerProfileEvent,
	ExactCompilerSessionOptions,
	ExactCompilerSessionStats
} from '../expression/session-contracts.js';
export {
	clearExpressionProjectCache,
	createCompilerSession,
	invalidateExpressionModule
} from '../expression/session.js';
export {
	analyzeExpressionWrites,
	lowerExpressionWrites,
	type ExpressionWritePlan,
	type ExpressionWriteResult,
	type ExpressionWriteSite
} from '../expression/writes.js';
export { parseExactCompilerManifest } from '../manifest-parse.js';
export {
	rewriteModuleReferences,
	type ModuleExportReplacement,
	type ModuleRewriteOptions,
	type ModuleRewriteResult
} from '../module-rewrite.js';
export { generatedComponentName } from '../names.js';
export {
	createExactPolicyAuditReport,
	formatExactPolicyAuditReport,
	type ExactPolicyAuditReportOptions
} from '../policy-report.js';
export { preprocessPropPunning } from '../preprocess.js';
export {
	buildExactProvenance,
	type ExactProvenanceEntry,
	type ExactProvenanceGraph,
	type ExactReactiveCell,
	type ExactReactiveProvenance
} from '../provenance.js';
export {
	createClientIslandRegistryEntries,
	createClientIslandRegistryModule,
	createExactHydrationRegistrationModule,
	createServerPartRegistryEntries,
	createServerPartRegistryModule
} from '../registry.js';
export { createLineSourceMap } from '../source-maps.js';
export type * from '../types.js';
export { exactCompilerManifestVersion } from '../versions.js';

export {
	analyzeReactiveProvenance,
	analyzeSemanticGraph,
	analyzeSource,
	transform,
	transformSource
} from './source-analysis.js';
export { compileFile, compileProject } from './file-compilation.js';

/** Compiles one source file into paired client/server artifacts plus an artifact manifest. */
export async function compileFileArtifacts(
	inputFile: string,
	options: CompileArtifactsOptions
): Promise<CompileArtifactsResult> {
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
	const plan = await createExactArtifactPlan(inputs, options);
	return compileArtifactPlanEntries(plan.entries, {
		filename: (entry) => options.filename ?? entry.inputFile,
		importedManifests: options.importedManifests,
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		session: options.session,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
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
	const results: CompileArtifactsResult[] = [];
	const manifestBases = new Map<string, ExactCompilerManifest>();
	const sources = new Map<string, string>();

	for (const entry of entries) {
		const filename = options.filename?.(entry) ?? entry.inputFile;
		const source = await readFile(entry.inputFile, 'utf8');
		sources.set(path.resolve(filename), source);
	}
	const dependencyGraph = await collectPlacementAnalysisDependencies(sources, options.session);
	const packageManifests =
		options.discoverPackageManifests === false || !entries.length
			? []
			: (await discoverExactPackageManifests(path.dirname(entries[0]!.inputFile))).map(
					(entry) => entry.manifest
				);
	const externalManifests = [...(options.importedManifests ?? []), ...packageManifests];
	const capabilityOptions = capabilityCompilationOptions(options);
	for (const [inputFile, source] of sources)
		manifestBases.set(
			inputFile,
			analyzeSource(source, {
				filename: inputFile,
				session: options.session,
				importedManifests: externalManifests,
				assetRules: options.assetRules,
				pluginRegistry: options.pluginRegistry,
				generatedValidation: options.generatedValidation,
				...capabilityOptions
			})
		);
	// Resolve cross-file callable summaries to a fixed point. Each pass consumes
	// the previous immutable manifest generation, so results do not depend on
	// source ordering and recursive import groups converge monotonically.
	const maxPasses = Math.max(2, sources.size + 2);
	for (let pass = 0; pass < maxPasses; pass++) {
		const imported = [...externalManifests, ...manifestBases.values()];
		const next = new Map<string, ExactCompilerManifest>();
		let changed = false;
		for (const [key, source] of sources) {
			const entry = entries.find((candidate) => path.resolve(candidate.inputFile) === key);
			const filename = entry ? (options.filename?.(entry) ?? entry.inputFile) : key;
			const manifest = analyzeSource(source, {
				filename,
				session: options.session,
				importedManifests: imported,
				assetRules: options.assetRules,
				pluginRegistry: options.pluginRegistry,
				generatedValidation: options.generatedValidation,
				...capabilityOptions
			});
			next.set(key, manifest);
			if (callableEffectSignature(manifest) !== callableEffectSignature(manifestBases.get(key)!))
				changed = true;
		}
		manifestBases.clear();
		for (const [key, manifest] of next) manifestBases.set(key, manifest);
		if (!changed) break;
		if (pass === maxPasses - 1) throw new Error('eXact placement inference did not converge');
	}
	const importedManifests = [...externalManifests, ...manifestBases.values()];

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
				options.moduleRewrite,
				options.moduleTransform,
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

function callableEffectSignature(manifest: ExactCompilerManifest): string {
	return manifest.callables
		.map(
			(callable) =>
				`${callable.id}:${callable.effect}:${callable.effectSources.map((source) => `${source.environment}:${source.description}`).join(',')}:${JSON.stringify(callable.stateReads)}:${JSON.stringify(callable.stateWrites)}:${JSON.stringify(callable.contexts)}`
		)
		.join('|');
}

async function compileArtifactPlanEntry(
	entry: ExactArtifactPlanEntry,
	filename: string,
	importedManifests: readonly ExactCompilerManifest[] = [],
	serverComponents = false,
	sourceMap = false,
	dependencies: readonly string[] = [],
	preserveComponentHoisting = false,
	moduleRewrite?: ModuleRewriteOptions,
	moduleTransform?: import('../types.js').ModuleTransform,
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
		moduleRewrite,
		moduleTransform,
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
		moduleRewrite,
		moduleTransform,
		assetRules,
		pluginRegistry,
		generatedValidation,
		...capabilityOptions
	});
	const shared = !sourceMap && sharedArtifactResult(base, client, server);
	const manifest = withArtifactMetadata(base, entry.inputFile, {
		...entry,
		...(!shared ? { sharedFile: undefined } : {})
	});
	const clientMapFile = client.map ? sourceMapPathFor(entry.clientFile) : undefined;
	const serverMapFile = server.map ? sourceMapPathFor(entry.serverFile) : undefined;

	await mkdir(path.dirname(entry.clientFile), { recursive: true });
	await writeFile(
		entry.clientFile,
		shared
			? sharedArtifactFacade(base, entry.sharedFile, entry.clientFile)
			: clientMapFile
				? withSourceMappingUrl(client.code, path.basename(clientMapFile))
				: client.code
	);
	await writeFile(
		entry.serverFile,
		shared
			? sharedArtifactFacade(base, entry.sharedFile, entry.serverFile)
			: serverMapFile
				? withSourceMappingUrl(server.code, path.basename(serverMapFile))
				: server.code
	);
	if (shared) await writeFile(entry.sharedFile, shared.code);
	else await removeGeneratedArtifact(entry.sharedFile);
	if (clientMapFile && client.map)
		await writeFile(
			clientMapFile,
			`${JSON.stringify(withSourceMapFile(client.map, path.basename(entry.clientFile)), null, 2)}\n`
		);
	if (serverMapFile && server.map)
		await writeFile(
			serverMapFile,
			`${JSON.stringify(withSourceMapFile(server.map, path.basename(entry.serverFile)), null, 2)}\n`
		);
	await writeFile(entry.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

	return {
		inputFile: entry.inputFile,
		clientFile: entry.clientFile,
		serverFile: entry.serverFile,
		...(shared ? { sharedFile: entry.sharedFile } : {}),
		clientMapFile,
		serverMapFile,
		manifestFile: entry.manifestFile,
		client,
		server,
		...(shared ? { shared } : {}),
		manifest
	};
}

function sharedArtifactResult(
	manifest: ExactCompilerManifest,
	client: TransformResult,
	server: TransformResult
): TransformResult | undefined {
	if (
		client.code !== server.code ||
		manifest.assets.length ||
		manifest.boundaries.length ||
		Object.keys(manifest.serverActions).length ||
		manifest.components.some(
			(component) =>
				component.tasks.length || component.contexts.length || component.clientIslandCount
		) ||
		manifest.callables.some((callable) => callable.effect !== 'neutral') ||
		manifest.policy.subjects.some(
			(subject) => subject.policy.secret || subject.policy.residency !== 'isomorphic'
		) ||
		manifest.semanticGraph?.declarations.some(
			(declaration) => declaration.kind === 'import' && !declaration.typeOnly
		)
	)
		return undefined;
	return client;
}

async function removeGeneratedArtifact(filename: string): Promise<void> {
	try {
		await unlink(filename);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
}

function sharedArtifactFacade(
	manifest: ExactCompilerManifest,
	sharedFile: string,
	targetFile: string
): string {
	let specifier = path.relative(path.dirname(targetFile), sharedFile).replaceAll(path.sep, '/');
	if (!specifier.startsWith('.')) specifier = `./${specifier}`;
	const lines = [`export * from ${JSON.stringify(specifier)};`];
	if (manifest.exports.some((exported) => exported.name === 'default')) {
		lines.push(`export { default } from ${JSON.stringify(specifier)};`);
	}
	return `${lines.join('\n')}\n`;
}

/** Creates deterministic client/server artifact output paths for a set of inputs. */
export async function createExactArtifactPlan(
	inputs: readonly string[],
	options: ExactArtifactPlanOptions
): Promise<ExactArtifactPlan> {
	const files = await collectInputFiles(inputs);
	const rootDir = options.rootDir ?? commonRoot(files);
	return {
		rootDir,
		entries: files.map((inputFile) => ({
			inputFile,
			...artifactPathsFor(inputFile, options.outDir, rootDir)
		}))
	};
}

/** Compiles an artifact graph state useful for watch-mode bundler integrations. */
export async function createExactArtifactDevState(
	inputs: readonly string[],
	options: ExactArtifactDevStateOptions
): Promise<ExactArtifactDevState> {
	const plan = await createExactArtifactPlan(inputs, options);
	const compiled = await compileArtifactPlanEntries(plan.entries, {
		filename: (entry) => options.filename ?? entry.inputFile,
		importedManifests: options.importedManifests,
		serverComponents: options.serverComponents,
		session: options.session,
		pluginRegistry: options.pluginRegistry
	});
	const entries = compiled.map(artifactGraphEntryFromCompileResult);
	return {
		plan,
		entries,
		graph: createExactArtifactGraph(entries, options)
	};
}

/** Updates a watch-mode artifact graph by recompiling added and changed inputs only. */
export async function updateExactArtifactDevState(
	state: ExactArtifactDevState,
	inputs: readonly string[],
	changedInputs: readonly string[],
	options: ExactArtifactDevStateOptions
): Promise<ExactArtifactDevStateUpdate> {
	for (const changed of changedInputs) {
		let removed = false;
		try {
			await access(changed);
		} catch {
			removed = true;
		}
		if (options.session) options.session.invalidate(changed, removed);
		else invalidateExpressionModule(changed, removed);
	}
	const nextPlan = await createExactArtifactPlan(inputs, options);
	const diff = diffExactArtifactPlans(state.plan, nextPlan, {
		changedInputs: affectedArtifactInputs(state.entries, changedInputs)
	});
	const retainedManifestFiles = diff.retained.map((entry) => entry.manifestFile);
	const retainedEntries = retainedManifestFiles.length
		? await readExactArtifactManifestEntries(retainedManifestFiles)
		: [];
	const compiled = await compileArtifactPlanEntries([...diff.added, ...diff.changed], {
		filename: (entry) => options.filename ?? entry.inputFile,
		importedManifests: [
			...(options.importedManifests ?? []),
			...retainedEntries.map((entry) => entry.manifest)
		],
		serverComponents: options.serverComponents,
		session: options.session,
		pluginRegistry: options.pluginRegistry
	});
	const entries = [...retainedEntries, ...compiled.map(artifactGraphEntryFromCompileResult)].sort(
		(left, right) => left.inputFile.localeCompare(right.inputFile)
	);
	return {
		plan: nextPlan,
		entries,
		graph: createExactArtifactGraph(entries, options),
		diff,
		compiled
	};
}
