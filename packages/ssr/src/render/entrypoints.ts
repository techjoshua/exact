import { logFrameworkEvent, withTaskObserver, type Child } from '@exactjs/core';
import { componentDomainUsesWallClock } from '@exactjs/core/framework/component-domains';
import { publishExactProfile } from '@exactjs/instrumentation';
import { processExactOutputSync } from '@exactjs/plugin-host/runtime';
import { createExactBufferedResponse, runWithExactRequestScope } from '@exactjs/server';
import { escapeAttr } from '../html.js';
import { renderHydrationScript } from '../hydration.js';
import { createSsrResumptionCapture } from '../resumption.js';
import { assertOutputWithinLimit } from '../render/limits.js';
import {
	createDocumentEventStream,
	createHtmlStream,
	createProgressiveHtmlStream,
	progressiveHtmlResponse
} from '../streams.js';
import type {
	ExactRequestLike,
	ExactRequestRenderFunction,
	ExactResponseLike,
	ExactServerContext,
	HydratableStringResult,
	HydrationScriptOptions,
	RenderExactRequestToHtmlResponseOptions,
	RenderToDocumentStreamOptions,
	RenderToProgressiveHtmlResponseOptions,
	RenderToProgressiveHtmlStreamOptions,
	RenderToStringOptions,
	RenderToStringResult,
	SsrProfileEvent
} from '../types.js';
import {
	renderToHydratableStringAsync,
	renderToStringAsync,
	streamDocumentRender
} from './async-rendering.js';
import { createSsrContext } from './context.js';
import { hydrationScriptOptions } from './hydration-options.js';
import { attachSsrRootExecutionBlueprint } from './root-execution-cache.js';
import { renderSignal } from './signals.js';
import { createSsrOwner, disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { renderChildren } from './sync-children.js';
import { renderChildChunks } from './sync-child-chunks.js';
import { rootComponentIdentity, rootPropsOptions } from './root-props.js';
import { SsrOutputBuffer } from './output-buffer.js';
import {
	createChunkedHydratableResult,
	createChunkedStringResult,
	isExactDocumentResult,
	startsExactDocument
} from './output-result.js';
import { htmlChunksOf, hydratableChunksOf } from './output-buffer.js';
import type { DirectScheduledSsrComponent } from './direct-component-contracts.js';

/** Configures ssr render. */
export type SsrRenderOptions = RenderToStringOptions & {
	taskDeadline?: number;
	/** Internal collector retaining scheduled frames until a progressive shell is published. */
	streamingScheduledComponents?: DirectScheduledSsrComponent[];
};

/** Transforms to string into its required representation. */
export function renderToString(
	operation: Child,
	options: RenderToStringOptions = {}
): RenderToStringResult {
	const profileStarted = options.onProfile ? performance.now() : undefined;
	const owner = createSsrOwner();
	let primary: unknown = noPrimaryFailure;
	try {
		return withTaskObserver(owner.observer, () => renderToStringOwned(operation, options));
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		disposePreservingPrimary(() => owner.dispose('ssr render complete'), primary);
		if (profileStarted !== undefined) {
			publishExactProfile(
				options.onProfile,
				Object.freeze({
					subsystem: 'ssr',
					phase: 'render-to-string',
					elapsedMs: performance.now() - profileStarted
				} satisfies SsrProfileEvent)
			);
		}
	}
}

/** Transforms to string owned into its required representation. */
export function renderToStringOwned(
	operation: Child,
	options: RenderToStringOptions
): RenderToStringResult {
	const validatedOperation = processExactOutputSync(
		operation,
		{ kind: 'operation', signal: options.signal },
		options.outputExtensions ?? []
	) as Child;
	const context = createSsrContext(options);
	attachSsrRootExecutionBlueprint(context, validatedOperation);
	const output = new SsrOutputBuffer(context.maxOutputBytes);
	output.append(renderChildren(context, [validatedOperation], undefined));
	output.prepend(context.reactResourceHints ?? []);
	let chunks = output.finish();
	if (options.outputExtensions?.length) {
		const html = processExactOutputSync(
			chunks.length === 1 ? chunks[0]! : chunks.join(''),
			{ kind: 'html', signal: options.signal },
			options.outputExtensions
		) as string;
		assertOutputWithinLimit(context, html);
		chunks = [html];
	}
	const hydrationTable = context.hydrationTable?.value();
	return createChunkedStringResult(
		chunks,
		options.state,
		hydrationTable,
		context.resourceLinkHeaders ?? [],
		context.componentDomain && componentDomainUsesWallClock(context.componentDomain)
			? context.wallClockSnapshot
			: undefined
	);
}

/** Transforms to hydratable string into its required representation. */
export function renderToHydratableString(
	operation: Child,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): HydratableStringResult {
	const prepared = rootPropsOptions(operation, options);
	const capture = createSsrResumptionCapture(
		prepared,
		prepared.publishRootProps ? (prepared.state as Record<string, unknown>) : undefined,
		rootComponentIdentity(operation)
	);
	const result = renderToString(operation, capture.options);
	const resumptions = capture.serializedRecords();
	const emittedResumptions = resumptions.length ? capture.activations : prepared.resumptions;
	const hydrationScript = renderHydrationScript(
		hydrationScriptOptions(
			prepared,
			result,
			resumptions.length && prepared.outputExtensions?.length
				? capture.activations()
				: prepared.resumptions
		),
		undefined,
		resumptions
	);
	return createChunkedHydratableResult(result, emittedResumptions, hydrationScript);
}

/** Transforms to stream into its required representation. */
export function renderToStream(
	operation: Child,
	options: RenderToStringOptions = {}
): ReadableStream<Uint8Array> {
	const profileStarted = options.onProfile ? performance.now() : undefined;
	const owner = createSsrOwner();
	const validatedOperation = processExactOutputSync(
		operation,
		{ kind: 'operation', signal: options.signal },
		options.outputExtensions ?? []
	) as Child;
	const context = createSsrContext(options);
	attachSsrRootExecutionBlueprint(context, validatedOperation);
	const rendered = renderChildChunks(context, validatedOperation, undefined, 1);
	const observed: Iterable<string> = {
		[Symbol.iterator]() {
			return {
				next: () => {
					const next = withTaskObserver(owner.observer, () => rendered.next());
					return next.done
						? next
						: {
								done: false,
								value: processExactOutputSync(
									next.value,
									{ kind: 'stream', signal: options.signal },
									options.outputExtensions ?? []
								) as string
							};
				},
				return: () => rendered.return(undefined)
			};
		}
	};
	const stream = createHtmlStream(observed, {
		signal: options.signal,
		maxBytes: options.maxStreamBytes,
		maxChunks: options.maxStreamChunks,
		close: () => owner.dispose(options.signal?.reason ?? 'ssr stream complete')
	});
	if (profileStarted !== undefined) {
		publishExactProfile(
			options.onProfile,
			Object.freeze({
				subsystem: 'ssr',
				phase: 'create-stream',
				elapsedMs: performance.now() - profileStarted
			} satisfies SsrProfileEvent)
		);
	}
	return stream;
}

/** Transforms to document stream into its required representation. */
export function renderToDocumentStream(
	operation: Child,
	options: RenderToDocumentStreamOptions = {}
): ReadableStream<Uint8Array> {
	return createDocumentEventStream(
		(signal, emit) => streamDocumentRender(operation, { ...options, signal }, emit),
		{
			signal: options.signal,
			maxEvents: options.maxStreamEvents,
			maxBytes: options.maxStreamBytes,
			onError: (error) =>
				logFrameworkEvent('error', 'ssr', 'stream', 'document render failed', error, options.logger)
		}
	);
}

/** Transforms to hydratable document stream into its required representation. */
export function renderToHydratableDocumentStream(
	operation: Child,
	options: RenderToDocumentStreamOptions = {}
): ReadableStream<Uint8Array> {
	return renderToDocumentStream(operation, {
		...options,
		hydration: options.hydration ?? true
	});
}

/** Transforms to progressive html stream into its required representation. */
export function renderToProgressiveHtmlStream(
	operation: Child,
	options: RenderToProgressiveHtmlStreamOptions = {}
): ReadableStream<Uint8Array> {
	return createProgressiveHtmlStream(
		(streamOptions, emit) => streamDocumentRender(operation, streamOptions, emit),
		options
	);
}

/** Transforms to hydratable progressive html stream into its required representation. */
export function renderToHydratableProgressiveHtmlStream(
	operation: Child,
	options: RenderToProgressiveHtmlStreamOptions = {}
): ReadableStream<Uint8Array> {
	return renderToProgressiveHtmlStream(operation, {
		...options,
		hydration: options.hydration ?? true
	});
}

/** Transforms to progressive html response into its required representation. */
export function renderToProgressiveHtmlResponse(
	operation: Child,
	options: RenderToProgressiveHtmlResponseOptions = {}
): ExactResponseLike {
	return progressiveHtmlResponse(renderToProgressiveHtmlStream(operation, options), options);
}

/** Transforms to hydratable progressive html response into its required representation. */
export function renderToHydratableProgressiveHtmlResponse(
	operation: Child,
	options: RenderToProgressiveHtmlResponseOptions = {}
): ExactResponseLike {
	return progressiveHtmlResponse(
		renderToHydratableProgressiveHtmlStream(operation, options),
		options
	);
}

/** Transforms exact request to html response into its required representation. */
export async function renderExactRequestToHtmlResponse(
	request: ExactRequestLike,
	server: ExactServerContext,
	render: ExactRequestRenderFunction,
	options: RenderExactRequestToHtmlResponseOptions = {}
): Promise<ExactResponseLike> {
	return runWithExactRequestScope(
		request,
		server,
		async (context) => {
			const operation = await render(context);
			const renderOptions = {
				...options,
				...requestInspectionOptions(context, options),
				contexts: context.contexts?.componentValues,
				signal: renderSignal(context.signal, options.signal)
			};
			let body: readonly string[];
			let preloadLinks: readonly string[] | undefined;
			if (options.hydration === false) {
				const rendered = await renderToStringAsync(operation, renderOptions);
				body = htmlChunksOf(rendered) ?? [rendered.html];
				preloadLinks = rendered.preloadLinks;
			} else {
				const rendered = await renderToHydratableStringAsync(operation, renderOptions);
				body = hydratableChunksOf(rendered) ?? [rendered.htmlWithHydration];
				preloadLinks = rendered.preloadLinks;
			}
			return createExactBufferedResponse(
				options.status ?? 200,
				withPreloadLinks(
					{
						'content-type': options.contentType ?? 'text/html; charset=utf-8',
						...(options.headers ?? {})
					},
					preloadLinks
				),
				body
			);
		},
		request.platformRequest ?? request
	);
}

/** Transforms exact request to progressive html response into its required representation. */
export async function renderExactRequestToProgressiveHtmlResponse(
	request: ExactRequestLike,
	server: ExactServerContext,
	render: ExactRequestRenderFunction,
	options: RenderToProgressiveHtmlResponseOptions = {}
): Promise<ExactResponseLike> {
	return runWithExactRequestScope(
		request,
		server,
		async (context) => {
			const operation = await render(context);
			const renderOptions = {
				...options,
				...requestInspectionOptions(context, options),
				contexts: context.contexts?.componentValues,
				signal: renderSignal(context.signal, options.signal)
			};
			// A response's status, headers, and authored head are committed before its
			// body is consumed. Conservatively settle the root before returning the
			// response; lower-level progressive APIs remain available when an
			// application can prove its provisional shell has no pre-commit effects.
			let body: readonly string[];
			let preloadLinks: readonly string[] | undefined;
			if (options.hydration === false) {
				const rendered = await renderToStringAsync(operation, renderOptions);
				preloadLinks = rendered.preloadLinks;
				const chunks = htmlChunksOf(rendered) ?? [rendered.html];
				body = startsExactDocument(chunks)
					? chunks
					: [`<div id="${escapeAttr(options.rootId ?? 'exact-root')}">`, ...chunks, '</div>'];
			} else {
				const rendered = await renderToHydratableStringAsync(operation, renderOptions);
				preloadLinks = rendered.preloadLinks;
				const htmlChunks = htmlChunksOf(rendered) ?? [rendered.html];
				body = isExactDocumentResult(rendered)
					? (hydratableChunksOf(rendered) ?? [rendered.htmlWithHydration])
					: [
							`<div id="${escapeAttr(options.rootId ?? 'exact-root')}">`,
							...htmlChunks,
							'</div>',
							rendered.hydrationScript
						];
			}
			return createExactBufferedResponse(
				options.status ?? 200,
				withPreloadLinks(
					{
						'content-type': options.contentType ?? 'text/html; charset=utf-8',
						...(options.headers ?? {})
					},
					preloadLinks
				),
				body
			);
		},
		request.platformRequest ?? request
	);
}

function withPreloadLinks(
	headers: Record<string, string>,
	links: readonly string[] | undefined
): Record<string, string> {
	if (!links?.length) return headers;
	const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === 'link');
	const key = existingKey ?? 'link';
	headers[key] = [headers[key], ...links].filter(Boolean).join(', ');
	return headers;
}

function requestInspectionOptions(
	context: ExactServerContext,
	options: RenderExactRequestToHtmlResponseOptions
): Pick<RenderToStringOptions, 'inspection'> {
	if (options.inspection) return { inspection: options.inspection };
	if (!context.requestDebugRuntime) return {};
	const catalogs = context.inspectionCatalogs;
	if (!catalogs?.length) return {};
	const buildKey =
		options.buildKey ??
		context.debugBuildKey ??
		(catalogs.length === 1 ? catalogs[0]!.buildKey : undefined);
	if (!buildKey) return {};
	const catalog = catalogs.find((entry) => entry.buildKey === buildKey);
	if (!catalog) return {};
	const roots = Object.keys(catalog.roots);
	const executionRoot = options.executionRoot ?? (roots.length === 1 ? roots[0] : undefined);
	if (!executionRoot || !catalog.roots[executionRoot]) return {};
	return {
		inspection: context.requestDebugRuntime!.inspectionOwner({
			buildKey,
			executionRoot,
			...(options.binding ? { binding: options.binding } : {})
		})
	};
}
