import {
	ExpressionProjectError,
	rewriteModule,
	rewriteModuleReferences,
	type BoundModule,
	type ModuleRewriteOptions
} from '@exact/expressions';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { analyzeExactAnnotations } from '../annotations.js';
import {
	artifactGraphEntryFromCompileResult,
	createExactArtifactGraph,
	diffExactArtifactPlans,
	discoverExactPackageManifests,
	readExactArtifactManifestEntries
} from '../artifacts.js';
import { analyzeModuleImports } from '../assets.js';
import { analyzeCallableEffects } from '../analysis/callable-effects.js';
import { collectRawHtmlCapabilities } from '../capabilities.js';
import { exactComponentDescriptorTransformer } from '../descriptor-transform.js';
import { collectExpressionExportBindings } from '../exports.js';
import { analyzeExpressionComponents } from '../expression/analysis.js';
import {
	createExpressionComponentBoundaries,
	createExpressionGeneratedServerSlotBoundaries,
	createExpressionRenderEdges
} from '../expression/boundaries.js';
import { analyzeExpressionDerived } from '../expression/derived.js';
import { analyzeExpressionJsx } from '../expression/jsx.js';
import { createExpressionComponents } from '../expression/manifest.js';
import type { ExactCompilerSession } from '../expression/project.js';
import { analyzeExpressionSafety } from '../expression/safety.js';
import {
	expressionDependencyFiles,
	expressionModuleFor,
	invalidateExpressionModule
} from '../expression/session.js';
import { analyzeExpressionTasks } from '../expression/task-analysis.js';
import { analyzeExpressionWrites } from '../expression/writes.js';
import { collectExpressionImportedComponents } from '../imports.js';
import { exactJsxTransformer } from '../transform/jsx/transformer.js';
import { parseExactCompilerManifest } from '../manifest-parse.js';
import {
	artifactPathsFor,
	collectInputFiles,
	commonRoot,
	manifestPathFor,
	outputPathFor,
	withArtifactMetadata
} from '../paths.js';
import { combinePlacements } from '../placement.js';
import { applyCompilerPlugins, validateImportedPluginRegistries } from '../plugins.js';
import {
	analyzeExactPolicyMetadata,
	applyExactPolicyToCallables,
	applyExactPolicyToTasks,
	createExactPolicyManifest,
	createExactSecretQualificationPlan
} from '../policy/analysis.js';
import { preprocessPropPunning } from '../preprocess.js';
import { buildExactProvenance } from '../provenance.js';
import { exactSecretQualificationTransformer } from '../secret-transform.js';
import { buildExpressionSemanticGraph } from '../semantic.js';
import {
	createLineSourceMap,
	sourceMapPathFor,
	withSourceMapFile,
	withSourceMappingUrl
} from '../source-maps.js';
import {
	createClientIslandBoundaries,
	createClientIslandSymbols,
	createRootSymbols,
	createServerPartSymbols,
	createValueRootSymbols
} from '../symbols.js';
import type {
	CompileArtifactPlanEntriesOptions,
	CompileArtifactsOptions,
	CompileArtifactsResult,
	CompileFileOptions,
	CompileFileResult,
	CompileProjectOptions,
	ExactArtifactDevState,
	ExactArtifactDevStateOptions,
	ExactArtifactDevStateUpdate,
	ExactArtifactPlan,
	ExactArtifactPlanEntry,
	ExactArtifactPlanOptions,
	ExactBoundaryIR,
	ExactCompilerManifest,
	ExactComponentIR,
	ExactExportIR,
	ExactImportedComponentIR,
	ExactRawHtmlCapabilityIR,
	ExactSemanticGraphIR,
	ExactSymbolIR,
	TransformOptions,
	TransformResult,
	TransformTarget
} from '../types.js';
import { exactCompilerManifestVersion } from '../versions.js';

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

type CapabilityCompilationOptions = Pick<
	TransformOptions,
	'packageType' | 'packageName' | 'capabilityPolicy'
>;

function capabilityCompilationOptions(
	options: CapabilityCompilationOptions & Pick<TransformOptions, 'pluginRegistry'>
): CapabilityCompilationOptions {
	const configuredPackages = secretPackagesFromPluginRegistry(options.pluginRegistry);
	const capabilityPolicy =
		configuredPackages && !options.capabilityPolicy?.secrets
			? {
					...options.capabilityPolicy,
					secrets: { allowPackages: configuredPackages }
				}
			: options.capabilityPolicy;
	return {
		packageType: options.packageType,
		packageName: options.packageName,
		capabilityPolicy
	};
}

function secretPackagesFromPluginRegistry(
	registry: TransformOptions['pluginRegistry']
): readonly string[] | undefined {
	const cacheKey = registry?.plugins['@exact/secrets']?.cacheKey;
	if (!cacheKey || typeof cacheKey !== 'object' || Array.isArray(cacheKey)) return undefined;
	const allowPackages = (cacheKey as Record<string, unknown>).allowPackages;
	return Array.isArray(allowPackages) &&
		allowPackages.every((packageName) => typeof packageName === 'string' && packageName.length)
		? allowPackages
		: undefined;
}

