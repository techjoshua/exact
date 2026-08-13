import { rewriteModuleReferences, type ModuleExportReplacement } from '@exactjs/module-rewrite';
import type { PackageManifestLike } from '@exactjs/react-compat-adapter-api';
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
import {
	jsxSourceOwnership,
	resolveReactCompatibility,
	type ReactCompatibilityOptions,
	type ResolvedReactCompatibility
} from '../plugin.js';
import { readFileSync } from 'node:fs';

import type {
	ReactCompatibilityBuildEngine,
	ReactCompatibilityDiagnostic,
	ReactCompatibilityJsxInterop,
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
	const ownershipCache = new Map<string, 'exact' | 'component' | 'unknown' | 'ambiguous'>();
	const ownershipFiles = new Set<string>();
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
			return combinedWatchFiles(state().watchFiles, ownershipFiles);
		},
		get registryHash() {
			return state().hash;
		},
		get jsxInterop() {
			const current = state();
			return Object.freeze({
				adapterModule: '@exactjs/react-compat/exact' as const,
				adapterExport: 'adaptReactComponent' as const,
				cacheKey: `${resolved.target}:${current.hash}`,
				classify(candidate: Parameters<ReactCompatibilityJsxInterop['classify']>[0]) {
					for (const source of candidate.declarationSources)
						for (const filename of readableSourceCandidates(source)) ownershipFiles.add(filename);
					if (candidate.sourceModule.startsWith('.')) {
						for (const filename of readableSourceCandidates(
							path.resolve(path.dirname(candidate.importer), candidate.sourceModule)
						))
							ownershipFiles.add(filename);
					}
					const key = JSON.stringify([
						candidate.importer,
						candidate.sourceModule,
						candidate.localName,
						candidate.tagName,
						candidate.declarationSources,
						candidate.declarationSignatures,
						resolved.target,
						current.hash,
						fileSignature([...ownershipFiles])
					]);
					const cached = ownershipCache.get(key);
					if (cached) return cached;
					const ownership = classifyReactComponent(
						candidate.importer,
						candidate.sourceModule,
						candidate.declarationSources,
						candidate.declarationSignatures,
						resolved,
						current.graph
					);
					ownershipCache.set(key, ownership);
					return ownership;
				}
			});
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
					watchFiles: combinedWatchFiles(current.watchFiles, ownershipFiles),
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
				watchFiles: combinedWatchFiles(current.watchFiles, ownershipFiles),
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
				[...current.watchFiles, ...ownershipFiles].some(
					(watch) => path.resolve(watch).toLowerCase() === normalized
				)
			) {
				invalidated = true;
				discoveryCache.delete(buildRoot);
				ownershipCache.clear();
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
				watchFiles: combinedWatchFiles(current.watchFiles, ownershipFiles)
			});
		}
	};
	return Object.freeze(engine);
}

function classifyReactComponent(
	importer: string,
	sourceModule: string,
	declarationSources: readonly string[],
	declarationSignatures: readonly string[],
	resolved: ResolvedReactCompatibility,
	graph: ReactCompatPackageGraph
): 'exact' | 'component' | 'unknown' | 'ambiguous' {
	if (sourceModule === 'react' || sourceModule.startsWith('react/')) return 'component';
	const signatureOwnership = ownershipFromSignatures(declarationSignatures);
	if (signatureOwnership) return signatureOwnership;
	const packageName = barePackageName(sourceModule);
	const candidates = [
		...declarationSources,
		...(sourceModule.startsWith('.') ? [path.resolve(path.dirname(importer), sourceModule)] : [])
	];
	let sawExact = false;
	let sawReact = false;
	for (const candidate of candidates) {
		const normalized = candidate.replaceAll('\\', '/');
		if (/\/@types\/react(?:\/|$)/.test(normalized)) {
			sawReact = true;
			continue;
		}
		const source = readableSource(candidate);
		if (!source) continue;
		const ownership = jsxSourceOwnership(candidate, source, resolved);
		if (ownership === 'react') {
			sawReact = true;
			continue;
		}
		if (ownership === 'exact') {
			sawExact = true;
			continue;
		}
		if (hasReactRuntimeImport(source)) sawReact = true;
		if (
			/@exactjs\/(?:core|jsx)/.test(source) ||
			/\bthis\s*:\s*(?:import\([^)]*\)\.)?Component\b/.test(source)
		)
			sawExact = true;
		const reexportOwnership = ownershipFromStaticReexports(candidate, source, resolved, graph);
		if (reexportOwnership === 'component') sawReact = true;
		else if (reexportOwnership === 'exact') sawExact = true;
		else if (reexportOwnership === 'ambiguous') {
			sawReact = true;
			sawExact = true;
		}
	}
	if (sawReact && sawExact) return 'ambiguous';
	if (sawReact) return 'component';
	if (sawExact) return 'exact';
	const manifest = packageName
		? [...graph.nodes.values()].find((node) => node.manifest.name === packageName)?.manifest
		: undefined;
	if (manifest) {
		const packageUsesReact = manifestUsesReact(manifest);
		const packageUsesExact = manifestUsesExact(manifest);
		if (packageUsesReact && packageUsesExact) return 'ambiguous';
		if (packageUsesReact) return 'component';
		if (packageUsesExact) return 'exact';
	}
	return 'unknown';
}

