import { capabilityCompilationOptions } from '../compilation/capability-options.js';
import { createExactCompilerExplanation } from '../explanation.js';
import { applyCompilerPlugins, validateImportedPluginRegistries } from '../plugins.js';
import { createLineSourceMap } from '../source-maps.js';
import { createExactSourceInspection } from '../language-tools/source-inspection.js';
import type {
	ExactCompilerManifest,
	TransformOptions,
	TransformResult,
	TransformTarget
} from '../types.js';
import { nativeCompilerManifest } from './manifest.js';
import type {
	NativeCompilerCallable,
	NativeCompilerCapabilityPolicy,
	NativeCompilerExternalManifest,
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
	validateImportedPluginRegistries(options.importedManifests ?? [], options.pluginRegistry);
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
		manifests: nativeExternalManifests(options.importedManifests),
		compatibilityExtensions: nativeCompatibilityExtensions(options.pluginRegistry),
		...(options.moduleRewrite
			? {
					moduleRewrite: {
						moduleAliases: { ...options.moduleRewrite.moduleAliases },
						replacements: [...(options.moduleRewrite.replacements ?? [])]
					}
				}
			: {})
	});
	throwNativeCompilerErrors(filename, normalized, response.diagnostics);
	if (response.code === undefined)
		throw new Error(`Native compiler returned no generated code for ${filename}`);
	const output = options.moduleTransform
		? options.moduleTransform({ id: filename, source: response.code, target }).code
		: response.code;
	const manifest = nativeCompilerManifest(filename, response);
	if (options.packageName) manifest.packageName = options.packageName;
	applyNativePluginContributions(normalized, filename, target, manifest, options.pluginRegistry);
	throwNativePluginErrors(manifest);
	return {
		code: output,
		map: options.sourceMap
			? options.moduleTransform
				? createLineSourceMap(filename, normalized, output)
				: nativeSourceMap(response.sourceMap, filename, normalized)
			: null,
		filename,
		manifest,
		...(options.explain ? { explanation: createExactCompilerExplanation(manifest, target) } : {}),
		...(shouldEmitInspection(options.emitInspection)
			? {
					inspectionCatalog: createExactSourceInspection(filename, normalized, 0, response)
				}
			: {})
	};
}

function shouldEmitInspection(value: TransformOptions['emitInspection']): boolean {
	return value === true || (value === 'auto' && process.env.NODE_ENV !== 'production');
}

function throwNativePluginErrors(manifest: ExactCompilerManifest): void {
	const errors = manifest.diagnostics.filter((diagnostic) => /^error: \[@/.test(diagnostic));
	if (errors.length) throw new Error(errors.join('\n'));
}

/** Analyzes one normalized module through the retained native project. */
export function analyzeSourceWithNativeCompiler(
	normalized: string,
	filename: string,
	options: TransformOptions
): ExactCompilerManifest {
	const session = options.session;
	if (!session?.hasNativeCompiler())
		throw new Error('Native analysis requires a session with a configured Go compiler host');
	validateImportedPluginRegistries(options.importedManifests ?? [], options.pluginRegistry);
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
		manifests: nativeExternalManifests(options.importedManifests),
		compatibilityExtensions: nativeCompatibilityExtensions(options.pluginRegistry)
	});
	const manifest = nativeCompilerManifest(filename, response);
	if (options.packageName) manifest.packageName = options.packageName;
	applyNativePluginContributions(
		normalized,
		filename,
		options.target ?? 'default',
		manifest,
		options.pluginRegistry
	);
	return manifest;
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

function nativeExternalManifests(
	manifests: readonly ExactCompilerManifest[] | undefined
): readonly NativeCompilerExternalManifest[] | undefined {
	if (!manifests?.length) return undefined;
	return manifests.map((manifest) => ({
		filename: manifest.filename,
		...(manifest.packageName ? { packageName: manifest.packageName } : {}),
		components: manifest.exports
			.filter((exported) => exported.kind === 'component')
			.map((exported) => {
				const symbol = manifest.symbols.find(
					(candidate) =>
						candidate.exportName === exported.name &&
						candidate.kind === 'component' &&
						candidate.componentId
				);
				const component =
					manifest.components.find((candidate) => candidate.id === symbol?.componentId) ??
					manifest.components.find((candidate) => candidate.name === exported.name);
				return {
					exportName: exported.name,
					name: component?.name ?? exported.name,
					...(component?.id ? { componentId: component.id } : {}),
					placement: exported.placement
				};
			}),
		callables: manifest.callables.map(nativeExternalCallable),
		policy: {
			version: 1,
			subjects: manifest.policy.subjects.map((subject) => ({
				...subject,
				policy: { ...subject.policy }
			})),
			flows: manifest.policy.flows.map((flow) => ({
				...flow,
				from: [...flow.from],
				policy: { ...flow.policy }
			})),
			secretConsumers: manifest.policy.secretConsumers.map((consumer) => ({
				...consumer,
				consumer: { ...consumer.consumer }
			}))
		},
		capabilities: {
			rawHtml: (manifest.requiredCapabilities?.rawHtml ?? []).map((requirement) => ({
				...requirement,
				targets: [...requirement.targets]
			}))
		}
	}));
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
	manifest: ExactCompilerManifest,
	registry: TransformOptions['pluginRegistry']
): void {
	const contribution = applyCompilerPlugins(source, filename, target, registry);
	if (contribution.pluginRegistry) manifest.pluginRegistry = contribution.pluginRegistry;
	if (contribution.pluginData) manifest.pluginData = contribution.pluginData;
	manifest.diagnostics.push(...contribution.diagnostics);
}

function nativeExternalCallable(
	callable: ExactCompilerManifest['callables'][number]
): NativeCompilerCallable {
	return {
		id: callable.id,
		name: callable.name,
		kind: callable.kind,
		exportNames: [...callable.exportNames],
		directEffect: callable.directEffect,
		effect: callable.effect,
		directEffectSources: callable.directEffectSources.map((source) => ({
			environment: source.environment,
			description: source.description,
			path: [...source.path]
		})),
		effectSources: callable.effectSources.map((source) => ({
			environment: source.environment,
			description: source.description,
			path: [...source.path]
		})),
		calls: callable.calls.map((call) => ({
			id: call.id,
			name: call.name,
			...(call.targetId ? { targetId: call.targetId } : {}),
			...(call.moduleSpecifier ? { moduleSpecifier: call.moduleSpecifier } : {}),
			...(call.exportName ? { exportName: call.exportName } : {}),
			...(call.receiverBindings
				? {
						receiverBindings: call.receiverBindings.map((binding) => ({ ...binding }))
					}
				: {}),
			resolved: call.resolved
		})),
		artifactTargets: [...callable.artifactTargets],
		stateReads: callable.stateReads.map((effect) => ({
			path: effect.path,
			kind: effect.kind,
			confidence: effect.confidence,
			...(effect.operation ? { operation: effect.operation } : {}),
			...(effect.receiver ? { receiver: { ...effect.receiver } } : {})
		})),
		stateWrites: callable.stateWrites.map((effect) => ({
			path: effect.path,
			kind: effect.kind,
			confidence: effect.confidence,
			...(effect.operation ? { operation: effect.operation } : {}),
			...(effect.receiver ? { receiver: { ...effect.receiver } } : {})
		})),
		contexts: callable.contexts.map((effect) => ({ ...effect })),
		reevaluationSafe: callable.reevaluationSafe === true
	};
}
