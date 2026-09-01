import { componentDomainUsesWallClock } from '@exactjs/core/framework/component-domains';
import type { Child } from '@exactjs/core';
import { createExactProducedResponse, type ExactResponseLike } from '@exactjs/server';
import type { ExactSynchronousResponseEnvironment } from '@exactjs/server';
import type {
	HydratableStringResult,
	HydrationScriptOptions,
	RenderToStringOptions,
	RenderToStringResult
} from './types.js';
import { renderHydrationScript, renderHydrationScriptWithByteCount } from './hydration.js';
import { createSsrResumptionCapture } from './resumption.js';
import { readServerComponentReference } from './render/server-component-reference.js';
import { createSsrContext } from './render/context.js';
import { countSsrNode, withTaskDeadline } from './render/limits.js';
import { SsrOutputBuffer } from './render/output-buffer.js';
import {
	createChunkedHydratableResult,
	createChunkedStringResult
} from './render/output-result.js';
import { attachSsrRootExecutionBlueprint } from './render/root-execution-cache.js';
import {
	hydrationScriptOptions,
	hydrationScriptOptionsFromValues
} from './render/hydration-options.js';
import { rootComponentIdentity, rootPropsOptions } from './render/root-props.js';
import { renderChildren } from './render/sync-children.js';
import { renderChildrenAsync } from './render/async-children.js';
import { SyncSsrOperationTarget } from './render/sync-operation-target.js';
import { AsyncSsrOperationTarget } from './render/async-operation-target.js';

/** Compiler-only synchronous string entrypoint for a proven native component root. */
export function renderCompilerClosedToString(
	operation: Child,
	options: RenderToStringOptions = {}
): RenderToStringResult {
	return createCompilerClosedStringResult(
		renderCompilerClosedOutputSync(operation, options),
		options
	);
}

/** Compiler-only synchronous entrypoint when the authored call disables markers. */
export function renderCompilerClosedUnmarkedToString(
	operation: Child,
	options: RenderToStringOptions = {}
): RenderToStringResult {
	const renderOptions = { ...options, markers: false };
	return createCompilerClosedStringResult(
		renderCompilerClosedOutputSync(operation, renderOptions),
		renderOptions
	);
}

/** Compiler-only synchronous hydratable entrypoint for a proven native component root. */
export function renderCompilerClosedToHydratableString(
	operation: Child,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): HydratableStringResult {
	const prepared = rootPropsOptions(operation, options);
	const capture = createSsrResumptionCapture(
		prepared,
		prepared.publishRootProps ? (prepared.state as Record<string, unknown>) : undefined,
		rootComponentIdentity(operation)
	);
	const output = renderCompilerClosedOutputSync(operation, capture.options, true);
	const result = createCompilerClosedStringResult(output, capture.options);
	const captured = capture.serializedRecords();
	const resumptions = captured.length ? capture.activations : prepared.resumptions;
	const hydrationScript = renderHydrationScript(
		{
			...hydrationScriptOptions(
				prepared,
				result,
				captured.length && prepared.outputExtensions?.length
					? capture.activations()
					: prepared.resumptions
			),
			markerlessRoot: true
		},
		undefined,
		captured
	);
	return createChunkedHydratableResult(result, resumptions, hydrationScript);
}

/** Writes one synchronous compiler-closed hydratable root through an environment-owned adapter. */
export function renderCompilerClosedToHydratableSink(
	operation: Child,
	write: (value: string) => void,
	options: RenderToStringOptions & HydrationScriptOptions = {},
	environment?: ExactSynchronousResponseEnvironment
): number {
	const prepared = rootPropsOptions(operation, options);
	const capture = createSsrResumptionCapture(
		prepared,
		prepared.publishRootProps ? (prepared.state as Record<string, unknown>) : undefined,
		rootComponentIdentity(operation)
	);
	const output = renderCompilerClosedOutputSync(
		operation,
		capture.options,
		true,
		write,
		environment?.encodedByteLength
	);
	if (output.context.reactResourceHints?.length)
		throw new TypeError('Direct compiler-closed publication cannot reorder late resource hints');
	const captured = capture.serializedRecords();
	const hydrationTable = output.context.hydrationTable?.value();
	const wallClockSnapshot =
		output.context.componentDomain && componentDomainUsesWallClock(output.context.componentDomain)
			? output.context.wallClockSnapshot
			: undefined;
	const hydrationScript = renderHydrationScriptWithByteCount(
		{
			...hydrationScriptOptionsFromValues(
				prepared,
				capture.options.state,
				wallClockSnapshot,
				hydrationTable,
				captured.length && prepared.outputExtensions?.length
					? capture.activations()
					: prepared.resumptions
			),
			markerlessRoot: true
		},
		undefined,
		captured,
		output
	);
	write(hydrationScript);
	return output.outputBytes + output.hydrationBytes!;
}

/** Creates an adapter-owned response whose compiler-closed root is produced on body consumption. */
export function renderCompilerClosedToHydratableResponse(
	operation: Child,
	options: RenderToStringOptions &
		HydrationScriptOptions & {
			status?: number;
			headers?: Record<string, string>;
			contentType?: string;
		} = {}
): ExactResponseLike {
	const { status = 200, headers, contentType, ...renderOptions } = options;
	return createExactProducedResponse(
		status,
		{
			'content-type': contentType ?? 'text/html; charset=utf-8',
			...(headers ?? {})
		},
		(write, environment) => {
			renderCompilerClosedToHydratableSink(operation, write, renderOptions, environment);
		}
	);
}

