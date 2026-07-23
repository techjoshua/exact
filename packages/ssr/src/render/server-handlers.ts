import { withTaskObserver } from '@exactjs/core';
import { createExactContextRuntime, type ExactPatch } from '@exactjs/server';
import { boundaryPatch, diffBoundaryHtml, diffKeyedListItems } from '../diff.js';
import { decodeMarkerKey, exactMarkerId, keyedItemMarkerId, markerPair } from '../markup.js';
import {
	assertOutputWithinLimit,
	boundedJoin,
	defaultMaxSsrOutputBytes,
	defaultMaxSsrTreeNodes,
	normalizePositiveLimit
} from '../render/limits.js';
import type {
	ActionRefreshBoundaryOptions,
	ActionRefreshOptions,
	BoundaryRefreshOptions,
	BoundaryRenderFunction,
	ExactBoundaryRenderer,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactServerContext,
	ExactServerHandlerRegistry,
	ExactServerHandlerRegistryOptions,
	ExactServerRuntimeOptions,
	KeyedListRefreshOptions,
	KeyedListSnapshot,
	KeyedListSnapshotItem,
	KeyedListSnapshotOptions,
	KeyedListSnapshotParseOptions,
	RenderToStringOptions
} from '../types.js';
import { renderToStringAsync } from './async-rendering.js';
import { createSsrContext } from './context.js';
import { createSsrOwner, disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { renderVNode } from './sync-tree.js';

/** Creates a boundary refresh handler. */
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

/** Creates an action refresh handler. */
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

/** Creates an exact server handler registry. */
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

/** Creates an exact server runtime. */
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

/** Performs the boundary render function domain operation. */
export function boundaryRenderFunction(renderer: ExactBoundaryRenderer): BoundaryRenderFunction {
	return typeof renderer === 'function' ? renderer : renderer.render;
}

/** Performs the boundary refresh options domain operation. */
export function boundaryRefreshOptions(
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

/** Transforms keyed list snapshot into its required representation. */
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

/** Transforms keyed list snapshot owned into its required representation. */
export function renderKeyedListSnapshotOwned<T>(
	options: KeyedListSnapshotOptions<T>
): KeyedListSnapshot {
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

/** Creates a keyed list refresh handler. */
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

/** Reads a keyed list snapshot html from its source representation. */
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