/** Analyzes generic dependencies and overlays eXact reactive provenance. */
export function analyzeReactiveProvenance(source: string, options: TransformOptions = {}) {
	const filename = options.filename ?? 'input.tsx';
	return buildExactProvenance(
		sessionExpressionModule(options.session, filename, preprocessPropPunning(source), {
			root: options.root
		})
	);
}

/** Transforms eXact TSX/JSX source and returns only the generated code. */
export function transform(source: string, options: TransformOptions = {}): string {
	return transformSource(source, options).code;
}

/** Transforms eXact TSX/JSX source into code, source map metadata, and compiler manifest. */
export function transformSource(source: string, options: TransformOptions = {}): TransformResult {
	const normalized = preprocessPropPunning(source);
	const filename = options.filename ?? 'input.tsx';
	const virtual = !path.isAbsolute(filename);
	const importedManifests = validatedImportedManifests(
		options.importedManifests,
		options.pluginRegistry
	);
	const target = options.target ?? 'default';
	const expressionModule = sessionExpressionModule(options.session, filename, normalized, {
		root: options.root,
		virtual,
		diagnostics: options.generatedValidation === 'semantic' ? 'full' : 'syntax'
	});
	const syntaxDiagnostics = expressionModule.diagnostics.filter(
		(diagnostic) => diagnostic.phase === 'syntax' && diagnostic.severity === 'error'
	);
	if (syntaxDiagnostics.length) {
		throw new Error(
			syntaxDiagnostics
				.map((diagnostic) => {
					const location = diagnostic.span
						? `:${diagnostic.span.line}:${diagnostic.span.column}`
						: '';
					return `${diagnostic.filename ?? filename}${location} - ${diagnostic.message}`;
				})
				.join('\n')
		);
	}
	const sourceFile = ts.createSourceFile(
		filename,
		normalized,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TSX
	);
	const annotations = analyzeExactAnnotations(expressionModule);
	throwLocatedCompilerDiagnostics(filename, sourceFile, annotations.diagnostics);
	const manifest = analyzeSource(normalized, {
		filename,
		root: options.root,
		session: options.session,
		importedManifests,
		target,
		assetRules: options.assetRules,
		pluginRegistry: options.pluginRegistry,
		generatedValidation: options.generatedValidation,
		packageType: options.packageType,
		packageName: options.packageName,
		capabilityPolicy: options.capabilityPolicy
	});
	const pluginErrors = manifest.diagnostics.filter((diagnostic) => /^error: \[@/.test(diagnostic));
	if (pluginErrors.length) throw new Error(pluginErrors.join('\n'));
	const semanticGraph = buildExpressionSemanticGraph(expressionModule);
	const provenance = buildExactProvenance(expressionModule);
	const expressionDerived = analyzeExpressionDerived(expressionModule, provenance);
	const expressionWrites = analyzeExpressionWrites(expressionModule);
	const moduleImports = analyzeModuleImports(normalized, filename, options.assetRules);
	const policyMetadata = analyzeExactPolicyMetadata(expressionModule, importedManifests);
	const secretQualifications = createExactSecretQualificationPlan(expressionModule, policyMetadata);
	const callableEffects = applyExactPolicyToCallables(
		policyMetadata,
		analyzeCallableEffects(
			expressionModule,
			semanticGraph,
			importedManifests,
			expressionWrites,
			moduleImports,
			policyMetadata.contextCallEffects
		)
	).callables;
	const expressionTasks = applyExactPolicyToTasks(
		policyMetadata,
		analyzeExpressionTasks(expressionModule, callableEffects)
	).tasks;
	const taskErrors = expressionTasks.diagnostics.filter((diagnostic) =>
		diagnostic.startsWith('error:')
	);
	if (taskErrors.length) {
		throw new Error(
			taskErrors
				.map((message) => {
					const start = expressionTasks.diagnosticLocations.find(
						(candidate) => candidate.message === message
					)?.start;
					if (start === undefined) return `${filename} - ${message}`;
					const location = sourceFile.getLineAndCharacterOfPosition(start);
					return `${filename}:${location.line + 1}:${location.character + 1} - ${message}`;
				})
				.join('\n')
		);
	}
	const semanticErrors = manifest.diagnostics.filter((diagnostic) =>
		diagnostic.startsWith('error:')
	);
	if (semanticErrors.length) {
		throw new Error(semanticErrors.map((message) => `${filename} - ${message}`).join('\n'));
	}
	const expressionJsx = analyzeExpressionJsx(expressionModule, provenance, filename);
	throwLocatedCompilerDiagnostics(filename, sourceFile, expressionJsx.diagnostics);
	const expressionComponents = analyzeExpressionComponents(
		expressionModule,
		expressionJsx,
		expressionTasks,
		provenance,
		expressionWrites,
		callableEffects
	);
	const emissionComponentInfo = new Map<string, ExactImportedComponentIR>();
	for (const component of collectExpressionImportedComponents(
		filename,
		importedManifests,
		semanticGraph
	))
		emissionComponentInfo.set(component.name, component);
	for (const component of manifest.components)
		emissionComponentInfo.set(component.name, {
			name: component.name,
			boundaryName: component.name,
			placement: component.placement,
			componentId: component.id
		});
	const result = ts.transform(sourceFile, [
		exactJsxTransformer(
			expressionModule,
			filename,
			target,
			options.serverComponents ?? false,
			semanticGraph,
			expressionDerived,
			expressionWrites,
			expressionTasks,
			expressionJsx,
			expressionComponents,
			emissionComponentInfo,
			callableEffects,
			moduleImports,
			options.preserveClientAssetImports ?? false
		),
		exactComponentDescriptorTransformer(
			manifest,
			target,
			options.preserveComponentHoisting ?? false
		),
		exactSecretQualificationTransformer(secretQualifications)
	]);
	const transformed = result.transformed[0]!;
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const printed = emitExpressionRewrite(
		expressionModule,
		printer.printFile(transformed as ts.SourceFile),
		options.root,
		virtual,
		options.session,
		options.generatedValidation ?? 'syntax'
	);
	result.dispose();
	validateTargetAnalysis(callableEffects, target, filename);
	const output = options.moduleTransform
		? options.moduleTransform({ id: filename, source: printed, target }).code
		: options.moduleRewrite
			? rewriteModuleReferences(printed, { ...options.moduleRewrite, filename, sourceMap: false })
					.code
			: printed;
	return {
		code: output,
		map: options.sourceMap ? createLineSourceMap(filename, normalized, output) : null,
		filename,
		manifest
	};
}

function validateTargetAnalysis(
	effects: ReturnType<typeof analyzeCallableEffects>,
	target: TransformTarget,
	filename: string
): void {
	if (target === 'default') return;
	const forbidden = target === 'client' ? 'server' : 'browser';
	const violation = effects.callables
		.filter((callable) => callable.artifactTargets.includes(target))
		.flatMap((callable) => callable.effectSources.map((source) => ({ callable, source })))
		.find((candidate) => candidate.source.environment === forbidden);
	if (violation) {
		throw new Error(
			`${filename} - error: ${target} artifact retained ${forbidden}-only dependency (${violation.source.path.join(' → ')})`
		);
	}
	const byId = new Map(effects.callables.map((callable) => [callable.id, callable]));
	for (const caller of effects.callables.filter((callable) =>
		callable.artifactTargets.includes(target)
	))
		for (const edge of caller.calls) {
			const callee = edge.targetId ? byId.get(edge.targetId) : undefined;
			if (callee && !callee.artifactTargets.includes(target)) {
				throw new Error(
					`${filename} - error: ${target} artifact graph retains ${caller.name} → ${callee.name}, but ${callee.name} is omitted`
				);
			}
		}
}

function emitExpressionRewrite(
	module: BoundModule,
	generated: string,
	root: string | undefined,
	virtual: boolean,
	session: ExactCompilerSession | undefined,
	validation: 'syntax' | 'semantic'
): string {
	const rewritten = rewriteModule(module, (rewriter) => {
		rewriter.replaceTextWhere(
			(reference) => reference.node === module.rootNode,
			() => generated
		);
	});
	const structuralErrors = rewritten
		.validate()
		.filter((diagnostic) => diagnostic.severity === 'error');
	if (structuralErrors.length) throw new ExpressionProjectError(structuralErrors);

	const emitted = rewritten.emit().code;
	if (validation === 'syntax') {
		const sourceFile = ts.createSourceFile(
			`${module.filename}.exact.generated.tsx`,
			emitted,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX
		);
		const diagnostics =
			(sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
				.parseDiagnostics ?? [];
		if (diagnostics.length) {
			throw new ExpressionProjectError(
				diagnostics.map((diagnostic) => ({
					...diagnosticFromTypeScript(diagnostic),
					phase: 'syntax' as const
				}))
			);
		}
		return emitted;
	}

	const rebound = sessionExpressionModule(
		session,
		`${module.filename}.exact.generated.tsx`,
		emitted,
		{
			root,
			virtual,
			diagnostics: 'full'
		}
	);
	const baselineErrors = module.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
	const existing = new Map<string, number>();
	for (const diagnostic of baselineErrors) {
		const key = diagnosticIdentity(diagnostic, module.source);
		existing.set(key, (existing.get(key) ?? 0) + 1);
	}
	const introduced = rebound.diagnostics.filter((diagnostic) => {
		if (diagnostic.severity !== 'error') return false;
		const key = diagnosticIdentity(diagnostic, rebound.source);
		const count = existing.get(key) ?? 0;
		if (count) {
			existing.set(key, count - 1);
			return false;
		}
		return !isSyntheticHelperDiagnostic(diagnostic, rebound.source, module.source);
	});
	if (introduced.length) throw new ExpressionProjectError(introduced);
	return rebound.emit().code;
}

function diagnosticFromTypeScript(diagnostic: ts.Diagnostic): {
	code: string;
	message: string;
	severity: 'error' | 'warning';
	filename?: string;
	span?: { start: number; end: number; line: number; column: number };
} {
	const source = diagnostic.file;
	const start = diagnostic.start;
	const location =
		source && start !== undefined ? source.getLineAndCharacterOfPosition(start) : undefined;
	return {
		code: `TS${diagnostic.code}`,
		message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
		filename: source?.fileName,
		span:
			start === undefined || !location
				? undefined
				: {
						start,
						end: start + (diagnostic.length ?? 0),
						line: location.line + 1,
						column: location.character + 1
					}
	};
}

function throwLocatedCompilerDiagnostics(
	filename: string,
	sourceFile: ts.SourceFile,
	diagnostics: readonly Readonly<{ message: string; start: number }>[]
): void {
	const errors = diagnostics.filter((diagnostic) => diagnostic.message.startsWith('error:'));
	if (!errors.length) return;
	throw new Error(
		errors
			.map((diagnostic) => {
				const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
				return `${filename}:${location.line + 1}:${location.character + 1} - ${diagnostic.message}`;
			})
			.join('\n')
	);
}

function diagnosticIdentity(
	diagnostic: { code: string; message: string; span?: { start: number; end: number } },
	source: string
): string {
	if (!diagnostic.span) return `${diagnostic.code}:${diagnostic.message}:<global>`;
	const lineStart = source.lastIndexOf('\n', diagnostic.span.start) + 1;
	const lineEnd = source.indexOf('\n', diagnostic.span.end);
	const line = source
		.slice(lineStart, lineEnd < 0 ? source.length : lineEnd)
		.trim()
		.replace(/\s+/g, ' ');
	const token = source.slice(diagnostic.span.start, diagnostic.span.end);
	return `${diagnostic.code}:${diagnostic.message}:${token}:${line}`;
}

function isSyntheticHelperDiagnostic(
	diagnostic: { code: string; span?: { start: number; end: number } },
	source: string,
	originalSource: string
): boolean {
	if (!diagnostic.span) return false;
	const token = source.slice(diagnostic.span.start, diagnostic.span.end);
	const lineStart = source.lastIndexOf('\n', diagnostic.span.start) + 1;
	const lineEnd = source.indexOf('\n', diagnostic.span.end);
	const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
	// Only compiler-reserved bindings/imports may suppress diagnostics. Author
	// code with the same diagnostic code remains visible at its own location.
	const normalizedLine = line.trim().replace(/\s+/g, ' ');
	const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
	const originalOccurrences = originalSource
		.split(/\r?\n/)
		.filter((original) => normalize(original) === normalizedLine).length;
	const generatedOccurrences = source
		.split(/\r?\n/)
		.filter((generated) => normalize(generated) === normalizedLine).length;
	const retained = originalOccurrences > 0 && generatedOccurrences <= originalOccurrences;
	return (
		/^__exact/.test(token) ||
		(/^\s*import\b/.test(line) && /\b__exact[A-Za-z0-9_$]*\b/.test(line)) ||
		/\b__exact[A-Za-z0-9_$]*\b/.test(line) ||
		!retained
	);
}

/** Analyzes source into the compiler manifest without emitting transformed code. */
export function analyzeSource(
	source: string,
	options: TransformOptions = {}
): ExactCompilerManifest {
	const normalized = preprocessPropPunning(source);
	const policyOptions = { ...options, ...capabilityCompilationOptions(options) };
	const filename = options.filename ?? 'input.tsx';
	const sourceFile = ts.createSourceFile(
		filename,
		normalized,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TSX
	);
	const importedManifests = validatedImportedManifests(
		options.importedManifests,
		options.pluginRegistry
	);
	const expressionModule = sessionExpressionModule(options.session, filename, normalized, {
		root: options.root,
		diagnostics: options.generatedValidation === 'semantic' ? 'full' : 'syntax'
	});
	const exports: ExactExportIR[] = [];
	const symbols: ExactSymbolIR[] = [];
	const boundaries: ExactBoundaryIR[] = [];
	const manifestDiagnostics: string[] = [];
	const serverActions: ExactCompilerManifest['serverActions'] = {};
	const semanticGraph = buildExpressionSemanticGraph(expressionModule);
	const provenance = buildExactProvenance(expressionModule);
	const expressionSafety = analyzeExpressionSafety(expressionModule, provenance);
	const expressionWrites = analyzeExpressionWrites(expressionModule);
	const moduleImports = analyzeModuleImports(normalized, filename, options.assetRules);
	const policyMetadata = analyzeExactPolicyMetadata(expressionModule, importedManifests);
	const rawCallableEffects = analyzeCallableEffects(
		expressionModule,
		semanticGraph,
		importedManifests,
		expressionWrites,
		moduleImports,
		policyMetadata.contextCallEffects
	);
	const rawHtmlRequirements = collectRawHtmlCapabilities(
		sourceFile,
		filename,
		options.target ?? 'default'
	);
	manifestDiagnostics.push(...moduleImports.diagnostics);
	manifestDiagnostics.push(
		...rawHtmlCapabilityDiagnostics(rawHtmlRequirements, importedManifests, policyOptions)
	);
	for (const initializer of rawCallableEffects.callables.filter(
		(callable) => callable.kind === 'module-initializer'
	)) {
		if (initializer.effect === 'mixed')
			manifestDiagnostics.push(
				`error: executable module initializer has indivisible browser and server effects (${effectDiagnosticPath(initializer, 'mixed')})`
			);
		if (initializer.effect === 'unknown')
			manifestDiagnostics.push(
				`error: executable module initializer depends on an opaque call or side-effect import (${effectDiagnosticPath(initializer, 'unknown')})`
			);
	}
	const callablePolicyResult = applyExactPolicyToCallables(policyMetadata, rawCallableEffects);
	const callableEffects = callablePolicyResult.callables;
	manifestDiagnostics.push(...callablePolicyResult.diagnostics);
	const expressionTasks = applyExactPolicyToTasks(
		policyMetadata,
		analyzeExpressionTasks(expressionModule, callableEffects)
	).tasks;
	manifestDiagnostics.push(...expressionTasks.diagnostics);
	manifestDiagnostics.push(
		...analyzeExactAnnotations(expressionModule).diagnostics.map((diagnostic) => diagnostic.message)
	);
	const expressionJsx = analyzeExpressionJsx(expressionModule, provenance, filename);
	manifestDiagnostics.push(...expressionJsx.diagnostics.map((diagnostic) => diagnostic.message));
	const expressionComponents = analyzeExpressionComponents(
		expressionModule,
		expressionJsx,
		expressionTasks,
		provenance,
		expressionWrites,
		callableEffects
	);
	const components: ExactComponentIR[] = createExpressionComponents(
		filename,
		expressionComponents,
		expressionTasks,
		expressionSafety
	);

	const componentByName = new Map(components.map((component) => [component.name, component]));
	const importedComponents = collectExpressionImportedComponents(
		filename,
		importedManifests,
		semanticGraph
	);
	const componentInfo = new Map<string, ExactImportedComponentIR>();
	for (const component of importedComponents) componentInfo.set(component.name, component);
	for (const component of components) {
		componentInfo.set(component.name, {
			name: component.name,
			boundaryName: component.name,
			placement: component.placement,
			componentId: component.id
		});
	}
	for (const component of components) {
		const expressionComponent = expressionComponents.sites.get(component.name);
		component.renderEdges = createExpressionRenderEdges(
			filename,
			component.name,
			expressionComponent?.renders ?? [],
			componentInfo
		);
		component.subgraphPlacement = combinePlacements([
			component.placement,
			...component.renderEdges.map((edge) => edge.placement)
		]);
	}
	const exportBindings = collectExpressionExportBindings(semanticGraph);
	const exportedLocals = new Set([...exportBindings.values()].map((binding) => binding.localName));
	for (const component of components) {
		component.exported = exportedLocals.has(component.name);
	}
	for (const binding of [...exportBindings.values()].sort((left, right) =>
		left.exportedName.localeCompare(right.exportedName)
	)) {
		const component = componentByName.get(binding.localName);
		const callable = callableEffects.callables.find((candidate) =>
			candidate.exportNames.includes(binding.exportedName)
		);
		const dataPolicy = policyMetadata.namedDeclarationPolicies.get(binding.localName)?.policy;
		exports.push({
			name: binding.exportedName,
			kind: component ? 'component' : 'value',
			placement:
				component?.placement ??
				(dataPolicy?.residency === 'client'
					? 'client'
					: dataPolicy?.residency === 'server'
						? 'server'
						: callable?.effect === 'browser' ||
							  (callable?.artifactTargets.length === 1 && callable.artifactTargets[0] === 'client')
							? 'client'
							: callable?.effect === 'server' ||
								  (callable?.artifactTargets.length === 1 &&
										callable.artifactTargets[0] === 'server')
								? 'server'
								: callable?.effect === 'neutral'
									? 'isomorphic'
									: 'unknown')
		});
	}
	symbols.push(...createRootSymbols(filename, components, [...exportBindings.values()]));
	const componentExportNames = new Set(
		exports.filter((exported) => exported.kind === 'component').map((exported) => exported.name)
	);
	symbols.push(
		...createValueRootSymbols(
			filename,
			callableEffects.callables.map((callable) => ({
				...callable,
				exportNames: callable.exportNames.filter((name) => !componentExportNames.has(name))
			}))
		)
	);
	symbols.push(...createServerPartSymbols(filename, components));
	symbols.push(...createClientIslandSymbols(filename, components));
	boundaries.push(...createClientIslandBoundaries(filename, components));
	boundaries.push(
		...createExpressionGeneratedServerSlotBoundaries(
			filename,
			components,
			expressionComponents,
			componentInfo
		)
	);
	boundaries.push(
		...createExpressionComponentBoundaries(
			filename,
			components,
			expressionComponents,
			componentInfo
		)
	);

	for (const component of components) {
		for (const task of component.tasks) {
			if (task.placement === 'server' || task.placement === 'isomorphic') {
				// Server action IDs become endpoint-dispatch keys, so duplicate IDs must
				// fail during compilation instead of letting later entries overwrite earlier ones.
				if (serverActions[task.id]) {
					throw new Error(`Duplicate eXact server action id generated: ${task.id}`);
				}
				serverActions[task.id] = {
					id: task.id,
					componentId: component.id,
					taskId: task.id,
					placement: task.placement,
					stateContract: {
						reads: task.reads,
						writes: task.writes
					},
					contextContract: task.contexts
				};
			}
		}
		manifestDiagnostics.push(...component.diagnostics);
	}
	const policyResult = createExactPolicyManifest(
		filename,
		policyMetadata,
		components,
		expressionComponents,
		expressionTasks,
		expressionModule,
		policyOptions
	);
	manifestDiagnostics.push(...policyResult.diagnostics);
	manifestDiagnostics.push(
		...importedSecretRequirementDiagnostics(importedManifests, policyOptions)
	);

	assertUniqueIds(
		'component',
		components.map((component) => component.id)
	);
	assertUniqueIds(
		'symbol',
		symbols.map((symbol) => symbol.id)
	);
	assertUniqueIds(
		'boundary',
		boundaries.map((boundary) => boundary.id)
	);
	assertUniqueIds(
		'callable',
		callableEffects.callables.map((callable) => callable.id)
	);
	const pluginContributions = applyCompilerPlugins(
		normalized,
		filename,
		options.target ?? 'default',
		options.pluginRegistry
	);

	return {
		version: exactCompilerManifestVersion,
		filename,
		dependencies: [],
		assets: [...moduleImports.assets],
		semanticGraph: portableSemanticGraph(semanticGraph, expressionModule.filename, filename),
		components,
		exports,
		symbols,
		boundaries,
		callables: [...callableEffects.callables],
		policy: policyResult.policy,
		...(options.packageName ? { packageName: options.packageName } : {}),
		...(rawHtmlRequirements.length
			? { requiredCapabilities: { rawHtml: rawHtmlRequirements } }
			: {}),
		serverActions,
		...(pluginContributions.pluginRegistry
			? { pluginRegistry: pluginContributions.pluginRegistry }
			: {}),
		...(pluginContributions.pluginData && Object.keys(pluginContributions.pluginData).length
			? { pluginData: pluginContributions.pluginData }
			: {}),
		diagnostics: [...manifestDiagnostics, ...pluginContributions.diagnostics]
	};
}

function importedSecretRequirementDiagnostics(
	imported: readonly ExactCompilerManifest[],
	options: TransformOptions
): string[] {
	if (options.packageType === 'library') return [];
	const allowPackages = options.capabilityPolicy?.secrets?.allowPackages ?? [];
	const diagnostics = new Set<string>();
	for (const manifest of imported) {
		for (const use of manifest.policy.secretConsumers) {
			if (use.consumer.package === options.packageName) continue;
			if (use.authorization === 'denied') {
				diagnostics.add(
					`error: dependency secret use at ${use.source}:${use.line}:${use.column} is denied: ${use.reason ?? 'unresolved policy violation'}`
				);
				continue;
			}
			if (use.target === 'client') {
				diagnostics.add(
					`error: dependency secret use at ${use.source}:${use.line}:${use.column} is retained in a client artifact`
				);
				continue;
			}
			if (!allowPackages.includes(use.consumer.package))
				diagnostics.add(
					`error: dependency ${use.consumer.package} consumes a secret at ${use.source}:${use.line}:${use.column} but is not in secrets.allowPackages`
				);
		}
	}
	return [...diagnostics].sort();
}

function rawHtmlCapabilityDiagnostics(
	local: readonly ExactRawHtmlCapabilityIR[],
	imported: readonly ExactCompilerManifest[],
	options: TransformOptions
): string[] {
	if (options.packageType === 'library') return [];
	const dependencyRequirements = imported.flatMap((manifest) =>
		(manifest.requiredCapabilities?.rawHtml ?? []).map((requirement) => ({
			manifest,
			requirement
		}))
	);
	if (!local.length && !dependencyRequirements.length) return [];

	const policy = options.capabilityPolicy?.unsafeHtml;
	const diagnostics: string[] = [];
	if (!policy?.enabled) {
		diagnostics.push(
			'error: unsafeHtml capability is used but the application has not explicitly enabled it'
		);
	}
	const grants = new Set(policy?.grants ?? []);
	for (const { manifest, requirement } of dependencyRequirements) {
		if (manifest.packageName === options.packageName) continue;
		if (!manifest.packageName) {
			diagnostics.push(
				`error: unsafeHtml requirement at ${requirement.source}:${requirement.line}:${requirement.column} has no package identity and cannot be granted`
			);
		} else if (!grants.has(manifest.packageName)) {
			diagnostics.push(
				`error: dependency ${manifest.packageName} uses unsafeHtml at ${requirement.source}:${requirement.line}:${requirement.column} without an application grant`
			);
		}
	}
	return diagnostics;
}

function effectDiagnosticPath(
	initializer: ExactCompilerManifest['callables'][number],
	effect: 'mixed' | 'unknown'
): string {
	if (effect === 'unknown') {
		return (
			initializer.effectSources
				.find((source) => source.environment === 'unknown')
				?.path.join(' → ') ?? initializer.name
		);
	}
	const browser = initializer.effectSources
		.find((source) => source.environment === 'browser')
		?.path.join(' → ');
	const server = initializer.effectSources
		.find((source) => source.environment === 'server')
		?.path.join(' → ');
	return browser && server ? `${browser} ↔ ${server}` : (browser ?? server ?? initializer.name);
}

function validatedImportedManifests(
	manifests: readonly ExactCompilerManifest[] | undefined,
	registry: TransformOptions['pluginRegistry']
): ExactCompilerManifest[] {
	const parsed = (manifests ?? []).map((manifest, index) =>
		parseExactCompilerManifest(manifest, `imported compiler manifest ${index + 1}`)
	);
	validateImportedPluginRegistries(parsed, registry);
	return parsed;
}

function assertUniqueIds(label: string, ids: readonly string[]): void {
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) throw new Error(`Duplicate eXact ${label} id generated: ${id}`);
		seen.add(id);
	}
}

