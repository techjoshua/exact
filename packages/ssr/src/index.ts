import {
	Cell,
	Dynamic,
	Fragment,
	ServerBoundary,
	ServerSlot,
	Text,
	UnsafeHtml,
	attachSuppressedCleanupFailure,
	attemptCleanup,
	createCleanupFailure,
	createComponentInstance,
	createErrorReport,
	createTextVNode,
	createVNode,
	getCellVNode,
	handleComponentError,
	isCellVNode,
	isVNode,
	logFrameworkEvent,
	normalizeRenderResult,
	normalizeDocumentVNode,
	renderInstance,
	throwCleanupFailure,
	withTaskObserver,
	type VNode
} from '@exact/core';
import { flushSync, unwrap } from '@exact/reactive';
import {
	createExactContextRuntime,
	runWithExactRequestScope,
	type ExactPatch
} from '@exact/server';
import { boundaryPatch, diffBoundaryHtml, diffKeyedListItems } from './diff.js';
import { augmentDocumentBody } from './document.js';
import { escapeAttr, escapeText, voidElements } from './html.js';
import { jsonUnsafePath, renderHydrationScript, serializeHydrationPayload } from './hydration.js';
import { processExactOutput, processExactOutputSync } from '@exact/plugin-host/runtime';
import {
	decodeMarkerKey,
	exactMarkerId,
	keyedItemMarkerId,
	markerId,
	markerPair,
	renderAttrs,
	withMarker
} from './markup.js';
import {
	createDocumentEventStream,
	createHtmlStream,
	createProgressiveHtmlStream,
	progressiveHtmlResponse
} from './streams.js';
import {
	SsrTaskDeadlineError,
	SsrTreeDepthError,
	assertOutputCharacterBound,
	assertOutputWithinLimit,
	boundedJoin,
	countSsrNode,
	defaultMaxSsrOutputBytes,
	defaultMaxSsrTreeNodes,
	isSsrRenderInterruption,
	isSsrRenderLimitError,
	normalizePositiveLimit,
	normalizeSsrTreeDepth,
	withSsrTreeDepth,
	withSsrTreeDepthAsync,
	withTaskDeadline
} from './render/limits.js';
import type {
	ActionRefreshOptions,
	ActionRefreshBoundaryOptions,
	BoundaryRenderFunction,
	BoundaryRefreshOptions,
	Child,
	ComponentFunction,
	ComponentInstance,
	ExactBoundaryRenderer,
	ExactDocumentStreamEvent,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactResponseLike,
	ExactRequestLike,
	ExactRequestRenderFunction,
	ExactServerContext,
	ExactServerHandlerRegistry,
	ExactServerHandlerRegistryOptions,
	ExactServerRuntimeOptions,
	HydratableStringResult,
	HydrationScriptOptions,
	KeyedListRefreshOptions,
	KeyedListSnapshot,
	KeyedListSnapshotItem,
	KeyedListSnapshotOptions,
	KeyedListSnapshotParseOptions,
	Logger,
	RenderToDocumentStreamOptions,
	RenderExactRequestToHtmlResponseOptions,
	RenderToProgressiveHtmlResponseOptions,
	RenderToProgressiveHtmlStreamOptions,
	RenderToStringOptions,
	RenderToStringResult,
	SsrProfileEvent,
	SsrContext,
	TaskObserver
} from './types.js';

export type * from './types.js';
export { diffBoundaryHtml, diffKeyedListItems } from './diff.js';
export { renderHydrationScript } from './hydration.js';

type SsrRenderOptions = RenderToStringOptions & { taskDeadline?: number };

/** Renders a vnode tree to an HTML string without waiting for async component tasks. */
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

