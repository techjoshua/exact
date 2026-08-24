import type {
	AnyComponentInstance,
	Child,
	DirectSsrComponentSnapshot,
	RenderToStringOptions,
	SsrContext
} from '../types.js';
import { boundedJoin, SsrTreeNodeError } from './limits.js';

/** Renders one child inside a supplied isolated SSR frame. */
export type IndependentChildRenderer = (
	context: SsrContext,
	child: Child,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
) => Promise<string>;

type IndependentSsrResult = {
	readonly html: string;
	readonly frame: SsrContext;
	readonly created: readonly AnyComponentInstance[];
	readonly rendered: readonly AnyComponentInstance[];
	readonly directCreated: readonly DirectSsrComponentSnapshot[];
	readonly directRendered: readonly DirectSsrComponentSnapshot[];
};

/** Returns whether request state permits the compiler-proven concurrent path. */
export function canRenderIndependentChildren(
	context: SsrContext,
	options: RenderToStringOptions
): boolean {
	return !(
		context.asyncScheduler.limit === 1 ||
		context.markers ||
		context.reactMarkup ||
		context.documentRootSeen ||
		options.inspection ||
		(!options.allowIndependentComponentObservation &&
			(options.onComponentCreated ||
				options.onComponentRendered ||
				options.onDirectComponentCreated ||
				options.onDirectComponentRendered)) ||
		options.onUnsafeHtml ||
		options.onProfile
	);
}

/**
 * Schedules a compiler-proven sibling group, waits for cancellation cleanup,
 * and publishes HTML and observations in authored order.
 */
export async function renderIndependentChildren(
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChild: IndependentChildRenderer
): Promise<string> {
	const render = () => renderIndependentGroup(context, children, parent, options, renderChild);
	return context.asyncFrame ? context.asyncScheduler.suspend(render) : render();
}

async function renderIndependentGroup(
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChild: IndependentChildRenderer
): Promise<string> {
	const controller = new AbortController();
	const abort = () => controller.abort(options.signal?.reason);
	options.signal?.addEventListener('abort', abort, { once: true });
	if (options.signal?.aborted) abort();
	try {
		const cancellation = { kind: 'exact-ssr-sibling-cancellation' } as const;
		const failures = new Map<number, unknown>();
		const settled = await Promise.allSettled(
			children.map((child, index) =>
				context.asyncScheduler.run<IndependentSsrResult>(async () => {
					const created: AnyComponentInstance[] = [];
					const rendered: AnyComponentInstance[] = [];
					const directCreated: DirectSsrComponentSnapshot[] = [];
					const directRendered: DirectSsrComponentSnapshot[] = [];
					const frame = isolatedSsrFrame(context, created, rendered, directCreated, directRendered);
					try {
						const html = await renderChild(frame, child, parent, {
							...options,
							signal: controller.signal
						});
						return { html, frame, created, rendered, directCreated, directRendered };
					} catch (error) {
						if (error !== cancellation) failures.set(index, error);
						if (!controller.signal.aborted) controller.abort(cancellation);
						throw error;
					}
				}, controller.signal)
			)
		);
		for (let index = 0; index < children.length; index++)
			if (failures.has(index)) throw failures.get(index);
		const results: IndependentSsrResult[] = [];
		for (const result of settled) {
			if (result.status === 'rejected') throw result.reason;
			results.push(result.value);
		}
		return mergeIndependentResults(context, results);
	} finally {
		options.signal?.removeEventListener('abort', abort);
	}
}

function isolatedSsrFrame(
	context: SsrContext,
	created: AnyComponentInstance[],
	rendered: AnyComponentInstance[],
	directCreated: DirectSsrComponentSnapshot[],
	directRendered: DirectSsrComponentSnapshot[]
): SsrContext {
	return {
		...context,
		nextId: context.nextId,
		traversalDepth: context.traversalDepth,
		traversedNodes: 0,
		reactResourceHints: [],
		reactResourceKeys: new Set(),
		dynamicComponentPreloads: 0,
		resourceLinkHeaders: [],
		hostStack: [...context.hostStack],
		unavailableEnhancements: new Set(),
		enhancementVNodes: new WeakSet(),
		plannedEnhancementBoundaries: new WeakSet(),
		plannedTargetBoundaries: new WeakSet(),
		appliedTargetBoundaries: new WeakSet(),
		targetContributions: new WeakMap(),
		enhancementTargets: new WeakMap(),
		preparedEnhancementComponents: new WeakMap(),
		preparedEnhancementChildren: new WeakMap(),
		preparedEnhancementSuspense: new WeakMap(),
		preparedDirectScheduledComponents: context.preparedDirectScheduledComponents,
		generatedSsrTarget: undefined,
		onComponentCreated: (instance) => created.push(instance),
		onComponentRendered: (instance) => rendered.push(instance),
		onDirectComponentCreated: (snapshot) => directCreated.push(snapshot),
		onDirectComponentRendered: (snapshot) => directRendered.push(snapshot),
		asyncFrame: true
	};
}

function mergeIndependentResults(
	context: SsrContext,
	results: readonly IndependentSsrResult[]
): string {
	const html: string[] = [];
	for (const result of results) {
		context.traversedNodes += result.frame.traversedNodes;
		if (context.traversedNodes > context.maxTreeNodes)
			throw new SsrTreeNodeError(context.maxTreeNodes);
		const hints = (context.reactResourceHints ??= []);
		for (const hint of result.frame.reactResourceHints ?? [])
			if (!hints.includes(hint)) hints.push(hint);
		const links = (context.resourceLinkHeaders ??= []);
		for (const link of result.frame.resourceLinkHeaders ?? [])
			if (!links.includes(link)) links.push(link);
		context.dynamicComponentPreloads = links.length;
		for (const identity of result.frame.unavailableEnhancements ?? [])
			(context.unavailableEnhancements ??= new Set()).add(identity);
		for (const instance of result.created) context.onComponentCreated?.(instance);
		for (const instance of result.rendered) context.onComponentRendered?.(instance);
		for (const snapshot of result.directCreated) context.onDirectComponentCreated?.(snapshot);
		for (const snapshot of result.directRendered) context.onDirectComponentRendered?.(snapshot);
		if (result.html) html.push(result.html);
	}
	return boundedJoin(context, html);
}