function portableSemanticGraph(
	graph: ExactSemanticGraphIR,
	boundFilename: string,
	declaredFilename: string
): ExactSemanticGraphIR {
	const bound = boundFilename.replace(/\\/g, '/').toLowerCase();
	const declared = declaredFilename.replace(/\\/g, '/').toLowerCase();
	const rewrite = (id: string | undefined): string | undefined =>
		id?.startsWith(bound) ? `${declared}${id.slice(bound.length)}` : id;
	return {
		scopes: graph.scopes.map((scope) => ({
			...scope,
			id: rewrite(scope.id)!,
			...(scope.parentId ? { parentId: rewrite(scope.parentId)! } : {})
		})),
		declarations: graph.declarations.map((declaration) => ({
			...declaration,
			id: rewrite(declaration.id)!,
			scopeId: rewrite(declaration.scopeId)!
		})),
		references: graph.references.map((reference) => ({
			...reference,
			scopeId: rewrite(reference.scopeId)!,
			...(reference.declarationId ? { declarationId: rewrite(reference.declarationId)! } : {})
		})),
		exports: graph.exports.map((exported) => ({ ...exported }))
	};
}

/** Builds the semantic graph used for reference/declaration tracing diagnostics and tests. */
export function analyzeSemanticGraph(
	source: string,
	options: Pick<TransformOptions, 'filename' | 'root' | 'session'> = {}
): ExactSemanticGraphIR {
	const normalized = preprocessPropPunning(source);
	const filename = options.filename ?? 'input.tsx';
	return buildExpressionSemanticGraph(
		sessionExpressionModule(options.session, filename, normalized, { root: options.root })
	);
}