function ownershipFromSignatures(
	signatures: readonly string[]
): 'exact' | 'component' | 'ambiguous' | undefined {
	const exact = signatures.some(
		(signature) =>
			/\bthis\s*:\s*(?:import\([^)]*\)\.)?Component\b/.test(signature) ||
			/\b(?:Async)?ComponentFunction\b/.test(signature)
	);
	const react = signatures.some(
		(signature) =>
			/\bReact(?:Element|Node)\b/.test(signature) ||
			/\b(?:FunctionComponent|ComponentClass|FC)\s*</.test(signature)
	);
	if (exact && react) return 'ambiguous';
	if (exact) return 'exact';
	return react ? 'component' : undefined;
}

function barePackageName(specifier: string): string | undefined {
	if (specifier.startsWith('.') || specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier))
		return undefined;
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function manifestUsesReact(manifest: PackageManifestLike): boolean {
	const fields = [manifest.peerDependencies, manifest.dependencies, manifest.optionalDependencies];
	return fields.some((field) => typeof field === 'object' && field !== null && 'react' in field);
}

function manifestUsesExact(manifest: PackageManifestLike): boolean {
	const fields = [manifest.peerDependencies, manifest.dependencies, manifest.optionalDependencies];
	return fields.some(
		(field) =>
			typeof field === 'object' &&
			field !== null &&
			('@exactjs/core' in field || '@exactjs/jsx' in field)
	);
}

function readableSourceCandidates(filename: string): string[] {
	if (/\.d\.[cm]?ts$/i.test(filename)) return [filename];
	const extension = path.extname(filename).toLowerCase();
	if (extension === '.js' || extension === '.jsx' || extension === '.mjs' || extension === '.cjs') {
		const stem = filename.slice(0, -extension.length);
		const prefix = extension === '.mjs' ? 'm' : extension === '.cjs' ? 'c' : '';
		// TypeScript applications commonly author an emitted JavaScript extension in source imports.
		// Inspect the matching source file before the not-yet-emitted path so ownership remains native.
		return [`${stem}.${prefix}tsx`, `${stem}.${prefix}ts`, filename];
	}
	return /\.[cm]?[jt]sx?$/i.test(filename)
		? [filename]
		: [
				filename,
				`${filename}.tsx`,
				`${filename}.ts`,
				`${filename}.jsx`,
				`${filename}.js`,
				path.join(filename, 'index.tsx'),
				path.join(filename, 'index.ts')
			];
}

function readableSource(filename: string): string | undefined {
	const candidates = readableSourceCandidates(filename);
	for (const candidate of candidates) {
		try {
			return readFileSync(candidate, 'utf8');
		} catch {}
	}
	return undefined;
}

function hasReactRuntimeImport(source: string): boolean {
	return /\b(?:from\s*|import\s*\()\s*['"]react(?:\/[^'"]*)?['"]/.test(source);
}

function ownershipFromStaticReexports(
	filename: string,
	source: string,
	resolved: ResolvedReactCompatibility,
	graph: ReactCompatPackageGraph,
	visited = new Set<string>()
): 'exact' | 'component' | 'ambiguous' | undefined {
	const identity = path.resolve(filename);
	if (visited.has(identity)) return undefined;
	visited.add(identity);
	const ownerships: Array<'exact' | 'component' | 'ambiguous'> = [];
	for (const match of source.matchAll(/\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g)) {
		const specifier = match[1]!;
		if (specifier === 'react' || specifier.startsWith('react/')) {
			ownerships.push('component');
			continue;
		}
		if (specifier.startsWith('.')) {
			const target = path.resolve(path.dirname(identity), specifier);
			const targetSource = readableSource(target);
			if (!targetSource) continue;
			const direct = jsxSourceOwnership(target, targetSource, resolved);
			if (direct === 'react') ownerships.push('component');
			else if (direct === 'exact') ownerships.push('exact');
			else {
				const nested = ownershipFromStaticReexports(target, targetSource, resolved, graph, visited);
				if (nested) ownerships.push(nested);
			}
			continue;
		}
		const packageName = barePackageName(specifier);
		const manifest = packageName
			? [...graph.nodes.values()].find((node) => node.manifest.name === packageName)?.manifest
			: undefined;
		if (!manifest) continue;
		const react = manifestUsesReact(manifest);
		const exact = manifestUsesExact(manifest);
		if (react && exact) ownerships.push('ambiguous');
		else if (react) ownerships.push('component');
		else if (exact) ownerships.push('exact');
	}
	const sawReact = ownerships.some((value) => value === 'component' || value === 'ambiguous');
	const sawExact = ownerships.some((value) => value === 'exact' || value === 'ambiguous');
	if (sawReact && sawExact) return 'ambiguous';
	if (sawReact) return 'component';
	return sawExact ? 'exact' : undefined;
}

function combinedWatchFiles(
	base: readonly string[],
	ownership: ReadonlySet<string>
): readonly string[] {
	return Object.freeze([...new Set([...base, ...ownership])].sort());
}
