import { type AnyComponentInstance } from '@exactjs/core';
import { executeOpaqueOperation } from '@exactjs/core/runtime/component-operations';
import {
	readPreparedServerChildRange,
	readPreparedServerKeyedChild,
	readPreparedServerRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeText } from '../html.js';
import type { Child, RenderToStringOptions, SsrContext } from '../types.js';
import { AsyncSsrOperationTarget } from './async-operation-target.js';
import { claimRootText } from './host.js';
import { appendBoundedHtml, countSsrNode, withSsrTreeDepthAsync } from './limits.js';
import { captureNestedEnhancementStringPrefix } from './operation-enhancements.js';
import { readServerComponentReference } from './server-component-reference.js';

/** Serializes opaque native operations and scalar children asynchronously. */
export async function renderChildrenAsync(
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor = false
): Promise<string> {
	let html = '';
	let previousWasText = false;
	const target = new AsyncSsrOperationTarget(
		context,
		parent,
		options,
		hasComponentAncestor,
		renderChildrenAsync
	);
	for (const child of children) {
		const result = await renderChildAsync(
			context,
			child,
			parent,
			options,
			hasComponentAncestor,
			target
		);
		html = captureNestedEnhancementStringPrefix(context, html);
		if (context.textSeparators && result.text && previousWasText)
			html = appendBoundedHtml(context, html, '<!-- -->');
		if (result.html !== '') html = appendBoundedHtml(context, html, result.html);
		previousWasText = result.text;
	}
	return html;
}

/** Serializes one opaque native operation or scalar child. */
export async function renderChildAsync(
	context: SsrContext,
	child: Child,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor = false,
	target = new AsyncSsrOperationTarget(
		context,
		parent,
		options,
		hasComponentAncestor,
		renderChildrenAsync
	)
): Promise<{ html: string; text: boolean }> {
	countSsrNode(context);
	return withSsrTreeDepthAsync(context, async () => {
		const executed = executeOpaqueOperation<string | Promise<string>>(child, target);
		if (executed) return { html: await executed.value, text: false };
		const program = readPreparedServerRenderProgram(child);
		if (program) return { html: await target.renderPreparedServerProgram(program), text: false };
		const component = readServerComponentReference(child);
		if (component)
			return { html: await target.renderDirectServerComponent(component), text: false };
		const range = readPreparedServerChildRange(child);
		if (range) return { html: await target.renderDirectServerChildRange(range), text: false };
		const keyed = readPreparedServerKeyedChild(child);
		if (keyed) return { html: await target.renderDirectServerKeyedChild(keyed), text: false };
		const value = unwrap(child);
		if (value === null || value === undefined || value === false || value === true)
			return { html: '', text: false };
		if (typeof value === 'object' || typeof value === 'function')
			throw new TypeError(
				'Native SSR children require compiler-issued operations or scalar values'
			);
		claimRootText(context);
		return { html: escapeText(String(value)), text: true };
	});
}
