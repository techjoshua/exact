import type {
	ExactContextRuntimeConfiguration,
	ExactServerContext,
	ExactServerContextConfiguration
} from '@exactjs/server';
import type {
	ExactServerHandlerRegistryOptions,
	ExactServerRuntimeOptions,
	RenderToStringOptions
} from '../types.js';

type ServerConfigurationKeys =
	| keyof ExactServerContextConfiguration
	| 'authorize'
	| 'validateCsrf'
	| 'payloadDecoders'
	| 'resolvePartitionAuthority'
	| 'remoteBuilds'
	| 'preferredBuildKey'
	| 'gateway'
	| 'limits'
	| 'logger'
	| 'outputExtensions'
	| 'onProfile';

/** Separates one public runtime option bag into the configurations owned by its subsystems. */
export function normalizeExactServerRuntimeOptions(options: ExactServerRuntimeOptions): Readonly<{
	context: ExactContextRuntimeConfiguration;
	server: Pick<ExactServerContext, ServerConfigurationKeys>;
	registry: ExactServerHandlerRegistryOptions;
}> {
	const rendering = {
		executionRoot: options.executionRoot,
		buildKey: options.buildKey,
		markers: options.markers,
		textSeparators: options.textSeparators,
		reactMarkup: options.reactMarkup,
		logger: options.logger,
		state: options.state,
		maxTaskPasses: options.maxTaskPasses,
		maxTaskDurationMs: options.maxTaskDurationMs,
		maxAsyncSsrConcurrency: options.maxAsyncSsrConcurrency,
		maxTreeDepth: options.maxTreeDepth,
		maxTreeNodes: options.maxTreeNodes,
		maxOutputBytes: options.maxOutputBytes,
		maxStreamBytes: options.maxStreamBytes,
		maxStreamChunks: options.maxStreamChunks,
		signal: options.signal,
		outputExtensions: options.outputExtensions,
		enhancementCatalog: options.enhancementCatalog,
		allowUnsafeHtml: options.allowUnsafeHtml,
		onUnsafeHtml: options.onUnsafeHtml,
		contexts: options.contexts,
		onComponentRendered: options.onComponentRendered,
		onComponentCreated: options.onComponentCreated,
		onComponentAttemptCheckpoint: options.onComponentAttemptCheckpoint,
		onComponentAttemptRollback: options.onComponentAttemptRollback,
		onDirectComponentCreated: undefined,
		onDirectComponentRendered: undefined,
		allowIndependentComponentObservation: undefined,
		onProfile: options.onProfile,
		inspection: options.inspection,
		dynamicComponentArtifacts: options.dynamicComponentArtifacts,
		maxDynamicComponentPreloads: options.maxDynamicComponentPreloads,
		onEarlyHints: options.onEarlyHints
	} satisfies Record<keyof RenderToStringOptions, unknown>;
	const context = {
		publicOrigin: options.publicOrigin,
		applicationContexts: options.applicationContexts,
		requestContexts: options.requestContexts,
		contextOverrides: options.contextOverrides
	} satisfies Record<keyof ExactContextRuntimeConfiguration, unknown>;
	const server = {
		componentAuthorization: options.componentAuthorization,
		publicOrigin: options.publicOrigin,
		applicationContexts: options.applicationContexts,
		requestContexts: options.requestContexts,
		contextOverrides: options.contextOverrides,
		onContextAccess: options.onContextAccess,
		inspectionCatalogs: options.inspectionCatalogs,
		allowDebug: options.allowDebug,
		debugSessionIdentity: options.debugSessionIdentity,
		debugLimits: options.debugLimits,
		inspectionQueryService: options.inspectionQueryService,
		inspectionSources: options.inspectionSources,
		onDebugAudit: options.onDebugAudit,
		authorize: options.authorize,
		validateCsrf: options.validateCsrf,
		payloadDecoders: options.payloadDecoders,
		resolvePartitionAuthority: options.resolvePartitionAuthority,
		remoteBuilds: options.remoteBuilds,
		preferredBuildKey: options.preferredBuildKey,
		gateway: options.gateway,
		limits: options.limits,
		logger: options.logger,
		outputExtensions: options.outputExtensions,
		onProfile: options.onProfile
	} satisfies Record<ServerConfigurationKeys, unknown>;
	return Object.freeze({
		context: Object.freeze(context),
		server: Object.freeze(server),
		registry: Object.freeze({
			...rendering,
			contract: options.contract,
			invocations: options.invocations,
			boundaries: options.boundaries,
			patchStrategy: options.patchStrategy
		})
	});
}
