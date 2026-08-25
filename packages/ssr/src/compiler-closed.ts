import { type VNode } from '@exactjs/core';
import { componentDomainUsesWallClock } from '@exactjs/core/framework/component-domains';
import type {
	HydratableStringResult,
	HydrationScriptOptions,
	RenderToStringOptions,
	RenderToStringResult
} from './types.js';
import { renderHydrationScript } from './hydration.js';
import { createSsrResumptionCapture } from './resumption.js';
import { componentMarkerId } from './render/component-markers.js';
import {
	renderCompilerClosedVNode,
	type CompilerClosedPublication
} from './render/compiler-closed-tree.js';
import type { DirectSsrComponentPublisher } from './render/direct-component.js';
import { directComponentHtml } from './render/direct-component-output.js';
import { createSsrContext } from './render/context.js';
import { withTaskDeadline } from './render/limits.js';
import { SsrOutputBuffer } from './render/output-buffer.js';
import {
	createChunkedHydratableResult,
	createChunkedStringResult
} from './render/output-result.js';
import { attachSsrRootExecutionBlueprint } from './render/root-execution-cache.js';
import { hydrationScriptOptions } from './render/hydration-options.js';

const publishMarkedComponent: DirectSsrComponentPublisher<CompilerClosedPublication> = (
	context,
	child,
	_parent,
	html,
	props,
	snapshot,
	publication
) =>
	directComponentHtml(
		context,
		componentMarkerId(context, child),
		html,
		props,
		snapshot.contract.definition.server?.publication,
		{
			enhancement: false,
			documentProbe: context.documentProbe,
			...publication
		}
	);

const publishUnmarkedComponent: DirectSsrComponentPublisher<CompilerClosedPublication> = (
	_context,
	_child,
	_parent,
	html
) => html;

/**
 * Compiler-only async string entrypoint for a statically proven direct component root.
 * Authored code continues to import `renderToStringAsync` from `@exactjs/ssr`; the compiler lowers
 * only closed local roots to this physical runtime surface.
 */
export async function renderCompilerClosedToStringAsync(
	vnode: VNode,
	options: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
	const output = await renderCompilerClosedOutput(vnode, options, publishMarkedComponent);
	return createCompilerClosedStringResult(output, options);
}

/** Compiler-only entrypoint for a closed root whose call site disables component markers. */
export async function renderCompilerClosedUnmarkedToStringAsync(
	vnode: VNode,
	options: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
	const renderOptions = { ...options, markers: false };
	const output = await renderCompilerClosedOutput(vnode, renderOptions, publishUnmarkedComponent);
	return createCompilerClosedStringResult(output, renderOptions);
}

/**
 * Compiler-only hydratable entrypoint for a statically proven direct component root.
 * Component and structural markers remain enabled until their owning generated parent proves that
 * each individual boundary can be claimed without serialized delimiters.
 */
export async function renderCompilerClosedToHydratableStringAsync(
	vnode: VNode,
	options: RenderToStringOptions & HydrationScriptOptions = {}
): Promise<HydratableStringResult> {
	const capture = createSsrResumptionCapture(options);
	const renderOptions = capture.options;
	const output = await renderCompilerClosedOutput(vnode, renderOptions, publishMarkedComponent);
	const result = createCompilerClosedStringResult(output, renderOptions);
	const captured = capture.records();
	const resumptions = captured.length ? captured : options.resumptions;
	const hydrationScript = renderHydrationScript(
		hydrationScriptOptions(options, result, resumptions),
		capture.layouts()
	);
	return createChunkedHydratableResult(result, resumptions, hydrationScript);
}

type CompilerClosedOutput = {
	context: ReturnType<typeof createSsrContext>;
	chunks: readonly string[];
};

async function renderCompilerClosedOutput(
	vnode: VNode,
	options: RenderToStringOptions,
	publish: DirectSsrComponentPublisher<CompilerClosedPublication>
): Promise<CompilerClosedOutput> {
	const renderOptions = withTaskDeadline(options);
	const context = createSsrContext(renderOptions);
	attachSsrRootExecutionBlueprint(context, vnode);
	const output = new SsrOutputBuffer(context.maxOutputBytes);
	output.append(await renderCompilerClosedVNode(context, vnode, undefined, renderOptions, publish));
	output.prepend(context.reactResourceHints ?? []);
	return { context, chunks: output.finish() };
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
