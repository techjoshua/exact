import { capabilityCompilationOptions } from '../compilation/capability-options.js';
import { createExactCompilerExplanation } from '../explanation.js';
import { applyCompilerPlugins } from '../plugins.js';
import { createLineSourceMap } from '../source-maps.js';
import { createExactSourceInspection } from '../language-tools/source-inspection.js';
import {
	appendExactRuntimeInspectionRegistration,
	createExactRuntimeInspectionCorrelation
} from '../language-tools/runtime-correlation.js';
import { createExactInspectionRedactions } from '../language-tools/build-catalog.js';
import type { TransformOptions, TransformResult, TransformTarget } from '../types.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import { nativeModuleAnalysis } from './module-analysis.js';
import type {
	NativeCompilerCapabilityPolicy,
	NativeCompilerSourceMap
} from './process-contracts.js';

/**
 * Executes a normalized module entirely through the persistent Go host.
 *
 * Options whose semantics have not moved into the native protocol are rejected
 * explicitly. A configured native session is an execution choice, not a
 * fallback to a second compiler implementation.
 */
export function transformSourceWithNativeCompiler(
	normalized: string,
	filename: string,
	options: TransformOptions
): TransformResult {
	const session = options.session;
	if (!session?.hasNativeCompiler())
		throw new Error('Native compilation requires a session with a configured Go compiler host');
	const policyOptions = capabilityCompilationOptions(options);
	const target = options.target ?? 'default';
	const response = session.compileNative({
		id: filename,
		kind: 'compile',
		source: normalized,
		root: options.root,
		target,
		serverComponents: options.serverComponents,
		preserveComponentHoisting: options.preserveComponentHoisting,
		diagnostics: options.generatedValidation === 'semantic' ? 'semantic' : 'syntax',
		sourceMap: options.sourceMap,
		packageType: policyOptions.packageType,
		packageName: policyOptions.packageName,
		capabilities: nativeCapabilityPolicy(policyOptions),
		assetRules: options.assetRules?.map((rule) => ({
			...rule,
			extensions: [...(rule.extensions ?? [])],
			queries: [...(rule.queries ?? [])]
		})),
		preserveClientAssetImports: options.preserveClientAssetImports,
		...(options.jsxInterop
			? {
					jsxInterop: {
						adapterModule: options.jsxInterop.adapterModule,
						adapterExport: options.jsxInterop.adapterExport
					}
				}
			: {}),
		compatibilityExtensions: nativeCompatibilityExtensions(options.pluginRegistry),
		...(options.moduleRewrite
			? {
					moduleRewrite: {
						moduleAliases: { ...options.moduleRewrite.moduleAliases },
						replacements: [...(options.moduleRewrite.replacements ?? [])]
					}
				}
			: {}),
		instrumentInspection: shouldEnableInspection(options.instrumentInspection)
	});
	throwNativeCompilerErrors(filename, normalized, response.diagnostics);
	if (response.code === undefined)
		throw new Error(`Native compiler returned no generated code for ${filename}`);
	const analysis = nativeModuleAnalysis(filename, response);
	if (options.packageName) analysis.packageName = options.packageName;
	applyNativePluginContributions(normalized, filename, target, analysis, options.pluginRegistry);
	throwNativePluginErrors(analysis);
	const needsInspection =
		shouldEnableInspection(options.emitInspection) ||
		shouldEnableInspection(options.instrumentInspection);
	const inspection = needsInspection
		? createExactSourceInspection(filename, normalized, 0, response)
		: undefined;
	const inspectionRedactions = inspection ? createExactInspectionRedactions([analysis]) : undefined;
	const correlation =
		inspection && shouldEnableInspection(options.instrumentInspection)
			? createExactRuntimeInspectionCorrelation(inspection, inspectionRedactions)
			: undefined;
	const instrumented =
		correlation && target !== 'server'
			? appendExactRuntimeInspectionRegistration(response.code, correlation)
			: response.code;
	const output = options.moduleTransform
		? options.moduleTransform({ id: filename, source: instrumented, target }).code
		: instrumented;
	return {
		code: output,
		map: options.sourceMap
			? options.moduleTransform
				? createLineSourceMap(filename, normalized, output)
				: nativeSourceMap(response.sourceMap, filename, normalized)
			: null,
		filename,
		...(analysis.rendererEnhancements.length
			? { rendererEnhancements: analysis.rendererEnhancements.map((entry) => ({ ...entry })) }
			: {}),
		...(options.explain ? { explanation: createExactCompilerExplanation(analysis, target) } : {}),
		...(inspection && shouldEnableInspection(options.emitInspection)
			? { inspectionCatalog: inspection }
			: {}),
		...(inspectionRedactions ? { inspectionRedactions } : {}),
		...(correlation ? { inspectionCorrelation: correlation } : {})
	};
}

function shouldEnableInspection(
	value: TransformOptions['emitInspection'] | TransformOptions['instrumentInspection']
): boolean {
	return value === true || (value === 'auto' && process.env.NODE_ENV !== 'production');
}

