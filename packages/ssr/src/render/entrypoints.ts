import { logFrameworkEvent, withTaskObserver, type VNode } from '@exact/core';
import { processExactOutputSync } from '@exact/plugin-host/runtime';
import { runWithExactRequestScope } from '@exact/server';
import { augmentDocumentBody } from '../document.js';
import { escapeAttr } from '../html.js';
import { renderHydrationScript } from '../hydration.js';
import { assertOutputWithinLimit, boundedJoin } from '../render/limits.js';
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
import { createSsrOwner, disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { renderVNode, renderVNodeChunks } from './sync-tree.js';

/** Configures ssr render. */
export type SsrRenderOptions = RenderToStringOptions & { taskDeadline?: number };

/** Transforms to string into its required representation. */
export function renderToString(
	vnode: VNode,
	options: RenderToStringOptions = {}
): RenderToStringResult {
	const profileStarted = options.onProfile ? performance.now() : undefined;
	const owner = createSsrOwner();
	let primary: unknown = noPrimaryFailure;
	try {
		return withTaskObserver(owner.observer, () => renderToStringOwned(vnode, options));
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		disposePreservingPrimary(() => owner.dispose('ssr render complete'), primary);
		if (profileStarted !== undefined) {
			options.onProfile?.(
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
	vnode: VNode,
	options: RenderToStringOptions
): RenderToStringResult {
	const context = createSsrContext(options);
	const validatedVNode = processExactOutputSync(
		vnode,
		{ kind: 'vnode', signal: options.signal },
		options.outputExtensions ?? []
	) as VNode;
	const body = renderVNode(context, validatedVNode, undefined);
	const html = processExactOutputSync(
		boundedJoin(context, [...context.reactResourceHints, body]),
		{ kind: 'html', signal: options.signal },
		options.outputExtensions ?? []
	) as string;
	assertOutputWithinLimit(context, html);
	return {
		html,
		state: options.state
	};
}

/** Transforms to hydratable string into its required representation. */
export function renderToHydratableString(
	vnode: VNode,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): HydratableStringResult {
	const result = renderToString(vnode, options);
	const hydrationScript = renderHydrationScript({
		pluginRegistryFingerprint: options.pluginRegistryFingerprint,
		endpoint: options.endpoint,
		endpoints: options.endpoints,
		state: result.state,
		stateContracts: options.stateContracts,
		actionBoundaries: options.actionBoundaries,
		scriptId: options.scriptId,
		nonce: options.nonce,
		maxHydrationDepth: options.maxHydrationDepth,
		maxHydrationNodes: options.maxHydrationNodes,
		maxHydrationBytes: options.maxHydrationBytes,
		outputExtensions: options.outputExtensions
	});
	return {
		...result,
		hydrationScript,
		htmlWithHydration: augmentDocumentBody(result.html, hydrationScript)
	};
}

/** Transforms to stream into its required representation. */
export function renderToStream(
	vnode: VNode,
	options: RenderToStringOptions = {}
): ReadableStream<Uint8Array> {
	const profileStarted = options.onProfile ? performance.now() : undefined;
	const context = createSsrContext(options);
	const owner = createSsrOwner();
	const validatedVNode = processExactOutputSync(
		vnode,
		{ kind: 'vnode', signal: options.signal },
		options.outputExtensions ?? []
	) as VNode;
	const rendered = renderVNodeChunks(context, validatedVNode, undefined, 1);
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
		options.onProfile?.(
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
	vnode: VNode,
	options: RenderToDocumentStreamOptions = {}
): ReadableStream<Uint8Array> {
	return createDocumentEventStream(
		(signal, emit) => streamDocumentRender(vnode, { ...options, signal }, emit),
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
	vnode: VNode,
	options: RenderToDocumentStreamOptions = {}
): ReadableStream<Uint8Array> {
	return renderToDocumentStream(vnode, {
		...options,
		hydration: options.hydration ?? true
	});
}

/** Transforms to progressive html stream into its required representation. */
export function renderToProgressiveHtmlStream(
	vnode: VNode,
	options: RenderToProgressiveHtmlStreamOptions = {}
): ReadableStream<Uint8Array> {
	return createProgressiveHtmlStream(
		(streamOptions, emit) => streamDocumentRender(vnode, streamOptions, emit),
		options
	);
}

/** Transforms to hydratable progressive html stream into its required representation. */
export function renderToHydratableProgressiveHtmlStream(
	vnode: VNode,
	options: RenderToProgressiveHtmlStreamOptions = {}
): ReadableStream<Uint8Array> {
	return renderToProgressiveHtmlStream(vnode, {
		...options,
		hydration: options.hydration ?? true
	});
}

/** Transforms to progressive html response into its required representation. */
export function renderToProgressiveHtmlResponse(
	vnode: VNode,
	options: RenderToProgressiveHtmlResponseOptions = {}
): ExactResponseLike {
	return progressiveHtmlResponse(renderToProgressiveHtmlStream(vnode, options), options);
}

/** Transforms to hydratable progressive html response into its required representation. */
export function renderToHydratableProgressiveHtmlResponse(
	vnode: VNode,
	options: RenderToProgressiveHtmlResponseOptions = {}
): ExactResponseLike {
	return progressiveHtmlResponse(renderToHydratableProgressiveHtmlStream(vnode, options), options);
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
			const vnode = await render(context);
			const renderOptions = {
				...options,
				contexts: context.contexts?.componentValues,
				signal: options.signal ?? context.signal
			};
			const body =
				options.hydration === false
					? (await renderToStringAsync(vnode, renderOptions)).html
					: (await renderToHydratableStringAsync(vnode, renderOptions)).htmlWithHydration;
			return {
				status: options.status ?? 200,
				headers: {
					'content-type': options.contentType ?? 'text/html; charset=utf-8',
					...(options.headers ?? {})
				},
				body
			};
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
			const vnode = await render(context);
			const renderOptions = {
				...options,
				contexts: context.contexts?.componentValues,
				signal: options.signal ?? context.signal
			};
			// A response's status, headers, and authored head are committed before its
			// body is consumed. Conservatively settle the root before returning the
			// response; lower-level progressive APIs remain available when an
			// application can prove its provisional shell has no pre-commit effects.
			let body: string;
			if (options.hydration === false) {
				const rendered = await renderToStringAsync(vnode, renderOptions);
				body = progressiveRoot(rendered.html, options.rootId);
			} else {
				const rendered = await renderToHydratableStringAsync(vnode, renderOptions);
				body = isRenderedDocument(rendered.html)
					? rendered.htmlWithHydration
					: `${progressiveRoot(rendered.html, options.rootId)}${rendered.hydrationScript}`;
			}
			return {
				status: options.status ?? 200,
				headers: {
					'content-type': options.contentType ?? 'text/html; charset=utf-8',
					...(options.headers ?? {})
				},
				body: '',
				stream: stringStream(body)
			};
		},
		request.platformRequest ?? request
	);
}

/** Performs the progressive root domain operation. */
export function progressiveRoot(html: string, rootId = 'exact-root'): string {
	return isRenderedDocument(html) ? html : `<div id="${escapeAttr(rootId)}">${html}</div>`;
}

/** Reports whether rendered document. */
export function isRenderedDocument(html: string): boolean {
	return /^\s*(?:<!doctype\s+html>\s*)?<html(?:\s|>)/i.test(html);
}

/** Performs the string stream domain operation. */
export function stringStream(value: string): ReadableStream<Uint8Array> {
	const encoded = new TextEncoder().encode(value);
	let emitted = false;
	return new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				if (emitted) {
					controller.close();
					return;
				}
				emitted = true;
				controller.enqueue(encoded);
			}
		},
		{ highWaterMark: 0 }
	);
}
