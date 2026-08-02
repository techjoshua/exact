import {
	SsrTaskDeadlineError,
	defaultMaxSsrOutputBytes,
	defaultMaxSsrTreeNodes,
	normalizePositiveLimit,
	normalizeSsrTreeDepth
} from '../render/limits.js';
import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import type { RenderToStringOptions, SsrContext } from '../types.js';

/** Performs the drain tasks domain operation. */
export async function drainTasks(
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

/** Performs the await with abort domain operation. */
export async function awaitWithAbort<T>(
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

/** Creates a ssr context. */
export function createSsrContext(options: RenderToStringOptions): SsrContext {
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
		enhancementCatalog: options.enhancementCatalog,
		unavailableEnhancements: new Set(),
		enhancementVNodes: new WeakSet(),
		componentContexts: options.contexts,
		...(options.inspection
			? {
					componentDomain: createFrameworkComponentDomain({
						executionRoot: options.inspection.executionRoot,
						inspection: options.inspection
					})
				}
			: {}),
		onComponentCreated: options.onComponentCreated,
		onComponentRendered: options.onComponentRendered
	};
}
