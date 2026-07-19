import {
	rewriteModuleReferences,
	type ModuleExportReplacement,
	type ModuleRewriteOptions
} from '@exact/expressions';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
	createReactCompatPackageGraph,
	discoverReactCompatAdapters,
	replacementsForImporter,
	sourcePoliciesForImporter,
	unsupportedSourcesForImporter,
	type ReactCompatPackageGraph,
	type ResolvedReactCompatAdapters
} from './adapters.js';
import {
	resolveReactCompatibility,
	type ReactCompatibilityOptions,
	type ResolvedReactCompatibility
} from './plugin.js';

export interface ReactCompatibilityBuildInput {
	readonly id: string;
	readonly source: string;
	readonly format: 'module' | 'commonjs';
	readonly target: 'client' | 'server';
	readonly sourceMap?: boolean;
}

export interface ReactCompatibilityDiagnostic {
	readonly severity: 'info' | 'warning' | 'error';
	readonly code:
		| 'dynamic-export-escape'
		| 'unsupported-commonjs'
		| 'compatibility-retained'
		| 'unsupported-version'
		| 'unsupported-export';
	readonly message: string;
	readonly moduleId: string;
	readonly sourceModule: string;
	readonly sourceExport: string;
	readonly sourceVersion: string;
	readonly adapterPackage: string;
	readonly adapterVersion: string;
	readonly replacementExport: string;
	readonly buildRoot: string;
}

export interface ReactCompatibilityTransformResult {
	readonly code: string;
	readonly map: unknown;
	readonly changed: boolean;
	readonly watchFiles: readonly string[];
	readonly dependencyIds: readonly string[];
	readonly diagnostics: readonly ReactCompatibilityDiagnostic[];
	readonly registryHash: string;
}

export interface ReactCompatibilityReport {
	readonly buildRoot: string;
	readonly target: 18 | 19;
	readonly registryHash: string;
	readonly activeAdapters: readonly string[];
	readonly ignoredAdapters: readonly string[];
	readonly unusedAdapters: readonly string[];
	readonly substitutions: readonly Readonly<{
		sourceModule: string;
		sourceExport: string;
		sourceVersion: string;
		adapterPackage: string;
		adapterVersion: string;
		targetModule: string;
		targetExport: string;
	}>[];
	/** Importer-specific decisions observed while transforming application modules. */
	readonly selections: readonly ReactCompatibilitySelection[];
	readonly unsupportedVersions: readonly Readonly<{
		sourceModule: string;
		sourceLocation: string;
		installedVersion: string;
		supportedRanges: readonly string[];
		adapterPackage: string;
		adapterVersion: string;
	}>[];
	readonly watchFiles: readonly string[];
}

export interface ReactCompatibilitySelection {
	readonly importer: string;
	readonly status: 'substituted' | 'rejected';
	readonly sourceModule: string;
	readonly sourceExport: string;
	readonly sourceLocation: string;
	readonly installedVersion: string;
	readonly adapterPackage: string;
	readonly adapterVersion: string;
	readonly targetModule?: string;
	readonly targetExport?: string;
	readonly reason?: 'unsupported-export' | 'unsupported-version';
}

export interface ReactCompatibilityBuildEngine {
	readonly resolved: ResolvedReactCompatibility;
	readonly rewriteOptions: ModuleRewriteOptions;
	readonly watchFiles: readonly string[];
	readonly registryHash: string;
	transformModule(input: ReactCompatibilityBuildInput): ReactCompatibilityTransformResult;
	invalidate(file: string): void;
	report(): ReactCompatibilityReport;
}

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

/** Shared discovery and module-rewrite engine used by every initial host. */
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

function recordSelection(
	selections: Map<string, ReactCompatibilitySelection>,
	selection: ReactCompatibilitySelection
): void {
	const key = [
		selection.importer,
		selection.status,
		selection.sourceLocation,
		selection.sourceModule,
		selection.sourceExport,
		selection.targetModule ?? '',
		selection.targetExport ?? '',
		selection.reason ?? ''
	].join('\0');
	selections.set(key, Object.freeze(selection));
}