function throwNativePluginErrors(analysis: ExactModuleAnalysis): void {
	const errors = analysis.diagnostics.filter((diagnostic) => /^error: \[@/.test(diagnostic));
	if (errors.length) throw new Error(errors.join('\n'));
}

/** Analyzes one normalized module through the retained native project. */
export function analyzeSourceWithNativeCompiler(
	normalized: string,
	filename: string,
	options: TransformOptions
): ExactModuleAnalysis {
	const session = options.session;
	if (!session?.hasNativeCompiler())
		throw new Error('Native analysis requires a session with a configured Go compiler host');
	const policyOptions = capabilityCompilationOptions(options);
	const response = session.compileNative({
		id: filename,
		kind: 'analyze',
		source: normalized,
		root: options.root,
		target: options.target ?? 'default',
		serverComponents: options.serverComponents,
		preserveComponentHoisting: options.preserveComponentHoisting,
		diagnostics: options.generatedValidation === 'semantic' ? 'semantic' : 'syntax',
		packageType: policyOptions.packageType,
		packageName: policyOptions.packageName,
		capabilities: nativeCapabilityPolicy(policyOptions),
		assetRules: options.assetRules?.map((rule) => ({
			...rule,
			extensions: [...(rule.extensions ?? [])],
			queries: [...(rule.queries ?? [])]
		})),
		preserveClientAssetImports: options.preserveClientAssetImports,
		...(options.jsxInterop
			? {
					jsxInterop: {
						adapterModule: options.jsxInterop.adapterModule,
						adapterExport: options.jsxInterop.adapterExport
					}
				}
			: {}),
		compatibilityExtensions: nativeCompatibilityExtensions(options.pluginRegistry)
	});
	const analysis = nativeModuleAnalysis(filename, response);
	if (options.packageName) analysis.packageName = options.packageName;
	applyNativePluginContributions(
		normalized,
		filename,
		options.target ?? 'default',
		analysis,
		options.pluginRegistry
	);
	return analysis;
}

function throwNativeCompilerErrors(
	filename: string,
	source: string,
	diagnostics: readonly Readonly<{
		severity: string;
		code: string;
		message: string;
		start?: number;
	}>[]
): void {
	const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
	if (!errors.length) return;
	throw new Error(
		errors
			.map((diagnostic) => {
				const location =
					diagnostic.start === undefined ? '' : sourceLocation(source, diagnostic.start);
				const message = diagnostic.message.startsWith(`${diagnostic.severity}:`)
					? diagnostic.message.slice(diagnostic.severity.length + 1).trimStart()
					: diagnostic.message;
				return `${filename}${location} - ${diagnostic.severity}: ${message}`;
			})
			.join('\n')
	);
}

function sourceLocation(source: string, offset: number): string {
	const before = source.slice(0, Math.max(0, offset));
	const line = before.split('\n').length;
	const lastBreak = before.lastIndexOf('\n');
	const column = offset - lastBreak;
	return `:${line}:${column}`;
}

function nativeSourceMap(
	sourceMap: NativeCompilerSourceMap | undefined,
	filename: string,
	source: string
): TransformResult['map'] {
	if (!sourceMap) throw new Error(`Native compiler returned no source map for ${filename}`);
	return {
		version: 3,
		...(sourceMap.file ? { file: sourceMap.file } : {}),
		// One native request always emits one authored source. Preserve its
		// public filename rather than exposing the printer's relative map key.
		sources: [filename],
		sourcesContent: sourceMap.sourcesContent?.length
			? sourceMap.sourcesContent.map((content) => content ?? '')
			: [source],
		names: [...sourceMap.names],
		mappings: sourceMap.mappings
	};
}

function nativeCompatibilityExtensions(
	registry: TransformOptions['pluginRegistry']
): Readonly<Record<string, readonly string[]>> | undefined {
	const entries = Object.values(registry?.plugins ?? {})
		.flatMap((plugin) =>
			plugin.extension
				? [[plugin.extension.namespace, [...(plugin.extension.directives ?? [])]] as const]
				: []
		)
		.sort(([left], [right]) => left.localeCompare(right));
	return entries.length ? Object.fromEntries(entries) : undefined;
}

function nativeCapabilityPolicy(options: TransformOptions): NativeCompilerCapabilityPolicy {
	return {
		unsafeHtml: {
			enabled: options.capabilityPolicy?.unsafeHtml?.enabled === true,
			grants: [...(options.capabilityPolicy?.unsafeHtml?.grants ?? [])]
		},
		secrets: {
			allowPackages: [...(options.capabilityPolicy?.secrets?.allowPackages ?? [])]
		}
	};
}

/**
 * Preserves the existing JavaScript extension boundary around native analysis.
 *
 * The Go host owns parsing, checking, lowering, and built-in native extensions.
 * JavaScript plugin callbacks remain an opt-in compatibility boundary and
 * receive only the immutable source view defined by the plugin API.
 */
function applyNativePluginContributions(
	source: string,
	filename: string,
	target: TransformTarget,
	analysis: ExactModuleAnalysis,
	registry: TransformOptions['pluginRegistry']
): void {
	const contribution = applyCompilerPlugins(source, filename, target, registry);
	if (contribution.pluginRegistry) analysis.pluginRegistry = contribution.pluginRegistry;
	if (contribution.pluginData) analysis.pluginData = contribution.pluginData;
	analysis.diagnostics.push(...contribution.diagnostics);
}
