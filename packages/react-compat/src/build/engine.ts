import { rewriteModuleReferences, type ModuleExportReplacement } from '@exact/expressions';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
	createReactCompatPackageGraph,
	discoverReactCompatAdapters,
	replacementsForImporter,
	sourcePoliciesForImporter,
	unsupportedSourcesForImporter,
	type ReactCompatPackageGraph,
	type ResolvedReactCompatAdapters
} from '../adapters.js';
import { resolveReactCompatibility, type ReactCompatibilityOptions } from '../plugin.js';

import type {
	ReactCompatibilityBuildEngine,
	ReactCompatibilityDiagnostic,
	ReactCompatibilitySelection
} from './contracts.js';
import {
	containsCandidate,
	containsModule,
	discoverWatchFiles,
	fallbackDiagnostics,
	fileSignature,
	moduleReplacements,
	recordSelection,
	retainedDiagnostics,
	runtimeSourceExports
} from './transform-support.js';

type CachedDiscovery = {
	signature: string;
	registry: ResolvedReactCompatAdapters;
	graph: ReactCompatPackageGraph;
	/** Context-free replacements retained for hosts that only consume rewrite options. */
	replacements: readonly ModuleExportReplacement[];
	watchFiles: readonly string[];
	hash: string;
};

const discoveryCache = new Map<string, CachedDiscovery>();

