import { withTaskObserver, type Child } from '@exactjs/core';
import { componentDomainUsesWallClock } from '@exactjs/core/framework/component-domains';
import { processExactOutput } from '@exactjs/plugin-host/runtime';
import { renderHydrationScript } from '../hydration.js';
import { createSsrResumptionCapture } from '../resumption.js';
import { assertOutputWithinLimit, withTaskDeadline } from '../render/limits.js';
import type {
	ExactDocumentStreamEvent,
	HydratableStringResult,
	HydrationScriptOptions,
	RenderToDocumentStreamOptions,
	RenderToStringOptions,
	RenderToStringResult
} from '../types.js';
import { renderChildrenAsync } from './async-children.js';
import { shouldEmitDocumentHydration } from './document-hydration.js';
import { createSsrContext, drainTasks } from './context.js';
import { hydrationScriptOptions } from './hydration-options.js';
import { rootComponentIdentity, rootPropsOptions } from './root-props.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { createSsrOwner, disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { planSuspenseStreamReplacements } from './suspense-streaming.js';
import { attachSsrRootExecutionBlueprint } from './root-execution-cache.js';
import { SsrOutputBuffer } from './output-buffer.js';
import { createChunkedHydratableResult, createChunkedStringResult } from './output-result.js';
import type { DirectScheduledSsrComponent } from './direct-component-contracts.js';

/** Transforms to string async into its required representation. */
export async function renderToStringAsync(
	operation: Child,
	options: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
	const renderOptions = withTaskDeadline(options);
	const validatedOperation = (await processExactOutput(
		operation,
		{ kind: 'operation', signal: options.signal },
		options.outputExtensions ?? []
	)) as Child;
	const context = createSsrContext(renderOptions);
	attachSsrRootExecutionBlueprint(context, validatedOperation);
	const output = new SsrOutputBuffer(context.maxOutputBytes);
	output.append(await renderChildrenAsync(context, [validatedOperation], undefined, renderOptions));
	output.prepend(context.reactResourceHints ?? []);
	let chunks = output.finish();
	if (options.outputExtensions?.length) {
		const html = (await processExactOutput(
			chunks.length === 1 ? chunks[0]! : chunks.join(''),
			{ kind: 'html', signal: options.signal },
			options.outputExtensions
		)) as string;
		assertOutputWithinLimit(context, html);
		chunks = [html];
	}
	const hydrationTable = context.hydrationTable?.value();
	return createChunkedStringResult(
		chunks,
		options.state,
		hydrationTable,
		context.resourceLinkHeaders ?? [],
		context.componentDomain && componentDomainUsesWallClock(context.componentDomain)
			? context.wallClockSnapshot
			: undefined
	);
}

/** Transforms to hydratable string async into its required representation. */
export async function renderToHydratableStringAsync(
	operation: Child,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): Promise<HydratableStringResult> {
	const prepared = rootPropsOptions(operation, options);
	const capture = createSsrResumptionCapture(
		prepared,
		prepared.publishRootProps ? (prepared.state as Record<string, unknown>) : undefined,
		rootComponentIdentity(operation)
	);
	const result = await renderToStringAsync(operation, capture.options);
	const resumptions = capture.records();
	const emittedResumptions = resumptions.length ? resumptions : prepared.resumptions;
	const hydrationScript = renderHydrationScript(
		hydrationScriptOptions(prepared, result, emittedResumptions),
		capture.layouts()
	);
	return createChunkedHydratableResult(result, emittedResumptions, hydrationScript);
}

/** Performs the stream document render domain operation. */
export async function streamDocumentRender(
	operation: Child,
	options: RenderToDocumentStreamOptions & { taskDeadline?: number },
	emit: (event: ExactDocumentStreamEvent) => Promise<void>
): Promise<void> {
	options = withTaskDeadline(options);
	const owner = createSsrOwner();
	const scheduledShellComponents: DirectScheduledSsrComponent[] = [];
	const disposedShellComponents = new Set<DirectScheduledSsrComponent>();
	let primary: unknown = noPrimaryFailure;
	try {
		await emit({ event: 'start', version: 1 });
		let capture = createSsrResumptionCapture(options);
		const shellOptions: SsrRenderOptions = {
			...capture.options,
			streamingScheduledComponents: scheduledShellComponents
		};
		const shell = await withTaskObserver(owner.observer, () =>
			renderToStringAsync(operation, shellOptions)
		);
		await emit({ event: 'shell', version: 1, html: shell.html });

		let final = shell;
		if (owner.pending.size || scheduledShellComponents.length) {
			// Initial streaming sends an early shell, drains observed tasks, then emits a
			// root replacement only if the settled tree differs from the shell.
			await drainTasks(
				owner.pending,
				options.maxTaskPasses ?? 10,
				options.signal,
				options.taskDeadline
			);
			for (const component of scheduledShellComponents) await component.drain();
			for (const component of scheduledShellComponents) {
				await component[Symbol.asyncDispose]();
				disposedShellComponents.add(component);
			}
			capture = createSsrResumptionCapture(options);
			final = await renderToStringAsync(operation, capture.options);
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
				html: renderHydrationScript(
					hydrationScriptOptions(
						options,
						final,
						resumptions.length > 0 ? resumptions : options.resumptions
					),
					capture.layouts()
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
