export { renderToStream } from './output-stream.js';
export { renderToHydratableString, renderToString } from './render-output.js';
import { logFrameworkEvent, type Child } from '@exactjs/core';
import { createExactBufferedResponse, runWithExactRequestScope } from '@exactjs/server';
import { escapeAttr } from '../html.js';
import { createDocumentEventStream, createProgressiveHtmlStream } from '../streams.js';
import type {
	ExactRequestLike,
	ExactRequestRenderFunction,
	ExactResponseLike,
	ExactServerContext,
	RenderExactRequestToHtmlResponseOptions,
	RenderToDocumentStreamOptions,
	RenderToProgressiveHtmlResponseOptions,
	RenderToProgressiveHtmlStreamOptions,
	RenderToStringOptions
} from '../types.js';
import type { DirectScheduledSsrComponent } from './direct-component-contracts.js';
import { htmlChunksOf, hydratableChunksOf } from './output-buffer.js';
import { isExactDocumentResult, startsExactDocument } from './output-result.js';
import { createProgressiveProducedResponse } from './progressive-response.js';
import { renderToHydratableString, renderToString, streamDocumentRender } from './render-output.js';
import { renderSignal } from './signals.js';

/** Configures ssr render. */
export type SsrRenderOptions = RenderToStringOptions & {
	taskDeadline?: number;
	/** Internal collector retaining scheduled frames until a progressive shell is published. */
	streamingScheduledComponents?: DirectScheduledSsrComponent[];
	/** Settles compiler-known documents and discovered document descendants; fragments retain replacements. */
	settleDocumentShell?: boolean;
};

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
		(streamOptions, emit, abort) =>
			streamDocumentRender(operation, streamOptions, emit, true, abort),
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
	return createProgressiveProducedResponse(operation, options);
}

/** Transforms to hydratable progressive html response into its required representation. */
export function renderToHydratableProgressiveHtmlResponse(
	operation: Child,
	options: RenderToProgressiveHtmlResponseOptions = {}
): ExactResponseLike {
	return createProgressiveProducedResponse(operation, {
		...options,
		hydration: options.hydration ?? true
	});
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
				const rendered = await renderToString(operation, renderOptions);
				body = htmlChunksOf(rendered) ?? [rendered.html];
				preloadLinks = rendered.preloadLinks;
			} else {
				const rendered = await renderToHydratableString(operation, renderOptions);
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
				const rendered = await renderToString(operation, renderOptions);
				preloadLinks = rendered.preloadLinks;
				const chunks = htmlChunksOf(rendered) ?? [rendered.html];
				body = startsExactDocument(chunks)
					? chunks
					: [`<div id="${escapeAttr(options.rootId ?? 'exact-root')}">`, ...chunks, '</div>'];
			} else {
				const rendered = await renderToHydratableString(operation, renderOptions);
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
