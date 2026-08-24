import { type VNode } from '@exactjs/core';
import { componentDomainUsesWallClock } from '@exactjs/core/framework/component-domains';
import { processExactOutput } from '@exactjs/plugin-host/runtime';
import type { RenderToStringOptions, RenderToStringResult } from './types.js';
import { renderCompilerClosedVNode } from './render/compiler-closed-tree.js';
import { createSsrContext } from './render/context.js';
import { assertOutputWithinLimit, withTaskDeadline } from './render/limits.js';
import { SsrOutputBuffer } from './render/output-buffer.js';
import { createChunkedStringResult } from './render/output-result.js';
import { attachSsrRootExecutionBlueprint } from './render/root-execution-cache.js';

/**
 * Compiler-only async string entrypoint for a statically proven direct component root.
 * Authored code continues to import `renderToStringAsync` from `@exactjs/ssr`; the compiler lowers
 * only closed local roots to this physical runtime surface.
 */
export async function renderCompilerClosedToStringAsync(
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
	const output = new SsrOutputBuffer(context.maxOutputBytes);
	output.append(await renderCompilerClosedVNode(context, validatedVNode, undefined, renderOptions));
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
