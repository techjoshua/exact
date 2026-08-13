import { capabilityCompilationOptions } from '../compilation/capability-options.js';
import { createExactCompilerExplanation } from '../explanation.js';
import { createLineSourceMap } from '../source-maps.js';
import { createExactSourceInspection } from '../language-tools/source-inspection.js';
import {
	appendExactRuntimeInspectionRegistration,
	createExactRuntimeInspectionCorrelation
} from '../language-tools/runtime-correlation.js';
import { createExactInspectionRedactions } from '../language-tools/build-catalog.js';
import { createExactComponentBuildFacts } from '../compilation/component-build-facts.js';
import type { TransformOptions, TransformResult } from '../types.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import { nativeModuleAnalysis } from './module-analysis.js';
import type {
	NativeCompilerCapabilityPolicy,
	NativeCompilerSourceMap
} from './process-contracts.js';
import {
	preparePackageEnhancementSource,
	sanitizePackageEnhancementResponse
} from '../compilation/package-enhancements.js';

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
	const prepared = preparePackageEnhancementSource(
		normalized,
		filename,
		options.packageEnhancements
	);
	const response = sanitizePackageEnhancementResponse(
		session.compileNative({
			id: filename,
			kind: 'compile',
			source: prepared.source,
			...(prepared.moduleSpecifiers.size
				? { packageEnhancementBoundary: prepared.authoredLength }
				: {}),
			root: options.root,
			configFile: options.configFile,
			buildKey: options.buildKey,
			target,
			componentContractProjection: options.componentContractProjection,
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
			...(options.moduleRewrite
				? {
						moduleRewrite: {
							moduleAliases: { ...options.moduleRewrite.moduleAliases },
							replacements: [...(options.moduleRewrite.replacements ?? [])]
						}
					}
				: {}),
			instrumentInspection: shouldEnableInspection(options.instrumentInspection)
		}),
		prepared
	);
	throwNativeCompilerErrors(filename, normalized, response.diagnostics);
	if (response.code === undefined)
		throw new Error(`Native compiler returned no generated code for ${filename}`);
	const analysis = nativeModuleAnalysis(filename, response);
	if (options.packageName) analysis.packageName = options.packageName;
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
		componentBuild: createExactComponentBuildFacts(analysis),
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
	const prepared = preparePackageEnhancementSource(
		normalized,
		filename,
		options.packageEnhancements
	);
	const response = sanitizePackageEnhancementResponse(
		session.compileNative({
			id: filename,
			kind: 'analyze',
			source: prepared.source,
			...(prepared.moduleSpecifiers.size
				? { packageEnhancementBoundary: prepared.authoredLength }
				: {}),
			root: options.root,
			configFile: options.configFile,
			buildKey: options.buildKey,
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
			instrumentInspection: shouldEnableInspection(options.instrumentInspection)
		}),
		prepared
	);
	const analysis = nativeModuleAnalysis(filename, response);
	if (options.packageName) analysis.packageName = options.packageName;
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
