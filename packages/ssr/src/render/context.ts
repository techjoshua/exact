import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import {
	defaultMaxSsrOutputBytes,
	normalizePositiveLimit,
	normalizeSsrTreeDepth
} from '../render/limits.js';
import type { RenderToStringOptions, SsrContext } from '../types.js';

/** Performs the drain tasks domain operation. */
export async function drainTasks(
	pending: Set<Promise<unknown>>,
	maxPasses: number,
	signal?: AbortSignal
): Promise<void> {
	for (let pass = 0; pending.size && pass < maxPasses; pass++) {
		if (signal?.aborted) throw signal.reason;
		await awaitWithAbort(Promise.all(pending), signal);
	}
	if (pending.size) {
		throw new Error(`SSR task drain exceeded ${maxPasses} passes`);
	}
}

/** Performs the await with abort domain operation. */
export async function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (signal?.aborted) {
		// The supplied work already exists and may reject after cancellation disposes its owner.
		void promise.catch(() => {});
		throw signal.reason;
	}
	if (!signal) return promise;
	let abort!: () => void;
	const interrupted = new Promise<never>((_, reject) => {
		abort = () => reject(signal.reason);
		signal.addEventListener('abort', abort, { once: true });
	});
	try {
		return await Promise.race([promise, interrupted]);
	} finally {
		signal.removeEventListener('abort', abort);
	}
}

/** Creates request-owned render state; task scheduling is allocated on first use. */
export function createSsrContext(options: RenderToStringOptions): SsrContext {
	const wallClockSnapshot = Date.now();
	const context: SsrContext = {
		executionRoot: options.executionRoot ?? 'page',
		buildKey: options.buildKey,
		markers: options.markers ?? true,
		textSeparators: options.textSeparators ?? false,
		reactMarkup: options.reactMarkup ?? false,
		nextId: 0,
		logger: options.logger,
		maxTaskPasses: normalizePositiveLimit(options.maxTaskPasses, 10),
		maxTreeDepth: normalizeSsrTreeDepth(options.maxTreeDepth),
		traversalDepth: 0,
		maxTreeNodes: normalizePositiveLimit(options.maxTreeNodes, Infinity),
		traversedNodes: 0,
		maxOutputBytes: normalizePositiveLimit(options.maxOutputBytes, defaultMaxSsrOutputBytes),
		dynamicComponentArtifacts: options.dynamicComponentArtifacts,
		maxDynamicComponentPreloads: normalizePositiveLimit(options.maxDynamicComponentPreloads, 16),
		dynamicComponentPreloads: 0,
		onEarlyHints: options.onEarlyHints,
		allowUnsafeHtml: options.allowUnsafeHtml ?? false,
		onUnsafeHtml: options.onUnsafeHtml,
		documentProbe: true,
		documentRootSeen: false,
		documentHeadSeen: false,
		documentBodySeen: false,
		hostStack: [],
		enhancementCatalog: options.enhancementCatalog,
		componentContexts: options.contexts,
		componentDomain: createFrameworkComponentDomain({
			target: 'server',
			executionRoot: options.inspection?.executionRoot ?? options.executionRoot ?? 'page',
			...(options.inspection ? { inspection: options.inspection } : {}),
			wallClockSnapshot
		}),
		wallClockSnapshot,
		onComponentCreated: options.onComponentCreated,
		onComponentRendered: options.onComponentRendered,
		onComponentAttemptCheckpoint: options.onComponentAttemptCheckpoint,
		onComponentAttemptRollback: options.onComponentAttemptRollback,
		onDirectComponentCreated: options.onDirectComponentCreated,
		onDirectComponentRendered: options.onDirectComponentRendered
	};
	return context;
}