function sessionExpressionModule(
	session: ExactCompilerSession | undefined,
	filename: string,
	source: string,
	options: Parameters<typeof expressionModuleFor>[2]
): BoundModule {
	return session
		? session.expressionModuleFor(filename, source, options)
		: expressionModuleFor(filename, source, options);
}

/** Compiles one input file and optionally writes code, source map, and manifest artifacts. */
export async function compileFile(
	inputFile: string,
	options: CompileFileOptions = {}
): Promise<CompileFileResult> {
	const source = await readFile(inputFile, 'utf8');
	const result = transformSource(source, {
		filename: options.filename ?? inputFile,
		session: options.session,
		target: options.target,
		serverComponents: options.serverComponents,
		sourceMap: options.sourceMap,
		moduleRewrite: options.moduleRewrite,
		moduleTransform: options.moduleTransform,
		assetRules: options.assetRules,
		preserveClientAssetImports: options.preserveClientAssetImports,
		pluginRegistry: options.pluginRegistry,
		generatedValidation: options.generatedValidation,
		...capabilityCompilationOptions(options)
	});
	const outputFile = options.outDir
		? outputPathFor(inputFile, options.outDir, options.rootDir)
		: undefined;
	const sourceMapFile = outputFile && result.map ? sourceMapPathFor(outputFile) : undefined;
	const manifestFile = outputFile && options.emitManifest ? manifestPathFor(outputFile) : undefined;

	if (outputFile) {
		await mkdir(path.dirname(outputFile), { recursive: true });
		await writeFile(
			outputFile,
			sourceMapFile ? withSourceMappingUrl(result.code, path.basename(sourceMapFile)) : result.code
		);
	}
	if (sourceMapFile && result.map) {
		await mkdir(path.dirname(sourceMapFile), { recursive: true });
		await writeFile(
			sourceMapFile,
			`${JSON.stringify(withSourceMapFile(result.map, path.basename(outputFile!)), null, 2)}\n`
		);
	}
	if (manifestFile) {
		await mkdir(path.dirname(manifestFile), { recursive: true });
		await writeFile(manifestFile, `${JSON.stringify(result.manifest, null, 2)}\n`);
	}

	return {
		...result,
		inputFile,
		outputFile,
		sourceMapFile,
		manifestFile
	};
}