function renderToStringOwned(vnode: VNode, options: RenderToStringOptions): RenderToStringResult {
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

/** Renders a vnode tree plus the serialized hydration script needed by the client runtime. */
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

/** Renders a vnode tree lazily as demand-driven HTML chunks. */
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

/** Streams document render lifecycle events for shell/final/hydration output. */
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

/** Streams document render events and emits hydration config when available. */
export function renderToHydratableDocumentStream(
	vnode: VNode,
	options: RenderToDocumentStreamOptions = {}
): ReadableStream<Uint8Array> {
	return renderToDocumentStream(vnode, {
		...options,
		hydration: options.hydration ?? true
	});
}

/** Streams progressive HTML assembled from document render lifecycle events. */
export function renderToProgressiveHtmlStream(
	vnode: VNode,
	options: RenderToProgressiveHtmlStreamOptions = {}
): ReadableStream<Uint8Array> {
	return createProgressiveHtmlStream(
		(streamOptions, emit) => streamDocumentRender(vnode, streamOptions, emit),
		options
	);
}

/** Streams progressive HTML with hydration config enabled by default. */
export function renderToHydratableProgressiveHtmlStream(
	vnode: VNode,
	options: RenderToProgressiveHtmlStreamOptions = {}
): ReadableStream<Uint8Array> {
	return renderToProgressiveHtmlStream(vnode, {
		...options,
		hydration: options.hydration ?? true
	});
}

/** Creates a runtime-neutral progressive HTML response. */
export function renderToProgressiveHtmlResponse(
	vnode: VNode,
	options: RenderToProgressiveHtmlResponseOptions = {}
): ExactResponseLike {
	return progressiveHtmlResponse(renderToProgressiveHtmlStream(vnode, options), options);
}

/** Creates a runtime-neutral progressive HTML response with hydration config enabled by default. */
export function renderToHydratableProgressiveHtmlResponse(
	vnode: VNode,
	options: RenderToProgressiveHtmlResponseOptions = {}
): ExactResponseLike {
	return progressiveHtmlResponse(renderToHydratableProgressiveHtmlStream(vnode, options), options);
}

/**
 * Produces an authoritative HTML response after all request providers and
 * component tasks that affect the rendered tree have settled.
 */
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

/**
 * Produces a progressive response in the trusted request scope and retains all
 * request resources until the stream closes or is cancelled.
 */
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

function progressiveRoot(html: string, rootId = 'exact-root'): string {
	return isRenderedDocument(html) ? html : `<div id="${escapeAttr(rootId)}">${html}</div>`;
}

function isRenderedDocument(html: string): boolean {
	return /^\s*(?:<!doctype\s+html>\s*)?<html(?:\s|>)/i.test(html);
}

function stringStream(value: string): ReadableStream<Uint8Array> {
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

/** Renders a vnode tree after waiting for observed async component tasks to settle. */
export async function renderToStringAsync(
	vnode: VNode,
	options: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
	const renderOptions = withTaskDeadline(options);
	const context = createSsrContext(renderOptions);

	const validatedVNode = (await processExactOutput(
		vnode,
		{ kind: 'vnode', signal: options.signal },
		options.outputExtensions ?? []
	)) as VNode;
	const body = await renderVNodeAsync(context, validatedVNode, undefined, renderOptions);
	const html = (await processExactOutput(
		boundedJoin(context, [...context.reactResourceHints, body]),
		{ kind: 'html', signal: options.signal },
		options.outputExtensions ?? []
	)) as string;
	assertOutputWithinLimit(context, html);
	return {
		html,
		state: options.state
	};
}

/** Renders async SSR output plus the serialized hydration script needed by the client runtime. */
export async function renderToHydratableStringAsync(
	vnode: VNode,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): Promise<HydratableStringResult> {
	const result = await renderToStringAsync(vnode, options);
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

async function streamDocumentRender(
	vnode: VNode,
	options: RenderToDocumentStreamOptions & { taskDeadline?: number },
	emit: (event: ExactDocumentStreamEvent) => Promise<void>
): Promise<void> {
	options = withTaskDeadline(options);
	const owner = createSsrOwner();
	let primary: unknown = noPrimaryFailure;
	try {
		await emit({ event: 'start', version: 1 });
		const shell = withTaskObserver(owner.observer, () => renderToStringOwned(vnode, options));
		await emit({ event: 'shell', version: 1, html: shell.html });

		let final = shell;
		if (owner.pending.size) {
			// Initial streaming sends an early shell, drains observed tasks, then emits a
			// root replacement only if the settled tree differs from the shell.
			await drainTasks(
				owner.pending,
				options.maxTaskPasses ?? 10,
				options.signal,
				options.taskDeadline
			);
			final = await renderToStringAsync(vnode, options);
			if (final.html !== shell.html) {
				await emit({
					event: 'replace',
					version: 1,
					id: options.rootId ?? 'document',
					html: final.html
				});
			}
		}

		if (shouldEmitDocumentHydration(options)) {
			await emit({
				event: 'hydration',
				version: 1,
				html: renderHydrationScript({
					pluginRegistryFingerprint: options.pluginRegistryFingerprint,
					endpoint: options.endpoint,
					endpoints: options.endpoints,
					state: final.state,
					stateContracts: options.stateContracts,
					actionBoundaries: options.actionBoundaries,
					scriptId: options.scriptId,
					nonce: options.nonce,
					maxHydrationDepth: options.maxHydrationDepth,
					maxHydrationNodes: options.maxHydrationNodes,
					maxHydrationBytes: options.maxHydrationBytes,
					outputExtensions: options.outputExtensions
				})
			});
		}

		await emit({ event: 'complete', version: 1 });
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		disposePreservingPrimary(
			() => owner.dispose(options.signal?.reason ?? 'ssr stream complete'),
			primary
		);
	}
}

/** Creates a server handler that refreshes one boundary and returns patches plus fallback HTML. */
export function createBoundaryRefreshHandler(
	render: BoundaryRenderFunction,
	options: BoundaryRefreshOptions
): (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> {
	return async (input, context) => {
		const vnode = await render(input, context);
		const result = await renderToStringAsync(vnode, {
			...options,
			contexts: context.contexts?.componentValues ?? options.contexts,
			signal: options.signal ?? context.signal
		});
		const previousHtml = (await options.previousHtml?.(input, context)) ?? input.boundaryHtml;
		return {
			patches:
				previousHtml === undefined
					? [boundaryPatch(options.boundaryId, result.html, options.patchStrategy)]
					: diffBoundaryHtml(options.boundaryId, previousHtml, result.html, options.patchStrategy),
			html: result.html,
			...(result.state === undefined ? {} : { state: result.state })
		};
	};
}

/** Creates a server action handler that runs app work and refreshes affected boundaries. */
export function createActionRefreshHandler(
	options: ActionRefreshOptions
): (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> {
	return async (input, context) => {
		const actionResult: ExactInvocationResult = (await options.action(input, context)) ?? {};
		const patches: ExactPatch[] = [...(actionResult.patches ?? [])];
		let state = actionResult.state;

		for (const boundary of options.boundaries) {
			const vnode = await boundary.render(input, context);
			const result = await renderToStringAsync(vnode, {
				...boundary,
				contexts: context.contexts?.componentValues ?? boundary.contexts,
				signal: boundary.signal ?? context.signal
			});
			const previousHtml =
				(await boundary.previousHtml?.(input, context)) ??
				input.boundaryHtmls?.[boundary.boundaryId];
			patches.push(
				...(previousHtml === undefined
					? [boundaryPatch(boundary.boundaryId, result.html, boundary.patchStrategy)]
					: diffBoundaryHtml(
							boundary.boundaryId,
							previousHtml,
							result.html,
							boundary.patchStrategy
						))
			);
			if (state === undefined && result.state !== undefined) state = result.state;
		}

		return {
			...actionResult,
			patches,
			...(state === undefined ? {} : { state })
		};
	};
}

/** Creates action and boundary handler maps from a manifest and app-provided renderers. */
export function createExactServerHandlerRegistry(
	options: ExactServerHandlerRegistryOptions
): ExactServerHandlerRegistry {
	const refreshBoundaries: NonNullable<ExactServerContext['refreshBoundaries']> = {};
	const actionHandlers: NonNullable<ExactServerContext['actions']> = {};

	for (const id of Object.keys(options.manifest.boundaries ?? {}).sort()) {
		const renderer = options.boundaries?.[id];
		if (!renderer) continue;
		refreshBoundaries[id] = createBoundaryRefreshHandler(
			boundaryRenderFunction(renderer),
			boundaryRefreshOptions(id, renderer, options)
		);
	}

	for (const id of Object.keys(options.manifest.actions ?? {}).sort()) {
		const action = options.actions?.[id];
		if (!action) continue;
		const boundaries = (options.manifest.actionBoundaries?.[id] ?? [])
			.map((boundaryId) => {
				const renderer = options.boundaries?.[boundaryId];
				return renderer
					? {
							...boundaryRefreshOptions(boundaryId, renderer, options),
							render: boundaryRenderFunction(renderer)
						}
					: undefined;
			})
			.filter((boundary): boundary is ActionRefreshBoundaryOptions => boundary !== undefined);
		actionHandlers[id] = boundaries.length
			? createActionRefreshHandler({ action, boundaries })
			: async (input, context) => (await action(input, context)) ?? {};
	}

	return {
		actions: actionHandlers,
		refreshBoundaries
	};
}

/** Creates an eXact server context suitable for the generic endpoint handler. */
export function createExactServerRuntime(options: ExactServerRuntimeOptions): ExactServerContext {
	const registry = createExactServerHandlerRegistry(options);
	const contextRuntime = createExactContextRuntime({
		applicationContexts: options.applicationContexts,
		requestContexts: options.requestContexts,
		contextOverrides: options.contextOverrides
	});
	return {
		manifest: options.manifest,
		...registry,
		authorize: options.authorize,
		validateCsrf: options.validateCsrf,
		logger: options.logger,
		outputExtensions: options.outputExtensions,
		applicationContexts: options.applicationContexts,
		requestContexts: options.requestContexts,
		contextOverrides: options.contextOverrides,
		contextRuntime,
		dispose: () => contextRuntime.dispose()
	};
}

function boundaryRenderFunction(renderer: ExactBoundaryRenderer): BoundaryRenderFunction {
	return typeof renderer === 'function' ? renderer : renderer.render;
}

function boundaryRefreshOptions(
	boundaryId: string,
	renderer: ExactBoundaryRenderer,
	defaults: RenderToStringOptions & { patchStrategy?: BoundaryRefreshOptions['patchStrategy'] }
): BoundaryRefreshOptions {
	if (typeof renderer === 'function') {
		return {
			...defaults,
			boundaryId,
			patchStrategy: defaults.patchStrategy
		};
	}
	return {
		...defaults,
		...renderer,
		boundaryId,
		patchStrategy: renderer.patchStrategy ?? defaults.patchStrategy
	};
}

/** Renders a keyed list snapshot that can later be diffed into list patches. */
export function renderKeyedListSnapshot<T>(
	options: KeyedListSnapshotOptions<T>
): KeyedListSnapshot {
	const owner = createSsrOwner();
	let primary: unknown = noPrimaryFailure;
	try {
		return withTaskObserver(owner.observer, () => renderKeyedListSnapshotOwned(options));
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		disposePreservingPrimary(() => owner.dispose('keyed snapshot render complete'), primary);
	}
}

function renderKeyedListSnapshotOwned<T>(options: KeyedListSnapshotOptions<T>): KeyedListSnapshot {
	const context = createSsrContext(options);
	const items: KeyedListSnapshotItem[] = [];
	const html: string[] = [];
	const keys = new Set<string>();
	for (const item of options.items) {
		const key = String(options.key(item));
		if (keys.has(key))
			throw new Error(`Duplicate key ${JSON.stringify(key)} in keyed-list snapshot`);
		keys.add(key);
		const child = options.render(item);
		const itemHtml = markerPair(context, keyedItemMarkerId(key), () =>
			renderVNode(context, { ...child, key }, undefined)
		);
		items.push({ key, html: itemHtml });
		html.push(itemHtml);
	}

	const innerHtml = boundedJoin(context, html);
	const snapshotHtml = markerPair(context, exactMarkerId(options.listId), () => innerHtml);
	assertOutputWithinLimit(context, snapshotHtml);

	return {
		listId: options.listId,
		html: snapshotHtml,
		innerHtml,
		items
	};
}

/** Creates a boundary refresh handler specialized for keyed list patch generation. */
export function createKeyedListRefreshHandler<T>(
	options: KeyedListRefreshOptions<T>
): (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> {
	return async (input, context) => {
		const nextItems = await options.items(input, context);
		const next = renderKeyedListSnapshot({
			...options,
			items: nextItems
		});
		const previous =
			(await options.previousItems?.(input, context)) ??
			parseKeyedListSnapshotHtml(options.listId, input.boundaryHtml, {
				maxBytes: options.maxOutputBytes,
				maxItems: options.maxTreeNodes
			})?.items;
		return {
			patches: previous
				? diffKeyedListItems(options.listId, previous, next.items)
				: [{ type: 'replace', id: options.listId, html: next.innerHtml } as ExactPatch]
		};
	};
}

/** Parses framework-shaped keyed list HTML back into a snapshot for diffing. */
export function parseKeyedListSnapshotHtml(
	listId: string,
	html: string | undefined,
	options: KeyedListSnapshotParseOptions = {}
): KeyedListSnapshot | undefined {
	if (html === undefined) return undefined;
	const maxBytes = normalizePositiveLimit(options.maxBytes, defaultMaxSsrOutputBytes);
	const maxItems = normalizePositiveLimit(options.maxItems, defaultMaxSsrTreeNodes);
	const maxMarkers = normalizePositiveLimit(options.maxMarkers, defaultMaxSsrTreeNodes * 2);
	if (html.length > maxBytes || new TextEncoder().encode(html).byteLength > maxBytes)
		return undefined;
	const items: KeyedListSnapshotItem[] = [];
	const keys = new Set<string>();
	const stack: Array<{ id: string; start: number; item: boolean; key?: string }> = [];
	let cursor = 0;
	let markers = 0;
	let activeItemMarkers = 0;
	while (cursor < html.length) {
		const start = html.indexOf('<!--', cursor);
		if (start < 0) break;
		const end = html.indexOf('-->', start + 4);
		if (end < 0) return undefined;
		cursor = end + 3;
		const comment = html.slice(start + 4, end);
		if (!comment.startsWith('exact:') && !comment.startsWith('/exact:')) continue;
		if (++markers > maxMarkers) return undefined;
		if (comment.startsWith('exact:')) {
			const id = comment.slice('exact:'.length);
			if (!id) return undefined;
			const item = id.startsWith('item:');
			const topLevelItem = item && activeItemMarkers === 0;
			const key = topLevelItem ? decodeMarkerKey(id.slice('item:'.length)) : undefined;
			if (item) activeItemMarkers++;
			stack.push({ id, start, item, ...(key === undefined ? {} : { key }) });
			continue;
		}
		const id = comment.slice('/exact:'.length);
		const frame = stack.pop();
		if (!frame || frame.id !== id) return undefined;
		if (frame.item) activeItemMarkers--;
		if (frame.key === undefined) continue;
		if (keys.has(frame.key) || items.length >= maxItems) return undefined;
		keys.add(frame.key);
		items.push({ key: frame.key, html: html.slice(frame.start, end + 3) });
	}
	if (stack.length || !items.length) return undefined;
	const snapshotHtml = markerPair(
		createSsrContext({ markers: true }),
		exactMarkerId(listId),
		() => html
	);
	if (
		snapshotHtml.length > maxBytes ||
		new TextEncoder().encode(snapshotHtml).byteLength > maxBytes
	)
		return undefined;
	return {
		listId,
		html: snapshotHtml,
		innerHtml: html,
		items
	};
}

function* renderVNodeChunks(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	depth: number
): Generator<string> {
	if (depth > context.maxTreeDepth) throw new SsrTreeDepthError(context.maxTreeDepth);
	countSsrNode(context);
	const marked = function* (id: string, content: () => Generator<string>): Generator<string> {
		if (context.markers) yield `<!--exact:${id}-->`;
		yield* content();
		if (context.markers) yield `<!--/exact:${id}-->`;
	};

	if (isCellVNode(vnode)) {
		const id = markerId(context, 'cell', undefined, vnode.key);
		yield* marked(id, () => renderVNodeChunks(context, getCellVNode(vnode), parent, depth + 1));
		return;
	}
	if (vnode.type === Text) {
		yield escapeText(String(unwrap(vnode.props.value) ?? ''));
		return;
	}
	if (vnode.type === UnsafeHtml) {
		const id = markerId(context, 'unsafe-html', undefined, vnode.key);
		yield* marked(id, function* () {
			yield renderUnsafeHtml(context, vnode);
		});
		return;
	}
	if (vnode.type === Fragment) {
		const list = vnode.props.list as
			| {
					collection: Iterable<unknown>;
					source?: { get(): Iterable<unknown> };
					key(item: unknown): string;
					render(item: unknown): VNode;
			  }
			| undefined;
		const id =
			list && vnode.key
				? exactMarkerId(vnode.key)
				: markerId(context, 'fragment', undefined, vnode.key);
		yield* marked(id, function* () {
			if (!list) {
				for (const child of vnode.children)
					yield* renderChildChunks(context, child, parent, depth + 1);
				return;
			}
			const collection = list.source ? list.source.get() : list.collection;
			for (const item of collection) {
				const key = String(list.key(item));
				const child = list.render(item);
				yield* marked(markerId(context, 'item', undefined, key), () =>
					renderVNodeChunks(context, { ...child, key }, parent, depth + 1)
				);
			}
		});
		return;
	}
	if (vnode.type === Dynamic) {
		const id = markerId(context, 'dynamic', undefined, vnode.key);
		yield* marked(id, function* () {
			for (const child of normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[])) {
				yield* renderChildChunks(context, child, parent, depth + 1);
			}
		});
		return;
	}
	if (vnode.type === ServerBoundary) {
		const id = String(unwrap(vnode.props.id) ?? '');
		const name = String(unwrap(vnode.props.name) ?? '');
		const props = clientBoundaryProps(vnode);
		const unsafePath = jsonUnsafePath(props);
		if (unsafePath) throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
		const marker = markerId(context, 'client-boundary', name, id);
		yield* marked(marker, function* () {
			yield `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">`;
			if (vnode.children.length) {
				yield `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">`;
				for (const child of vnode.children)
					yield* renderChildChunks(context, child, parent, depth + 1);
				yield '</span>';
			}
			yield '</div>';
		});
		return;
	}
	if (vnode.type === ServerSlot) return;
	if (typeof vnode.type === 'function') {
		const componentId = markerId(context, 'component', componentName(vnode.type), vnode.key);
		let childParent = parent;
		let children: Child[];
		try {
			const instance = createComponentInstance(
				vnode.type as ComponentFunction<any, Record<string, unknown>>,
				getComponentProps(vnode),
				parent,
				context.componentContexts
			);
			childParent = instance;
			children = renderInstance(instance, () => undefined);
		} catch (error) {
			if (isSsrRenderLimitError(error)) throw error;
			const fallback = handleComponentError(
				parent,
				createErrorReport(error, 'construct', parent, componentName(vnode.type))
			);
			children = fallback ? normalizeRenderResult(fallback()) : [];
		}
		// Construction is recoverable before bytes are emitted. Once a component
		// starts streaming, descendant failures fail the stream rather than
		// appending fallback HTML after an already-emitted partial boundary.
		const rendered = function* () {
			for (const child of children)
				yield* renderChildChunks(context, child, childParent, depth + 1);
		};
		if (context.documentProbe && context.hostStack.length === 0) {
			yield* renderRootComponentChunks(context, componentId, rendered());
		} else {
			yield* marked(componentId, rendered);
		}
		return;
	}

	const host = enterHost(context, vnode);
	const hostVNode = host.vnode;
	const tag = host.tag;
	try {
		const hostProps = reactHostProps(context, hostVNode);
		registerReactImagePreload(context, tag, hostProps);
		yield `${host.prefix}<${tag}${renderAttrs(hostProps, context.reactMarkup, tag)}${context.reactMarkup && voidElements.has(tag) ? '/' : ''}>`;
		if (voidElements.has(tag)) return;
		const raw = reactHostContent(context, hostVNode);
		if (raw !== undefined) yield raw;
		else {
			const previousSelect = context.reactSelectValue;
			if (context.reactMarkup && tag === 'select')
				context.reactSelectValue = unwrap(hostVNode.props.value ?? hostVNode.props.defaultValue);
			try {
				for (const child of hostVNode.children)
					yield* renderChildChunks(context, child, parent, depth + 1);
			} finally {
				context.reactSelectValue = previousSelect;
			}
		}
		yield `</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

function* renderRootComponentChunks(
	context: SsrContext,
	componentId: string,
	rendered: Generator<string>
): Generator<string> {
	const first = rendered.next();
	const document = context.documentRootSeen;
	if (!document && context.markers) yield `<!--exact:${componentId}-->`;
	if (!first.done) yield first.value;
	yield* rendered;
	if (!document && context.markers) yield `<!--/exact:${componentId}-->`;
}

function* renderChildChunks(
	context: SsrContext,
	child: Child,
	parent: ComponentInstance<any> | undefined,
	depth: number
): Generator<string> {
	if (isVNode(child)) yield* renderVNodeChunks(context, child, parent, depth);
	else {
		countSsrNode(context);
		if (child === null || child === undefined || child === false || child === true) return;
		claimRootText(context);
		yield escapeText(String(unwrap(child)));
	}
}

function renderChildren(
	context: SsrContext,
	children: readonly Child[],
	parent?: ComponentInstance<any>
): string {
	const html: string[] = [];
	let previousWasText = false;
	for (const child of children) {
		const rendered = renderChild(context, child, parent);
		const isText = !isVNode(child) && rendered !== '';
		if (context.textSeparators && isText && previousWasText) html.push('<!-- -->');
		if (rendered !== '') html.push(rendered);
		if (isVNode(child)) previousWasText = false;
		else if (isText) previousWasText = true;
	}
	return boundedJoin(context, html);
}

function renderChild(context: SsrContext, child: Child, parent?: ComponentInstance<any>): string {
	if (isVNode(child)) return renderVNode(context, child, parent);
	countSsrNode(context);
	if (child === null || child === undefined || child === false || child === true) return '';
	claimRootText(context);
	return escapeText(String(unwrap(child)));
}

function renderVNode(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
	return withSsrTreeDepth(context, () => {
		countSsrNode(context);
		const html = renderVNodeInner(context, vnode, parent);
		assertOutputCharacterBound(context, html);
		return html;
	});
}

function renderVNodeInner(
	context: SsrContext,
	vnode: VNode,
	parent?: ComponentInstance<any>
): string {
	if (isCellVNode(vnode)) {
		return withMarker(context, 'cell', vnode.key, () =>
			renderVNode(context, getCellVNode(vnode), parent)
		);
	}

	if (vnode.type === Text) {
		return escapeText(String(unwrap(vnode.props.value) ?? ''));
	}

	if (vnode.type === UnsafeHtml) {
		return markerPair(context, markerId(context, 'unsafe-html', undefined, vnode.key), () =>
			renderUnsafeHtml(context, vnode)
		);
	}

	if (vnode.type === Fragment) {
		const list = vnode.props.list as
			| {
					collection: Iterable<unknown>;
					source?: { get(): Iterable<unknown> };
					key(item: unknown): string;
					render(item: unknown): VNode;
			  }
			| undefined;
		const marker =
			list && vnode.key
				? exactMarkerId(vnode.key)
				: markerId(context, 'fragment', undefined, vnode.key);
		return markerPair(context, marker, () => {
			if (!list) return renderChildren(context, vnode.children, parent);
			const collection = list.source ? list.source.get() : list.collection;
			const html: string[] = [];
			for (const item of collection) {
				const child = list.render(item);
				html.push(
					withMarker(context, 'item', String(list.key(item)), () =>
						renderVNode(context, { ...child, key: String(list.key(item)) }, parent)
					)
				);
			}
			return boundedJoin(context, html);
		});
	}

	if (vnode.type === Dynamic) {
		return withMarker(context, 'dynamic', vnode.key, () => {
			return renderChildren(
				context,
				normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]),
				parent
			);
		});
	}

	if (vnode.type === ServerBoundary) {
		return renderServerBoundary(context, vnode);
	}

	if (vnode.type === ServerSlot) {
		return '';
	}

	if (typeof vnode.type === 'function') {
		return renderComponent(context, vnode, parent);
	}

	return renderElement(context, vnode, parent);
}

async function renderChildrenAsync(
	context: SsrContext,
	children: readonly Child[],
	parent: ComponentInstance<any> | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const html: string[] = [];
	let previousWasText = false;
	for (const child of children) {
		const rendered = await renderChildAsync(context, child, parent, options);
		const isText = !isVNode(child) && rendered !== '';
		if (context.textSeparators && isText && previousWasText) html.push('<!-- -->');
		if (rendered !== '') html.push(rendered);
		if (isVNode(child)) previousWasText = false;
		else if (isText) previousWasText = true;
	}
	return boundedJoin(context, html);
}

async function renderChildAsync(
	context: SsrContext,
	child: Child,
	parent: ComponentInstance<any> | undefined,
	options: RenderToStringOptions
): Promise<string> {
	if (isVNode(child)) return renderVNodeAsync(context, child, parent, options);
	countSsrNode(context);
	if (child === null || child === undefined || child === false || child === true) return '';
	claimRootText(context);
	return escapeText(String(unwrap(child)));
}

async function renderVNodeAsync(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	options: SsrRenderOptions
): Promise<string> {
	return withSsrTreeDepthAsync(context, async () => {
		countSsrNode(context);
		const html = await renderVNodeAsyncInner(context, vnode, parent, options);
		assertOutputCharacterBound(context, html);
		return html;
	});
}

async function renderVNodeAsyncInner(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	options: SsrRenderOptions
): Promise<string> {
	if (isCellVNode(vnode)) {
		return markerPair(context, markerId(context, 'cell', undefined, vnode.key), async () =>
			renderVNodeAsync(context, getCellVNode(vnode), parent, options)
		);
	}

	if (vnode.type === Text) {
		return escapeText(String(unwrap(vnode.props.value) ?? ''));
	}

	if (vnode.type === UnsafeHtml) {
		return markerPair(context, markerId(context, 'unsafe-html', undefined, vnode.key), () =>
			renderUnsafeHtml(context, vnode)
		);
	}

	if (vnode.type === Fragment) {
		const list = vnode.props.list as
			| {
					collection: Iterable<unknown>;
					source?: { get(): Iterable<unknown> };
					key(item: unknown): string;
					render(item: unknown): VNode;
			  }
			| undefined;
		const marker =
			list && vnode.key
				? exactMarkerId(vnode.key)
				: markerId(context, 'fragment', undefined, vnode.key);
		return markerPair(context, marker, async () => {
			if (!list) return renderChildrenAsync(context, vnode.children, parent, options);
			const collection = list.source ? list.source.get() : list.collection;
			const html: string[] = [];
			for (const item of collection) {
				const key = String(list.key(item));
				const child = list.render(item);
				html.push(
					await markerPair(context, markerId(context, 'item', undefined, key), async () =>
						renderVNodeAsync(context, { ...child, key }, parent, options)
					)
				);
			}
			return boundedJoin(context, html);
		});
	}

	if (vnode.type === Dynamic) {
		return markerPair(context, markerId(context, 'dynamic', undefined, vnode.key), async () => {
			return renderChildrenAsync(
				context,
				normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]),
				parent,
				options
			);
		});
	}

	if (vnode.type === ServerBoundary) {
		return renderServerBoundaryAsync(context, vnode, parent, options);
	}

	if (vnode.type === ServerSlot) {
		return '';
	}

	if (typeof vnode.type === 'function') {
		return renderComponentAsync(context, vnode, parent, options);
	}

	const host = enterHost(context, vnode);
	const hostVNode = host.vnode;
	const tag = host.tag;
	try {
		const hostProps = reactHostProps(context, hostVNode);
		registerReactImagePreload(context, tag, hostProps);
		const attrs = renderAttrs(hostProps, context.reactMarkup, tag);
		if (voidElements.has(tag))
			return `${host.prefix}<${tag}${attrs}${context.reactMarkup ? '/' : ''}>`;
		const raw = reactHostContent(context, hostVNode);
		let content: string;
		if (raw !== undefined) content = raw;
		else {
			const previousSelect = context.reactSelectValue;
			if (context.reactMarkup && tag === 'select')
				context.reactSelectValue = unwrap(hostVNode.props.value ?? hostVNode.props.defaultValue);
			try {
				content = await renderChildrenAsync(context, hostVNode.children, parent, options);
			} finally {
				context.reactSelectValue = previousSelect;
			}
		}
		return `${host.prefix}<${tag}${attrs}>${content}</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

function renderComponent(
	context: SsrContext,
	vnode: VNode,
	parent?: ComponentInstance<any>
): string {
	const componentId = markerId(context, 'component', componentName(vnode.type), vnode.key);
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	try {
		const instance = createComponentInstance(
			vnode.type as ComponentFunction<any, Record<string, unknown>>,
			getComponentProps(vnode),
			parent,
			context.componentContexts
		);
		let invalidated = false;
		for (let pass = 0; pass < 25; pass++) {
			if (documentProbe) resetDocumentProbe(context);
			invalidated = false;
			const children = renderInstance(instance, () => {
				invalidated = true;
			});
			const html = renderChildren(context, children, instance);
			flushSync();
			if (!invalidated)
				return documentProbe && context.documentRootSeen
					? html
					: markerPair(context, componentId, () => html);
		}
		throw new Error('eXact SSR component did not stabilize after 25 render passes');
	} catch (error) {
		if (isSsrRenderLimitError(error)) throw error;
		const fallback = handleComponentError(
			parent,
			createErrorReport(error, 'construct', parent, componentName(vnode.type))
		);
		const html = fallback ? renderChildren(context, normalizeRenderResult(fallback()), parent) : '';
		return documentProbe && context.documentRootSeen
			? html
			: markerPair(context, componentId, () => html);
	}
}

async function renderComponentAsync(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	options: SsrRenderOptions
): Promise<string> {
	const componentId = markerId(context, 'component', componentName(vnode.type), vnode.key);
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	let instance: ComponentInstance<any> | undefined;
	let primary: unknown = noPrimaryFailure;
	try {
		try {
			const pending = new Set<Promise<unknown>>();
			const observer: TaskObserver = {
				register: (promise) => {
					let observed: Promise<unknown>;
					observed = promise.finally(() => pending.delete(observed));
					pending.add(observed);
				},
				retain() {}
			};
			instance = withTaskObserver(observer, () =>
				createComponentInstance(
					vnode.type as ComponentFunction<any, Record<string, unknown>>,
					getComponentProps(vnode),
					parent,
					context.componentContexts
				)
			);
			await drainTasks(pending, options.maxTaskPasses ?? 10, options.signal, options.taskDeadline);
			let invalidated = false;
			const maxPasses = options.maxTaskPasses ?? 10;
			for (let pass = 0; pass < maxPasses; pass++) {
				if (documentProbe) resetDocumentProbe(context);
				invalidated = false;
				const children = renderInstance(instance!, () => {
					invalidated = true;
				});
				const html = await renderChildrenAsync(context, children, instance, options);
				await drainTasks(pending, maxPasses, options.signal, options.taskDeadline);
				flushSync();
				if (!invalidated)
					return documentProbe && context.documentRootSeen
						? html
						: markerPair(context, componentId, () => html);
			}
			throw new Error(
				`eXact async SSR component did not stabilize after ${maxPasses} render passes`
			);
		} catch (error) {
			if (isSsrRenderInterruption(error, options.signal)) throw error;
			const fallback = handleComponentError(
				parent,
				createErrorReport(error, 'construct', parent, componentName(vnode.type))
			);
			const html = fallback
				? await renderChildrenAsync(context, normalizeRenderResult(fallback()), parent, options)
				: '';
			return documentProbe && context.documentRootSeen
				? html
				: markerPair(context, componentId, () => html);
		}
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		if (instance)
			disposePreservingPrimary(
				() => instance!.unmount(String(options.signal?.reason ?? 'ssr render complete')),
				primary
			);
	}
}

function createSsrOwner(): {
	observer: TaskObserver;
	pending: Set<Promise<unknown>>;
	dispose(reason?: unknown): void;
} {
	const pending = new Set<Promise<unknown>>();
	const instances = new Set<ComponentInstance<any>>();
	return {
		pending,
		observer: {
			register(promise) {
				let observed: Promise<unknown>;
				observed = promise.finally(() => pending.delete(observed));
				pending.add(observed);
			},
			retain(instance) {
				instances.add(instance);
			}
		},
		dispose(reason = 'ssr render complete') {
			// Children are constructed after parents; dispose in reverse order so a
			// parent context stays valid throughout child teardown.
			const failure = createCleanupFailure();
			for (const instance of [...instances].reverse())
				attemptCleanup(failure, () => instance.unmount(String(reason)));
			instances.clear();
			throwCleanupFailure(failure);
		}
	};
}

const noPrimaryFailure = Symbol('no primary SSR failure');

function disposePreservingPrimary(dispose: () => void, primary: unknown): void {
	try {
		dispose();
	} catch (cleanup) {
		if (primary === noPrimaryFailure) throw cleanup;
		attachSuppressedCleanupFailure(primary, cleanup);
	}
}

function renderElement(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
	const host = enterHost(context, vnode);
	const hostVNode = host.vnode;
	const tag = host.tag;
	try {
		const hostProps = reactHostProps(context, hostVNode);
		registerReactImagePreload(context, tag, hostProps);
		const attrs = renderAttrs(hostProps, context.reactMarkup, tag);
		if (voidElements.has(tag))
			return `${host.prefix}<${tag}${attrs}${context.reactMarkup ? '/' : ''}>`;
		const raw = reactHostContent(context, hostVNode);
		let content: string;
		if (raw !== undefined) content = raw;
		else {
			const previousSelect = context.reactSelectValue;
			if (context.reactMarkup && tag === 'select')
				context.reactSelectValue = unwrap(hostVNode.props.value ?? hostVNode.props.defaultValue);
			try {
				content = renderChildren(context, hostVNode.children, parent);
			} finally {
				context.reactSelectValue = previousSelect;
			}
		}
		return `${host.prefix}<${tag}${attrs}>${content}</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

function enterHost(
	context: SsrContext,
	input: VNode
): { vnode: VNode; tag: string; prefix: string } {
	let vnode = input;
	const tag = String(vnode.type).toLowerCase();
	const parentTag = context.hostStack[context.hostStack.length - 1];

	if (tag === 'html') {
		if (!context.documentProbe || context.hostStack.length || context.documentRootSeen) {
			throw new Error(
				'A root document may contain exactly one top-level <html> element; nested or duplicate <html> elements are not allowed.'
			);
		}
		vnode = normalizeDocumentVNode(vnode);
		context.documentProbe = false;
		context.documentRootSeen = true;
	} else if (!context.hostStack.length) {
		if (context.documentRootSeen) {
			throw new Error('A root document cannot render host content outside its <html> element.');
		}
		context.documentProbe = false;
	}

	if (context.documentRootSeen && (tag === 'head' || tag === 'body')) {
		if (parentTag !== 'html') {
			throw new Error(`<${tag}> is only valid as a direct child of the root <html> element.`);
		}
		if (tag === 'head') {
			if (context.documentHeadSeen)
				throw new Error('A root document may contain at most one <head> element.');
			context.documentHeadSeen = true;
		} else {
			if (context.documentBodySeen)
				throw new Error('A root document may contain at most one <body> element.');
			context.documentBodySeen = true;
		}
	}

	context.hostStack.push(tag);
	return {
		vnode,
		tag,
		prefix: tag === 'html' && context.documentRootSeen ? '<!doctype html>' : ''
	};
}

function leaveHost(context: SsrContext, tag: string): void {
	const current = context.hostStack.pop();
	if (current !== tag) throw new Error('eXact SSR host traversal became unbalanced.');
}

function claimRootText(context: SsrContext): void {
	if (context.hostStack.length) return;
	if (context.documentRootSeen)
		throw new Error('A root document cannot render text outside its <html> element.');
	context.documentProbe = false;
}

function resetDocumentProbe(context: SsrContext): void {
	context.documentProbe = true;
	context.documentRootSeen = false;
	context.documentHeadSeen = false;
	context.documentBodySeen = false;
	context.hostStack.length = 0;
}

function reactHostContent(context: SsrContext, vnode: VNode): string | undefined {
	const tag = String(vnode.type);
	if (!context.reactMarkup) {
		if (tag === 'script' || tag === 'style') return primitiveText(vnode.children);
		return undefined;
	}
	const value = vnode.props.dangerouslySetInnerHTML;
	if (value && typeof value === 'object' && '__html' in value) {
		if (vnode.children.length)
			throw new Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.');
		return String((value as { __html?: unknown }).__html ?? '');
	}
	if (tag === 'textarea') {
		const content =
			unwrap(vnode.props.value ?? vnode.props.defaultValue) ?? primitiveText(vnode.children);
		return escapeText(String(content ?? ''));
	}
	if (tag === 'style' || (tag === 'script' && context.reactMarkup === 19))
		return primitiveText(vnode.children);
	return undefined;
}

function renderUnsafeHtml(context: SsrContext, vnode: VNode): string {
	if (!context.allowUnsafeHtml) {
		throw new Error('unsafeHtml() requires allowUnsafeHtml: true on the native eXact SSR root.');
	}
	const html = String(unwrap(vnode.props.value) ?? '');
	context.onUnsafeHtml?.({ characters: html.length });
	return html;
}

function primitiveText(children: readonly Child[]): string {
	let text = '';
	for (const child of children) {
		if (child === null || child === undefined || child === false || child === true) continue;
		if (isVNode(child))
			throw new Error('React text-only host elements cannot contain an element child');
		text += String(unwrap(child));
	}
	return text;
}

function reactHostProps(context: SsrContext, vnode: VNode): Record<string, unknown> {
	if (!context.reactMarkup || vnode.type !== 'option' || context.reactSelectValue === undefined)
		return vnode.props;
	const value = String(unwrap(vnode.props.value) ?? primitiveText(vnode.children));
	const selected = Array.isArray(context.reactSelectValue)
		? context.reactSelectValue.some((item) => String(unwrap(item)) === value)
		: String(unwrap(context.reactSelectValue)) === value;
	return { ...vnode.props, selected };
}

function registerReactImagePreload(
	context: SsrContext,
	tag: string,
	props: Record<string, unknown>
): void {
	if (context.reactMarkup !== 19 || tag !== 'img') return;
	const src = unwrap(props.src);
	if (
		typeof src !== 'string' ||
		!src ||
		unwrap(props.loading) === 'lazy' ||
		unwrap(props.fetchPriority) === 'low'
	)
		return;
	const key = `image:${src}`;
	if (context.reactResourceKeys.has(key)) return;
	context.reactResourceKeys.add(key);
	const crossOrigin = unwrap(props.crossOrigin);
	const suffix =
		crossOrigin === undefined ? '' : ` crossorigin="${escapeAttr(String(crossOrigin))}"`;
	context.reactResourceHints.push(
		`<link rel="preload" as="image" href="${escapeAttr(src)}"${suffix}/>`
	);
}

function renderServerBoundary(context: SsrContext, vnode: VNode): string {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const props = clientBoundaryProps(vnode);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const children = renderServerBoundaryChildren(context, vnode, undefined);
	// Client boundary props are serialized into an attribute, while children are
	// represented as server slots so the client bundle does not need server-only code.
	const html = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">${children}</div>`;
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

async function renderServerBoundaryAsync(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const props = clientBoundaryProps(vnode);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const slotId = serverSlotId(id);
	const children = vnode.children.length
		? `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${await renderChildrenAsync(context, vnode.children, parent, options)}</span>`
		: '';
	const html = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">${children}</div>`;
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

function clientBoundaryProps(vnode: VNode): Record<string, unknown> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const rawProps = unwrap(vnode.props.props) ?? {};
	const props =
		rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps)
			? { ...(rawProps as Record<string, unknown>) }
			: rawProps;
	if (
		vnode.children.length &&
		props &&
		typeof props === 'object' &&
		!Array.isArray(props) &&
		!('children' in props)
	) {
		(props as Record<string, unknown>).children = serverSlotPayload(serverSlotId(id));
	}
	return props as Record<string, unknown>;
}

function clientBoundarySerializationMessage(name: string, id: string, unsafePath: string): string {
	const label = name || id;
	const location = name && id ? `${label} (${id})` : label;
	const generatedBucket = clientBoundaryGeneratedBucket(unsafePath);
	const generatedHint = generatedBucket ? ` in generated ${generatedBucket} payload` : '';
	return `Client boundary ${location} props must be JSON-serializable; non-serializable value at ${unsafePath}${generatedHint}`;
}

function clientBoundaryGeneratedBucket(path: string): string | undefined {
	const match = /^\$\.(__exact[A-Za-z0-9_$]*)(?:\.|\[|$)/.exec(path);
	return match?.[1];
}

function renderServerBoundaryChildren(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined
): string {
	if (!vnode.children.length) return '';
	const slotId = serverSlotId(String(unwrap(vnode.props.id) ?? ''));
	return `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${renderChildren(context, vnode.children, parent)}</span>`;
}

function serverSlotId(boundaryId: string): string {
	return `${boundaryId}:children`;
}

function serverSlotPayload(id: string): Record<string, string> {
	return { __exactServerSlot: id };
}

function shouldEmitDocumentHydration(options: RenderToDocumentStreamOptions): boolean {
	if (options.hydration === false) return false;
	if (options.hydration === true) return true;
	return (
		options.endpoint !== undefined ||
		options.endpoints !== undefined ||
		options.state !== undefined ||
		options.stateContracts !== undefined ||
		options.actionBoundaries !== undefined ||
		options.scriptId !== undefined ||
		options.nonce !== undefined
	);
}

function getComponentProps(vnode: VNode): Record<string, unknown> {
	const props = { ...vnode.props };
	if (vnode.children.length === 1) props.children = vnode.children[0];
	else if (vnode.children.length > 1) props.children = vnode.children;
	return props;
}

function componentName(type: VNode['type']): string {
	return typeof type === 'function' ? type.name || 'anonymous' : String(type);
}

async function drainTasks(
	pending: Set<Promise<unknown>>,
	maxPasses: number,
	signal?: AbortSignal,
	deadline?: number
): Promise<void> {
	for (let pass = 0; pending.size && pass < maxPasses; pass++) {
		if (signal?.aborted)
			throw signal.reason ?? new DOMException('SSR render aborted', 'AbortError');
		await awaitWithAbort(Promise.all([...pending]), signal, deadline);
	}
	if (pending.size) {
		throw new Error(`SSR task drain exceeded ${maxPasses} passes`);
	}
}

async function awaitWithAbort<T>(
	promise: Promise<T>,
	signal?: AbortSignal,
	deadline?: number
): Promise<T> {
	if (signal?.aborted) throw signal.reason ?? new DOMException('SSR render aborted', 'AbortError');
	const remaining = deadline === undefined ? undefined : deadline - Date.now();
	if (remaining !== undefined && remaining <= 0) throw new SsrTaskDeadlineError();
	let abort!: () => void;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const interrupted = new Promise<never>((_, reject) => {
		if (signal) {
			abort = () => reject(signal.reason ?? new DOMException('SSR render aborted', 'AbortError'));
			signal.addEventListener('abort', abort, { once: true });
		}
		if (remaining !== undefined)
			timer = setTimeout(() => reject(new SsrTaskDeadlineError()), remaining);
	});
	try {
		return await Promise.race([promise, interrupted]);
	} finally {
		if (signal && abort) signal.removeEventListener('abort', abort);
		if (timer) clearTimeout(timer);
	}
}

function createSsrContext(options: RenderToStringOptions): SsrContext {
	return {
		markers: options.markers ?? true,
		textSeparators: options.textSeparators ?? false,
		reactMarkup: options.reactMarkup ?? false,
		nextId: 0,
		logger: options.logger,
		maxTreeDepth: normalizeSsrTreeDepth(options.maxTreeDepth),
		traversalDepth: 0,
		maxTreeNodes: normalizePositiveLimit(options.maxTreeNodes, defaultMaxSsrTreeNodes),
		traversedNodes: 0,
		maxOutputBytes: normalizePositiveLimit(options.maxOutputBytes, defaultMaxSsrOutputBytes),
		reactResourceHints: [],
		reactResourceKeys: new Set(),
		allowUnsafeHtml: options.allowUnsafeHtml ?? false,
		onUnsafeHtml: options.onUnsafeHtml,
		documentProbe: true,
		documentRootSeen: false,
		documentHeadSeen: false,
		documentBodySeen: false,
		hostStack: [],
		componentContexts: options.contexts
	};
}
