import { withTaskObserver, type VNode } from '@exact/core';
import { processExactOutput } from '@exact/plugin-host/runtime';
import { augmentDocumentBody } from '../document.js';
import { renderHydrationScript } from '../hydration.js';
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