/** Compiles all transformable files found under the provided input paths. */
export async function compileProject(
	inputs: readonly string[],
	options: CompileProjectOptions = {}
): Promise<CompileFileResult[]> {
	const files = await collectInputFiles(inputs);
	const rootDir = options.rootDir ?? commonRoot(files);
	const results: CompileFileResult[] = [];

	for (const file of files) {
		results.push(
			await compileFile(file, {
				outDir: options.outDir,
				rootDir,
				target: options.target,
				emitManifest: options.emitManifest,
				serverComponents: options.serverComponents,
				sourceMap: options.sourceMap,
				session: options.session,
				moduleRewrite: options.moduleRewrite,
				moduleTransform: options.moduleTransform,
				assetRules: options.assetRules,
				preserveClientAssetImports: options.preserveClientAssetImports,
				pluginRegistry: options.pluginRegistry,
				...capabilityCompilationOptions(options)
			})
		);
	}

	return results;
}

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

async function collectPlacementAnalysisDependencies(
	sources: Map<string, string>,
	session?: ExactCompilerSession
): Promise<Map<string, string[]>> {
	const graph = new Map<string, string[]>();
	const pending = [...sources.keys()];
	while (pending.length) {
		const filename = pending.shift()!;
		const source = sources.get(filename)!;
		const resolvedDependencies: string[] = [];
		const semanticDependencies = session
			? session.expressionDependencyFiles(filename, source)
			: expressionDependencyFiles(filename, source);
		const syntacticDependencies = await localModuleDependencyFiles(filename, source);
		for (const dependency of [...semanticDependencies, ...syntacticDependencies]) {
			const resolved = path.resolve(dependency);
			if (
				/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(resolved) ||
				/\.d\.[cm]?ts$/i.test(resolved) ||
				!/\.[cm]?[jt]sx?$/i.test(resolved)
			)
				continue;
			try {
				await access(resolved);
				resolvedDependencies.push(resolved);
				if (!sources.has(resolved)) {
					sources.set(resolved, await readFile(resolved, 'utf8'));
					pending.push(resolved);
				}
			} catch {
				// Resolution candidates include extension substitutions that may not exist.
			}
		}
		graph.set(filename, [...new Set(resolvedDependencies)].sort());
	}
	return graph;
}

