import type { Child } from '@exactjs/core';
import { componentDomainUsesWallClock } from '@exactjs/core/framework/component-domains';
import { processExactOutput } from '@exactjs/plugin-host/runtime';
import type { RenderToStringOptions, RenderToStringResult, SsrContext } from '../types.js';
import { renderChildren } from './children.js';
import { createSsrContext } from './context.js';
import { mapRenderValue, withRenderCleanup, type RenderValue } from './execution.js';
import { assertOutputWithinLimit, countSsrNode, withTaskDeadline } from './limits.js';
import { SsrOperationTarget } from './operation-target.js';
import { DocumentStringSink } from './document-string-sink.js';
import { DocumentShellScope } from './document-shell.js';
import { DocumentStreamSink, type DocumentStreamDestination } from './document-stream-sink.js';
import { FragmentDocumentStreamSink } from './fragment-document-stream-sink.js';
import { renderDocumentRootOutput } from './document-root-output.js';
import { createChunkedStringResult } from './output-result.js';
import { attachSsrRootExecutionBlueprint } from './root-execution-cache.js';
import { readServerComponentReference } from './server-component-reference.js';

// Bun benefits from grouped UTF-8 counting; Node retains its faster per-span sink.
const HostDocumentStreamSink =
	typeof (globalThis as { Bun?: unknown }).Bun === 'object'
		? FragmentDocumentStreamSink
		: DocumentStreamSink;

/** Renders one tree under its caller's owner, returning completed output without a promise hop. */
export function renderTreeOutput(
	operation: Child,
	options: RenderToStringOptions,
	omitRootBoundary: boolean,
	outputKind: 'html' | 'stream' = 'html',
	destination?: DocumentStreamDestination,
	streamBufferSize?: number
): RenderValue<RenderToStringResult> {
	if (options.outputExtensions?.length)
		return processExactOutput(
			operation,
			{ kind: 'operation', signal: options.signal },
			options.outputExtensions
		).then((value) => renderSelectedTree(value as Child, options, omitRootBoundary, outputKind));
	return renderSelectedTree(
		operation,
		options,
		omitRootBoundary,
		outputKind,
		destination,
		streamBufferSize
	);
}

function renderSelectedTree(
	operation: Child,
	options: RenderToStringOptions,
	omitRootBoundary: boolean,
	outputKind: 'html' | 'stream',
	destination?: DocumentStreamDestination,
	streamBufferSize?: number
): RenderValue<RenderToStringResult> {
	let renderOptions = withTaskDeadline(options);
	if (options.documentShell) {
		const scope = new DocumentShellScope(operation, { ...renderOptions, documentShell: undefined });
		operation = options.documentShell(operation);
		renderOptions = {
			...renderOptions,
			documentShell: undefined,
			documentShellScope: scope,
			resumptionCapture: scope.capture
		};
		omitRootBoundary = false;
	}
	const context = createSsrContext(renderOptions);
	const sink = destination
		? new HostDocumentStreamSink(context.maxOutputBytes, destination, streamBufferSize)
		: new DocumentStringSink(context.maxOutputBytes);
	context.writerSink = sink;
	return withRenderCleanup(
		() =>
			renderCollectedTree(
				context,
				sink,
				operation,
				options,
				renderOptions,
				omitRootBoundary,
				outputKind
			),
		() => sink.destroy()
	);
}

/** The request owns its destination across descendant rendering and output extensions. */
function renderCollectedTree(
	context: SsrContext,
	sink: DocumentStringSink | DocumentStreamSink,
	operation: Child,
	options: RenderToStringOptions,
	renderOptions: RenderToStringOptions,
	omitRootBoundary: boolean,
	outputKind: 'html' | 'stream'
): RenderValue<RenderToStringResult> {
	attachSsrRootExecutionBlueprint(context, operation);
	let rendered: RenderValue<string>;
	if (sink instanceof DocumentStreamSink || renderOptions.documentShellScope) {
		rendered = renderDocumentRootOutput(context, operation, renderOptions);
	} else if (omitRootBoundary) {
		const component = readServerComponentReference(operation);
		if (!component) throw new TypeError('Compiler root proof requires a component operation');
		countSsrNode(context);
		rendered = new SsrOperationTarget(
			context,
			undefined,
			renderOptions,
			false,
			renderChildren
		).renderCompilerClosedRootComponent(component);
	} else rendered = renderChildren(context, [operation], undefined, renderOptions);
	return mapRenderValue(rendered, (html) => {
		renderOptions.documentShellScope?.complete(context.documentRootSeen);
		if (html) sink.write(html);
		const completed =
			sink instanceof DocumentStringSink
				? { chunks: sink.finishChunks(context.reactResourceHints), streamed: false }
				: mapRenderValue(sink.finish(context.reactResourceHints), ({ html, streamed }) => ({
						chunks: [html],
						streamed
					}));
		const finish = (chunks: readonly string[], streamed = false) => {
			const result = createChunkedStringResult(
				chunks,
				options.state,
				context.hydrationTable?.value(),
				context.resourceLinkHeaders ?? [],
				context.componentDomain && componentDomainUsesWallClock(context.componentDomain)
					? context.wallClockSnapshot
					: undefined,
				options.outputExtensions?.length
					? undefined
					: (context.documentOutputs?.has('hydrationData') ?? false)
			);
			if (streamed) result.streamedDocument = true;
			return result;
		};
		return mapRenderValue(completed, ({ chunks, streamed }) => {
			if (!options.outputExtensions?.length) return finish(chunks, streamed);
			return processExactOutput(
				chunks.length === 1 ? chunks[0]! : chunks.join(''),
				{ kind: outputKind, signal: options.signal },
				options.outputExtensions
			).then((value) => {
				const html = value as string;
				assertOutputWithinLimit(context, html);
				return finish([html]);
			});
		});
	});
}
