import { withTaskObserver, type VNode } from '@exactjs/core';
import { processExactOutput } from '@exactjs/plugin-host/runtime';
import { augmentDocumentBody } from '../document.js';
import { renderHydrationScript } from '../hydration.js';
import { createSsrResumptionCapture } from '../resumption.js';
import { assertOutputWithinLimit, boundedJoin, withTaskDeadline } from '../render/limits.js';
import type {
	ExactDocumentStreamEvent,
	HydratableStringResult,
	HydrationScriptOptions,
	RenderToDocumentStreamOptions,
	RenderToStringOptions,
	RenderToStringResult
} from '../types.js';
import { renderVNodeAsync } from './async-tree.js';
import { shouldEmitDocumentHydration } from './boundaries.js';
import { createSsrContext, drainTasks } from './context.js';
import { renderToStringOwned } from './entrypoints.js';
import { createSsrOwner, disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { planSuspenseStreamReplacements } from './suspense-streaming.js';
import { attachSsrRootExecutionBlueprint } from './root-execution-cache.js';

/** Transforms to string async into its required representation. */
export async function renderToStringAsync(
	vnode: VNode,
	options: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
	const renderOptions = withTaskDeadline(options);
	const validatedVNode = (await processExactOutput(
		vnode,
		{ kind: 'vnode', signal: options.signal },
		options.outputExtensions ?? []
	)) as VNode;
	const context = createSsrContext(renderOptions);
	attachSsrRootExecutionBlueprint(context, validatedVNode);
	const body = await renderVNodeAsync(context, validatedVNode, undefined, renderOptions);
	const html = (await processExactOutput(
		boundedJoin(context, [...context.reactResourceHints, body]),
		{ kind: 'html', signal: options.signal },
		options.outputExtensions ?? []
	)) as string;
	assertOutputWithinLimit(context, html);
	const hydrationTable = context.hydrationTable.value();
	return {
		html,
		state: options.state,
		...(hydrationTable ? { hydrationTable } : {})
	};
}

/** Transforms to hydratable string async into its required representation. */
export async function renderToHydratableStringAsync(
	vnode: VNode,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): Promise<HydratableStringResult> {
	const capture = createSsrResumptionCapture(options);
	const result = await renderToStringAsync(vnode, capture.options);
	const resumptions = capture.records();
	const emittedResumptions = resumptions.length ? resumptions : options.resumptions;
	const hydrationScript = renderHydrationScript({
		pluginRegistryFingerprint: options.pluginRegistryFingerprint,
		endpoint: options.endpoint,
		endpoints: options.endpoints,
		state: result.state,
		continuations: options.continuations,
		resumptions: emittedResumptions,
		publicContexts: options.publicContexts,
		hydrationTable: result.hydrationTable,
		executionRoot: options.executionRoot,
		binding: options.binding,
		buildKey: options.buildKey,
		scriptId: options.scriptId,
		nonce: options.nonce,
		maxHydrationDepth: options.maxHydrationDepth,
		maxHydrationNodes: options.maxHydrationNodes,
		maxHydrationBytes: options.maxHydrationBytes,
		outputExtensions: options.outputExtensions
	});
	return {
		...result,
		resumptions: emittedResumptions,
		hydrationScript,
		htmlWithHydration: augmentDocumentBody(result.html, hydrationScript)
	};
}

/** Performs the stream document render domain operation. */
export async function streamDocumentRender(
	vnode: VNode,
	options: RenderToDocumentStreamOptions & { taskDeadline?: number },
	emit: (event: ExactDocumentStreamEvent) => Promise<void>
): Promise<void> {
	options = withTaskDeadline(options);
	const owner = createSsrOwner();
	let primary: unknown = noPrimaryFailure;
	try {
		await emit({ event: 'start', version: 1 });
		let capture = createSsrResumptionCapture(options);
		const shell = withTaskObserver(owner.observer, () =>
			renderToStringOwned(vnode, capture.options)
		);
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
			capture = createSsrResumptionCapture(options);
			final = await renderToStringAsync(vnode, capture.options);
			if (final.html !== shell.html) {
				const replacements = planSuspenseStreamReplacements(shell.html, final.html);
				if (replacements) {
					for (const replacement of replacements)
						await emit({ event: 'replace', version: 1, ...replacement });
				} else {
					await emit({
						event: 'replace',
						version: 1,
						id: options.rootId ?? 'document',
						html: final.html
					});
				}
			}
		}

		if (shouldEmitDocumentHydration(options)) {
			const resumptions = capture.records();
			await emit({
				event: 'hydration',
				version: 1,
				html: renderHydrationScript({
					pluginRegistryFingerprint: options.pluginRegistryFingerprint,
					endpoint: options.endpoint,
					endpoints: options.endpoints,
					state: final.state,
					continuations: options.continuations,
					resumptions: resumptions.length > 0 ? resumptions : options.resumptions,
					publicContexts: options.publicContexts,
					hydrationTable: final.hydrationTable,
					executionRoot: options.executionRoot,
					binding: options.binding,
					buildKey: options.buildKey,
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