/**
 * Compiler-only async string entrypoint for a statically proven direct component root.
 * Authored code continues to import `renderToStringAsync` from `@exactjs/ssr`; the compiler lowers
 * only closed local roots to this physical runtime surface.
 */
export async function renderCompilerClosedToStringAsync(
	operation: Child,
	options: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
	const output = await renderCompilerClosedOutput(operation, options);
	return createCompilerClosedStringResult(output, options);
}

/** Compiler-only entrypoint for a closed root whose call site disables component markers. */
export async function renderCompilerClosedUnmarkedToStringAsync(
	operation: Child,
	options: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
	const renderOptions = { ...options, markers: false };
	const output = await renderCompilerClosedOutput(operation, renderOptions, true);
	return createCompilerClosedStringResult(output, renderOptions);
}

/**
 * Compiler-only hydratable entrypoint for a statically proven direct component root.
 * The redundant root component delimiter is omitted; independently owned structural markers stay
 * enabled until their generated owner proves a stable markerless claim.
 */
export async function renderCompilerClosedToHydratableStringAsync(
	operation: Child,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): Promise<HydratableStringResult> {
	const prepared = rootPropsOptions(operation, options);
	const capture = createSsrResumptionCapture(
		prepared,
		prepared.publishRootProps ? (prepared.state as Record<string, unknown>) : undefined,
		rootComponentIdentity(operation)
	);
	const renderOptions = capture.options;
	const output = await renderCompilerClosedOutput(operation, renderOptions, true);
	const result = createCompilerClosedStringResult(output, renderOptions);
	const captured = capture.serializedRecords();
	const resumptions = captured.length ? capture.activations : prepared.resumptions;
	const hydrationScript = renderHydrationScript(
		{
			...hydrationScriptOptions(
				prepared,
				result,
				captured.length && prepared.outputExtensions?.length
					? capture.activations()
					: prepared.resumptions
			),
			markerlessRoot: true
		},
		undefined,
		captured
	);
	return createChunkedHydratableResult(result, resumptions, hydrationScript);
}

type CompilerClosedOutput = {
	context: ReturnType<typeof createSsrContext>;
	chunks: readonly string[];
	outputBytes: number;
	hydrationBytes?: number;
};

async function renderCompilerClosedOutput(
	operation: Child,
	options: RenderToStringOptions,
	omitRootComponentBoundary = false
): Promise<CompilerClosedOutput> {
	const component = readServerComponentReference(operation);
	if (!component)
		throw new TypeError('Compiler-closed SSR root requires a compiler-issued component operation');
	const renderOptions = withTaskDeadline(options);
	const context = createSsrContext(renderOptions);
	attachSsrRootExecutionBlueprint(context, operation);
	const output = new SsrOutputBuffer(context.maxOutputBytes);
	if (omitRootComponentBoundary) {
		countSsrNode(context);
		output.append(
			await new AsyncSsrOperationTarget(
				context,
				undefined,
				renderOptions,
				false,
				renderChildrenAsync
			).renderCompilerClosedRootComponent(component)
		);
	} else output.append(await renderChildrenAsync(context, [operation], undefined, renderOptions));
	output.prepend(context.reactResourceHints ?? []);
	return { context, chunks: output.finish(), outputBytes: output.encodedBytes() };
}

function renderCompilerClosedOutputSync(
	operation: Child,
	options: RenderToStringOptions,
	omitRootComponentBoundary = false,
	publish?: (value: string) => void,
	encodedByteLength?: (value: string) => number
): CompilerClosedOutput {
	const component = readServerComponentReference(operation);
	if (!component)
		throw new TypeError('Compiler-closed synchronous SSR root requires a component operation');
	const renderOptions = withTaskDeadline(options);
	const context = createSsrContext(renderOptions);
	const output = new SsrOutputBuffer(context.maxOutputBytes, publish, encodedByteLength);
	context.outputSink = output;
	attachSsrRootExecutionBlueprint(context, operation);
	if (omitRootComponentBoundary) {
		countSsrNode(context);
		output.appendAccounted(
			new SyncSsrOperationTarget(
				context,
				undefined,
				false,
				renderChildren
			).renderCompilerClosedRootComponent(component)
		);
	} else output.appendAccounted(renderChildren(context, [operation], undefined));
	output.prepend(context.reactResourceHints ?? []);
	return { context, chunks: output.finish(), outputBytes: output.encodedBytes() };
}

function createCompilerClosedStringResult(
	output: CompilerClosedOutput,
	options: RenderToStringOptions
): RenderToStringResult {
	const hydrationTable = output.context.hydrationTable?.value();
	return createChunkedStringResult(
		output.chunks,
		options.state,
		hydrationTable,
		output.context.resourceLinkHeaders ?? [],
		output.context.componentDomain && componentDomainUsesWallClock(output.context.componentDomain)
			? output.context.wallClockSnapshot
			: undefined
	);
}