async function localModuleDependencyFiles(filename: string, source: string): Promise<string[]> {
	const sourceFile = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TSX
	);
	const specifiers = sourceFile.statements.flatMap((statement) => {
		if (
			(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text.startsWith('.')
		) {
			return [statement.moduleSpecifier.text];
		}
		return [];
	});
	const dependencies: string[] = [];
	for (const specifier of specifiers) {
		const absolute = path.resolve(path.dirname(filename), specifier);
		const extension = path.extname(absolute);
		const stem = /\.[cm]?[jt]sx?$/i.test(extension)
			? absolute.slice(0, -extension.length)
			: absolute;
		const candidates = [
			absolute,
			`${stem}.ts`,
			`${stem}.tsx`,
			`${stem}.mts`,
			`${stem}.cts`,
			`${stem}.js`,
			`${stem}.jsx`,
			path.join(absolute, 'index.ts'),
			path.join(absolute, 'index.tsx'),
			path.join(absolute, 'index.js')
		];
		for (const candidate of candidates) {
			try {
				await access(candidate);
				dependencies.push(path.resolve(candidate));
				break;
			} catch {
				// Try the next TypeScript/JavaScript resolution candidate.
			}
		}
	}
	return [...new Set(dependencies)];
}

function transitiveDependencies(
	entry: string,
	graph: ReadonlyMap<string, readonly string[]>
): string[] {
	const result = new Set<string>();
	const pending = [...(graph.get(entry) ?? [])];
	while (pending.length) {
		const dependency = pending.shift()!;
		if (result.has(dependency)) continue;
		result.add(dependency);
		pending.push(...(graph.get(dependency) ?? []));
	}
	return [...result];
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
	const changed = new Set(changedInputs.map((input) => path.resolve(input)));
	const effectiveChanges = new Set(changed);
	for (const entry of state.entries) {
		if (
			entry.manifest.dependencies.some((dependency) =>
				changed.has(path.resolve(path.dirname(entry.manifest.filename), dependency))
			)
		)
			effectiveChanges.add(path.resolve(entry.inputFile));
	}
	const diff = diffExactArtifactPlans(state.plan, nextPlan, {
		changedInputs: [...effectiveChanges]
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