function runtimeSourceExports(source: string, filename: string, sourceModule: string): string[] {
	const sourceFile = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(filename)
	);
	const exports = new Set<string>();
	const namespaces = new Set<string>();
	for (const statement of sourceFile.statements) {
		if (
			ts.isImportDeclaration(statement) &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === sourceModule &&
			!statement.importClause?.isTypeOnly
		) {
			const clause = statement.importClause;
			if (!clause) {
				exports.add('*');
				continue;
			}
			if (clause.name) exports.add('default');
			if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const element of clause.namedBindings.elements) {
					if (!element.isTypeOnly) exports.add(element.propertyName?.text ?? element.name.text);
				}
			} else if (clause.namedBindings) namespaces.add(clause.namedBindings.name.text);
		}
		if (
			ts.isExportDeclaration(statement) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === sourceModule &&
			!statement.isTypeOnly
		) {
			if (!statement.exportClause) exports.add('*');
			else if (ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements) {
					if (!element.isTypeOnly) exports.add(element.propertyName?.text ?? element.name.text);
				}
			} else exports.add('*');
		}
	}
	const visit = (node: ts.Node): void => {
		if (
			ts.isIdentifier(node) &&
			namespaces.has(node.text) &&
			!ts.isNamespaceImport(node.parent) &&
			!(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) &&
			!(ts.isElementAccessExpression(node.parent) && node.parent.expression === node)
		) {
			exports.add('*');
		}
		if (
			ts.isCallExpression(node) &&
			node.arguments.length &&
			ts.isStringLiteral(node.arguments[0]) &&
			node.arguments[0].text === sourceModule &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
		) {
			const parent = node.parent;
			if (ts.isPropertyAccessExpression(parent)) exports.add(parent.name.text);
			else if (
				ts.isElementAccessExpression(parent) &&
				parent.argumentExpression &&
				ts.isStringLiteral(parent.argumentExpression)
			) {
				exports.add(parent.argumentExpression.text);
			} else if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
				for (const element of parent.name.elements) {
					if (element.dotDotDotToken) exports.add('*');
					else if (
						element.propertyName &&
						(ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
					)
						exports.add(element.propertyName.text);
					else if (ts.isIdentifier(element.name)) exports.add(element.name.text);
				}
			} else exports.add('*');
		}
		if (
			(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
			ts.isIdentifier(node.expression) &&
			namespaces.has(node.expression.text)
		) {
			if (ts.isPropertyAccessExpression(node)) exports.add(node.name.text);
			else if (node.argumentExpression && ts.isStringLiteral(node.argumentExpression))
				exports.add(node.argumentExpression.text);
			else exports.add('*');
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return [...exports];
}

function scriptKind(filename: string): ts.ScriptKind {
	const clean = filename.split('?', 1)[0]!;
	if (/\.tsx$/i.test(clean)) return ts.ScriptKind.TSX;
	if (/\.jsx$/i.test(clean)) return ts.ScriptKind.JSX;
	if (/\.[cm]?js$/i.test(clean)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function moduleReplacements(
	values: readonly import('./adapters.js').ResolvedReactCompatReplacement[]
): readonly ModuleExportReplacement[] {
	return values.map((replacement) => ({
		sourceModule: replacement.sourceModule,
		sourceExport: replacement.sourceExport,
		targetModule: replacement.specifier,
		targetExport: replacement.export
	}));
}

function discoverWatchFiles(
	buildRoot: string,
	graph: ReturnType<typeof createReactCompatPackageGraph>,
	adapters: readonly string[]
): readonly string[] {
	const files = new Set<string>();
	const root = graph.nodes.get(graph.rootId);
	if (root) files.add(path.join(root.location, 'package.json'));
	for (const node of graph.nodes.values()) {
		if (typeof node.manifest.name === 'string' && adapters.includes(node.manifest.name))
			files.add(path.join(node.location, 'package.json'));
	}
	try {
		files.add(findUp(buildRoot, 'package-lock.json'));
	} catch {}
	return Object.freeze([...files].sort());
}

function fileSignature(files: readonly string[]): string {
	return files
		.map((file) => {
			try {
				const stat = statSync(file);
				return `${file}:${stat.size}:${stat.mtimeMs}`;
			} catch {
				return `${file}:missing`;
			}
		})
		.join('|');
}

function findUp(cwd: string, filename: string): string {
	let directory = path.resolve(cwd);
	while (true) {
		const candidate = path.join(directory, filename);
		try {
			readFileSync(candidate, 'utf8');
			return candidate;
		} catch {}
		const parent = path.dirname(directory);
		if (parent === directory) throw new Error(`${filename} was not found above ${cwd}`);
		directory = parent;
	}
}

function containsCandidate(
	source: string,
	aliases: Readonly<Record<string, string>>,
	replacements: readonly ModuleExportReplacement[]
): boolean {
	return [...Object.keys(aliases), ...replacements.map((value) => value.sourceModule)].some(
		(module) => containsModule(source, module)
	);
}

function containsModule(source: string, module: string): boolean {
	return source.includes(`"${module}"`) || source.includes(`'${module}'`);
}

function fallbackDiagnostics(
	moduleId: string,
	source: string,
	replacements: readonly import('./adapters.js').ResolvedReactCompatReplacement[],
	buildRoot: string
): ReactCompatibilityDiagnostic[] {
	const diagnostics: ReactCompatibilityDiagnostic[] = [];
	for (const replacement of replacements) {
		const sourceModule = replacement.sourceModule;
		const escaped = sourceModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (new RegExp(`\\bimport\\s*\\(\\s*["']${escaped}["']`).test(source))
			diagnostics.push({
				severity: 'warning',
				code: 'dynamic-export-escape',
				message: `Dynamic import of ${sourceModule} cannot select registered export replacements statically`,
				moduleId,
				sourceModule,
				sourceExport: replacement.sourceExport,
				sourceVersion: replacement.sourceVersion,
				adapterPackage: replacement.adapterPackage,
				adapterVersion: replacement.adapterVersion,
				replacementExport: replacement.export,
				buildRoot
			});
		if (
			new RegExp(`\\{[^}]*\\.\\.\\.[^}]*\\}\\s*=\\s*require\\(\\s*["']${escaped}["']`).test(source)
		)
			diagnostics.push({
				severity: 'warning',
				code: 'unsupported-commonjs',
				message: `Rest destructuring from ${sourceModule} remains on the compatibility source module`,
				moduleId,
				sourceModule,
				sourceExport: replacement.sourceExport,
				sourceVersion: replacement.sourceVersion,
				adapterPackage: replacement.adapterPackage,
				adapterVersion: replacement.adapterVersion,
				replacementExport: replacement.export,
				buildRoot
			});
	}
	return diagnostics;
}

function retainedDiagnostics(
	moduleId: string,
	code: string,
	registry: ResolvedReactCompatAdapters,
	buildRoot: string
): ReactCompatibilityDiagnostic[] {
	const diagnostics: ReactCompatibilityDiagnostic[] = [];
	for (const replacement of registry.replacements.values()) {
		if (!containsModule(code, replacement.sourceModule)) continue;
		diagnostics.push({
			severity: 'info',
			code: 'compatibility-retained',
			message: `${replacement.sourceModule} remains because this module has runtime uses outside the ${replacement.sourceExport} substitution`,
			moduleId,
			sourceModule: replacement.sourceModule,
			sourceExport: replacement.sourceExport,
			sourceVersion: replacement.sourceVersion,
			adapterPackage: replacement.adapterPackage,
			adapterVersion: replacement.adapterVersion,
			replacementExport: replacement.export,
			buildRoot
		});
	}
	return diagnostics;
}
