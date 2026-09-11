import { withTaskObserver, type Child } from '@exactjs/core';
import { publishExactProfile } from '@exactjs/instrumentation';
import { isExactDocumentHtml } from '../document.js';
import { renderHydrationScript } from '../hydration.js';
import { withTaskDeadline } from '../render/limits.js';
import { createSsrResumptionCapture } from '../resumption.js';
import type {
	ExactDocumentStreamEvent,
	HydratableStringResult,
	HydrationScriptOptions,
	RenderToDocumentStreamOptions,
	RenderToStringOptions,
	RenderToStringResult
} from '../types.js';
import { drainTasks } from './context.js';
import type { DirectScheduledSsrComponent } from './direct-component-contracts.js';
import { shouldEmitDocumentHydration } from './document-hydration.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { withRenderCleanup, type RenderValue } from './execution.js';
import { hydrationScriptOptions } from './hydration-options.js';
import { createChunkedHydratableResult } from './output-result.js';
import { createSsrOwner, disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { rootComponentIdentity, rootPropsForCapture, rootPropsOptions } from './root-props.js';
import { planSuspenseStreamReplacements } from './suspense-streaming.js';
import { renderTreeOutput } from './tree-output.js';

/** Renders a tree to a promised string result, waiting for required component work. */
export function renderToString(
	operation: Child,
	options: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
	return renderStringOutput(operation, options);
}
/** Returns asynchronous public completion while available internal work runs directly. */
export async function renderStringOutput(
	operation: Child,
	options: RenderToStringOptions = {},
	omitRootBoundary = false,
	outputKind: 'html' | 'stream' = 'html'
): Promise<RenderToStringResult> {
	if (options.scheduleRender) {
		options.signal?.throwIfAborted();
		const scheduled = options.scheduleRender(options.signal);
		if (scheduled) await scheduled;
		options.signal?.throwIfAborted();
	}
	return renderOwnedOutput(operation, options, omitRootBoundary, outputKind);
}

/** Retains one render owner across actual suspension and releases it before public completion. */
function renderOwnedOutput(
	operation: Child,
	options: RenderToStringOptions,
	omitRootBoundary: boolean,
	outputKind: 'html' | 'stream' = 'html'
): RenderValue<RenderToStringResult> {
	const started = options.onProfile ? performance.now() : undefined;
	const owner = createSsrOwner();
	return withRenderCleanup(
		() =>
			withTaskObserver(owner.observer, () =>
				renderTreeOutput(operation, options, omitRootBoundary, outputKind)
			),
		() => {
			try {
				owner.dispose('ssr render complete');
			} finally {
				if (started !== undefined)
					publishExactProfile(
						options.onProfile,
						Object.freeze({
							subsystem: 'ssr',
							phase: 'render-to-string',
							elapsedMs: performance.now() - started
						})
					);
			}
		}
	);
}

/** Transforms to hydratable string async into its required representation. */
export function renderToHydratableString(
	operation: Child,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): Promise<HydratableStringResult> {
	return renderHydratableOutput(operation, options);
}

/** Captures component state once through the shared renderer and creates its hydration publication. */
export async function renderHydratableOutput(
	operation: Child,
	options: RenderToStringOptions & HydrationScriptOptions = {},
	omitRootBoundary = false
): Promise<HydratableStringResult> {
	if (options.scheduleRender) {
		options.signal?.throwIfAborted();
		const scheduled = options.scheduleRender(options.signal);
		if (scheduled) await scheduled;
		options.signal?.throwIfAborted();
	}
	const prepared = rootPropsOptions(operation, options);
	const capture = createSsrResumptionCapture(
		prepared,
		rootPropsForCapture(operation, prepared),
		rootComponentIdentity(operation)
	);
	const rendered = renderOwnedOutput(operation, capture.options, omitRootBoundary);
	const result = rendered instanceof Promise ? await rendered : rendered;
	const resumptions = capture.serializedRecords();
	const emittedResumptions = resumptions.length
		? () => capture.activations()
		: prepared.resumptions;
	const publicationOptions = hydrationScriptOptions(
		prepared,
		result,
		resumptions.length && prepared.outputExtensions?.length
			? capture.activations()
			: prepared.resumptions
	);
	if (omitRootBoundary || options.documentShell) publicationOptions.markerlessRoot = true;
	const hydrationScript = renderHydrationScript(publicationOptions, undefined, resumptions);
	return createChunkedHydratableResult(result, emittedResumptions, hydrationScript);
}

/**
 * Produces shell, settlement, and hydration events with request-owned task cleanup.
 * HTML consumers set settleDocumentShell because a published full document cannot
 * use the fragment replacement protocol. Event-stream consumers retain replacements.
 */
export async function streamDocumentRender(
	operation: Child,
	options: RenderToDocumentStreamOptions & { taskDeadline?: number },
	emit: (event: ExactDocumentStreamEvent) => void | Promise<void>,
	settleDocumentShell = false,
	abort: (reason: unknown) => void = () => {}
): Promise<void> {
	if (options.scheduleRender) {
		options.signal?.throwIfAborted();
		const scheduled = options.scheduleRender(options.signal);
		if (scheduled) await scheduled;
		options.signal?.throwIfAborted();
	}
	options = withTaskDeadline(rootPropsOptions(operation, options));
	if (options.documentShell) options = { ...options, markerlessRoot: true };
	const owner = createSsrOwner();
	const scheduledShellComponents: DirectScheduledSsrComponent[] = [];
	const disposedShellComponents = new Set<DirectScheduledSsrComponent>();
	let primary: unknown = noPrimaryFailure;
	try {
		await emit({ event: 'start', version: 1 });
		let capture = createSsrResumptionCapture(
			options,
			rootPropsForCapture(operation, options),
			rootComponentIdentity(operation)
		);
		const shellOptions: SsrRenderOptions = {
			...capture.options,
			streamingScheduledComponents: scheduledShellComponents,
			settleDocumentShell
		};
		const shell = await withTaskObserver(owner.observer, () =>
			renderTreeOutput(
				operation,
				shellOptions,
				false,
				'html',
				settleDocumentShell
					? {
							head: (html) => emit({ event: 'head', version: 1, html }),
							body: (html) => emit({ event: 'body', version: 1, html }),
							abort
						}
					: undefined,
				options.streamBufferSize
			)
		);
		// HTML already sent cannot be replaced as an entire document. Event consumers
		// retain their replacement protocol; HTML consumers publish the settled shell.
		const deferShell =
			settleDocumentShell &&
			isExactDocumentHtml(shell.html) &&
			(owner.pending.size > 0 || scheduledShellComponents.length > 0);
		if (!deferShell)
			await emit({
				event: 'shell',
				version: 1,
				html: shell.html,
				streamed: shell.streamedDocument
			});

		let final = shell;
		if (owner.pending.size || scheduledShellComponents.length) {
			if (shell.streamedDocument)
				throw new Error('A committed document cannot be rerendered after body publication');
			// Initial streaming sends an early shell, drains observed tasks, then emits a
			// root replacement only if the settled tree differs from the shell.
			await drainTasks(
				owner.pending,
				options.maxTaskPasses ?? 10,
				options.signal,
				options.taskDeadline
			);
			for (const component of scheduledShellComponents) {
				const pending = component.drain();
				if (pending instanceof Promise) await pending;
			}
			for (const component of scheduledShellComponents) {
				await component[Symbol.asyncDispose]();
				disposedShellComponents.add(component);
			}
			capture = createSsrResumptionCapture(
				options,
				rootPropsForCapture(operation, options),
				rootComponentIdentity(operation)
			);
			final = await withTaskObserver(owner.observer, () =>
				renderTreeOutput(operation, capture.options, false)
			);
			if (!deferShell && final.html !== shell.html) {
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

		if (deferShell) await emit({ event: 'shell', version: 1, html: final.html });

		if (shouldEmitDocumentHydration(options)) {
			const resumptions = capture.serializedRecords();
			await emit({
				event: 'hydration',
				version: 1,
				html: renderHydrationScript(
					hydrationScriptOptions(
						options,
						final,
						resumptions.length > 0 && options.outputExtensions?.length
							? capture.activations()
							: options.resumptions
					),
					undefined,
					resumptions
				)
			});
		}

		await emit({ event: 'complete', version: 1 });
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		for (const component of scheduledShellComponents) {
			if (disposedShellComponents.has(component)) continue;
			try {
				await component[Symbol.asyncDispose]();
			} catch (cleanup) {
				if (primary === noPrimaryFailure) throw cleanup;
			}
		}
		disposePreservingPrimary(
			() => owner.dispose(options.signal?.reason ?? 'ssr stream complete'),
			primary
		);
	}
}