export function createReactCompatibilityBuildEngine(
	options: ReactCompatibilityOptions = {}
): ReactCompatibilityBuildEngine {
	const buildRoot = path.resolve(options.cwd ?? process.cwd());
	const resolved = resolveReactCompatibility(options, buildRoot);
	if (!resolved) throw new Error('React compatibility build engine cannot be disabled');
	let invalidated = false;
	const usedAdapters = new Set<string>();
	const selections = new Map<string, ReactCompatibilitySelection>();
	const state = (): CachedDiscovery => {
		const existing = discoveryCache.get(buildRoot);
		if (!invalidated && existing && existing.signature === fileSignature(existing.watchFiles))
			return existing;
		invalidated = false;
		const graph = createReactCompatPackageGraph(buildRoot);
		const registry = discoverReactCompatAdapters(graph);
		const replacements = moduleReplacements([...registry.replacements.values()]);
		const watchFiles = discoverWatchFiles(buildRoot, graph, registry.adapters);
		const hash = createHash('sha256')
			.update(JSON.stringify(replacements))
			.digest('hex')
			.slice(0, 16);
		const next = {
			signature: fileSignature(watchFiles),
			registry,
			graph,
			replacements,
			watchFiles,
			hash
		};
		discoveryCache.set(buildRoot, next);
		return next;
	};
	const engine: ReactCompatibilityBuildEngine = {
		resolved,
		get rewriteOptions() {
			return Object.freeze({ moduleAliases: resolved.aliases, replacements: state().replacements });
		},
		get watchFiles() {
			return state().watchFiles;
		},
		get registryHash() {
			return state().hash;
		},
		transformModule(input) {
			const current = state();
			const resolvedReplacements = replacementsForImporter(
				current.graph,
				current.registry,
				input.id
			);
			const replacements = moduleReplacements(resolvedReplacements);
			const usedSourceExports = new Map<string, ReadonlySet<string>>();
			for (const sourceModule of new Set(resolvedReplacements.map((value) => value.sourceModule))) {
				usedSourceExports.set(
					sourceModule,
					new Set(runtimeSourceExports(input.source, input.id, sourceModule))
				);
			}
			const exclusiveDiagnostics: ReactCompatibilityDiagnostic[] = [];
			for (const policy of sourcePoliciesForImporter(current.graph, current.registry, input.id)) {
				if (policy.fallback !== 'error' || !containsModule(input.source, policy.sourceModule))
					continue;
				const allowed = new Set(
					resolvedReplacements
						.filter((replacement) => replacement.sourceModule === policy.sourceModule)
						.map((replacement) => replacement.sourceExport)
				);
				const unsupportedExports = runtimeSourceExports(
					input.source,
					input.id,
					policy.sourceModule
				).filter((sourceExport) => !allowed.has(sourceExport));
				if (!unsupportedExports.length) continue;
				const message =
					`Unsupported runtime ${policy.sourceModule} ${unsupportedExports.join(', ')} ` +
					`from ${policy.sourceLocation}@${policy.installedVersion} in ${input.id}; ` +
					`retaining it would mix compatibility authorities`;
				for (const sourceExport of unsupportedExports)
					recordSelection(selections, {
						importer: input.id,
						status: 'rejected',
						sourceModule: policy.sourceModule,
						sourceExport,
						sourceLocation: policy.sourceLocation,
						installedVersion: policy.installedVersion,
						adapterPackage: policy.adapterPackage,
						adapterVersion: policy.adapterVersion,
						reason: 'unsupported-export'
					});
				if (resolved.strict) throw new Error(message);
				exclusiveDiagnostics.push(
					...unsupportedExports.map((sourceExport) => ({
						severity: 'error' as const,
						code: 'unsupported-export' as const,
						message,
						moduleId: input.id,
						sourceModule: policy.sourceModule,
						sourceExport,
						sourceVersion: policy.installedVersion,
						adapterPackage: policy.adapterPackage,
						adapterVersion: policy.adapterVersion,
						replacementExport: '*',
						buildRoot
					}))
				);
			}
			const unsupported = unsupportedSourcesForImporter(
				current.graph,
				current.registry,
				input.id
			).filter((source) => containsModule(input.source, source.sourceModule));
			for (const source of unsupported) {
				const sourceExports = runtimeSourceExports(input.source, input.id, source.sourceModule);
				for (const sourceExport of sourceExports.length ? sourceExports : ['*'])
					recordSelection(selections, {
						importer: input.id,
						status: 'rejected',
						sourceModule: source.sourceModule,
						sourceExport,
						sourceLocation: source.sourceLocation,
						installedVersion: source.installedVersion,
						adapterPackage: source.adapterPackage,
						adapterVersion: source.adapterVersion,
						reason: 'unsupported-version'
					});
			}
			if (unsupported.length && resolved.strict) {
				const source = unsupported[0]!;
				throw new Error(
					`Unsupported React compatibility source ${source.sourceModule}@${source.installedVersion} ` +
						`resolved from ${source.sourceLocation} for importer ${input.id}; ` +
						`${source.adapterPackage}@${source.adapterVersion} supports ${source.supportedRanges.join(', ')}`
				);
			}
			const unsupportedDiagnostics: ReactCompatibilityDiagnostic[] = [
				...exclusiveDiagnostics,
				...unsupported.map((source) => ({
					severity: 'error' as const,
					code: 'unsupported-version' as const,
					message: `${source.sourceModule}@${source.installedVersion} is outside supported ranges ${source.supportedRanges.join(', ')}`,
					moduleId: input.id,
					sourceModule: source.sourceModule,
					sourceExport: '*',
					sourceVersion: source.installedVersion,
					adapterPackage: source.adapterPackage,
					adapterVersion: source.adapterVersion,
					replacementExport: '*',
					buildRoot
				}))
			];
			if (!containsCandidate(input.source, resolved.aliases, replacements)) {
				return Object.freeze({
					code: input.source,
					map: null,
					changed: false,
					watchFiles: current.watchFiles,
					dependencyIds: [],
					diagnostics: Object.freeze(unsupportedDiagnostics),
					registryHash: current.hash
				});
			}
			const diagnostics = [
				...unsupportedDiagnostics,
				...fallbackDiagnostics(input.id, input.source, resolvedReplacements, buildRoot)
			];
			const transformed = rewriteModuleReferences(input.source, {
				filename: input.id,
				moduleAliases: resolved.aliases,
				replacements,
				sourceMap: input.sourceMap ?? true
			});
			const dependencyIds = replacements
				.map((replacement) => replacement.targetModule)
				.filter(
					(value, index, values) =>
						values.indexOf(value) === index && containsModule(transformed.code, value)
				);
			for (const dependency of dependencyIds) {
				const adapter = [...current.registry.replacements.values()].find(
					(value) => value.specifier === dependency
				)?.adapterPackage;
				if (adapter) usedAdapters.add(adapter);
			}
			for (const replacement of resolvedReplacements) {
				const sourceExports = usedSourceExports.get(replacement.sourceModule);
				if (
					!sourceExports?.has(replacement.sourceExport) ||
					!containsModule(transformed.code, replacement.specifier)
				)
					continue;
				const installedVersion = current.graph.nodes.get(replacement.sourceInstance)?.manifest
					.version;
				recordSelection(selections, {
					importer: input.id,
					status: 'substituted',
					sourceModule: replacement.sourceModule,
					sourceExport: replacement.sourceExport,
					sourceLocation: replacement.sourceLocation,
					installedVersion: typeof installedVersion === 'string' ? installedVersion : 'unknown',
					adapterPackage: replacement.adapterPackage,
					adapterVersion: replacement.adapterVersion,
					targetModule: replacement.specifier,
					targetExport: replacement.export
				});
			}
			diagnostics.push(
				...retainedDiagnostics(input.id, transformed.code, current.registry, buildRoot)
			);
			return Object.freeze({
				code: transformed.code,
				map: transformed.map,
				changed: transformed.changed,
				watchFiles: current.watchFiles,
				dependencyIds: Object.freeze(dependencyIds),
				diagnostics: Object.freeze(diagnostics),
				registryHash: current.hash
			});
		},
		invalidate(file) {
			const current = discoveryCache.get(buildRoot);
			const normalized = path.resolve(file).toLowerCase();
			if (
				!current ||
				current.watchFiles.some((watch) => path.resolve(watch).toLowerCase() === normalized)
			) {
				invalidated = true;
				discoveryCache.delete(buildRoot);
			}
		},
		report() {
			const current = state();
			return Object.freeze({
				buildRoot,
				target: resolved.target,
				registryHash: current.hash,
				activeAdapters: current.registry.adapters,
				ignoredAdapters: current.registry.ignoredAdapters,
				unusedAdapters: Object.freeze(
					current.registry.adapters.filter((adapter) => !usedAdapters.has(adapter))
				),
				substitutions: Object.freeze(
					[...current.registry.replacements.values()].map((replacement) =>
						Object.freeze({
							sourceModule: replacement.sourceModule,
							sourceExport: replacement.sourceExport,
							sourceVersion: replacement.sourceVersion,
							adapterPackage: replacement.adapterPackage,
							adapterVersion: replacement.adapterVersion,
							targetModule: replacement.specifier,
							targetExport: replacement.export
						})
					)
				),
				selections: Object.freeze(
					[...selections.values()]
						.sort(
							(left, right) =>
								left.importer.localeCompare(right.importer) ||
								left.sourceModule.localeCompare(right.sourceModule) ||
								left.sourceExport.localeCompare(right.sourceExport)
						)
						.map((selection) => Object.freeze({ ...selection }))
				),
				unsupportedVersions: Object.freeze(
					current.registry.unsupportedSources.map((source) =>
						Object.freeze({
							sourceModule: source.sourceModule,
							sourceLocation: source.sourceLocation,
							installedVersion: source.installedVersion,
							supportedRanges: source.supportedRanges,
							adapterPackage: source.adapterPackage,
							adapterVersion: source.adapterVersion
						})
					)
				),
				watchFiles: current.watchFiles
			});
		}
	};
	return Object.freeze(engine);
}
