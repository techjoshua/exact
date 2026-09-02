import { type AnyComponentInstance } from '@exactjs/core';
import { executeOpaqueOperation } from '@exactjs/core/runtime/component-operations';
import {
	readPreparedServerComponentReference,
	readPreparedServerChildRange,
	readPreparedServerKeyedChild,
	readPreparedServerRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child, SsrContext } from '../types.js';
import { claimRootText } from './host.js';
import { appendBoundedHtml, countSsrNode, enterSsrTreeDepth, leaveSsrTreeDepth } from './limits.js';
import { SyncSsrOperationTarget } from './sync-operation-target.js';
import { captureNestedEnhancementStringPrefix } from './operation-enhancements.js';
import { escapeSsrText } from './output-text.js';

/** Serializes opaque native operations and scalar children without component classification. */
export function renderChildren(
	context: SsrContext,
	children: readonly Child[],
	parent?: AnyComponentInstance,
	hasComponentAncestor = false
): string {
	let html = '';
	let previousWasText = false;
	const target = new SyncSsrOperationTarget(context, parent, hasComponentAncestor, renderChildren);
	for (let childIndex = 0; childIndex < children.length; childIndex++) {
		const child = children[childIndex]!;
		countSsrNode(context);
		let rendered: string;
		let isText = false;
		const program = readPreparedServerRenderProgram(child);
		const component = program ? undefined : readPreparedServerComponentReference(child);
		const range = program || component ? undefined : readPreparedServerChildRange(child);
		const keyed = program || component || range ? undefined : readPreparedServerKeyedChild(child);
		if (program) rendered = target.renderPreparedServerProgram(program);
		else if (component) rendered = target.renderDirectServerComponent(component);
		else if (range) rendered = target.renderDirectServerChildRange(range);
		else if (keyed) rendered = target.renderDirectServerKeyedChild(keyed);
		else {
			enterSsrTreeDepth(context);
			let executed: ReturnType<typeof executeOpaqueOperation<string>>;
			try {
				executed = executeOpaqueOperation<string>(child, target);
			} finally {
				leaveSsrTreeDepth(context);
			}
			if (executed) rendered = executed.value;
			else {
				const value = unwrap(child);
				if (value === null || value === undefined || value === false || value === true)
					rendered = '';
				else {
					if (typeof value === 'object' || typeof value === 'function')
						throw new TypeError(
							'Native SSR children require compiler-issued operations or scalar values'
						);
					claimRootText(context);
					rendered = escapeSsrText(context, String(value));
					isText = rendered !== '';
				}
			}
		}
		if (context.outputSink?.publishesDirectly()) {
			if (context.textSeparators && isText && previousWasText) {
				context.outputSink.accountKnown('<!-- -->', 8);
				context.outputSink.publishAccounted('<!-- -->');
			}
			context.outputSink.publishAccounted(rendered);
			previousWasText = isText;
			continue;
		}
		html = captureNestedEnhancementStringPrefix(context, html);
		if (context.textSeparators && isText && previousWasText)
			context.outputSink?.accountKnown('<!-- -->', 8);
		if (context.textSeparators && isText && previousWasText)
			html = appendBoundedHtml(context, html, '<!-- -->');
		if (rendered !== '') html = appendBoundedHtml(context, html, rendered);
		previousWasText = isText;
	}
	return html;
}
