import { type AnyComponentInstance } from '@exactjs/core';
import {
	readPreparedServerChildRange,
	readPreparedServerKeyedChild,
	readPreparedServerRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import { executeOpaqueOperation } from '@exactjs/core/runtime/component-operations';
import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeText } from '../html.js';
import type { Child, RenderToStringOptions, SsrContext } from '../types.js';
import { mapRenderValue, type RenderValue } from './execution.js';
import { claimRootText } from './host.js';
import { appendBoundedHtml, countSsrNode, enterSsrTreeDepth, leaveSsrTreeDepth } from './limits.js';
import { captureNestedEnhancementStringPrefix } from './operation-enhancement-routes.js';
import { SsrOperationTarget } from './operation-target.js';
import { readServerComponentReference } from './server-component-reference.js';
import { readServerList } from './server-list.js';
import { awaitSsrProgramSink, type SsrProgramSink } from './program-sink.js';

type ChildRenderResult = Readonly<{ html: string; text: boolean }>;

/** Empty structural output carries no request state and cannot be mutated across traversals. */
const emptyChildResult: ChildRenderResult = Object.freeze({ html: '', text: false });

/** Serializes native operations and scalar children, suspending only for pending output. */
export function renderChildren(
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor = false
): RenderValue<string> {
	return new ChildrenOutput(
		context,
		children,
		new SsrOperationTarget(context, parent, options, hasComponentAncestor, renderChildren)
	).render();
}

/** Ordered child traversal retains continuation state only once per sibling group. */
class ChildrenOutput {
	private readonly sink: SsrProgramSink | undefined;
	private html = '';
	private previousWasText = false;
	private index = 0;
	constructor(
		private readonly context: SsrContext,
		private readonly children: readonly Child[],
		private readonly target: SsrOperationTarget
	) {
		this.sink = context.writerSink;
	}
	render(): RenderValue<string> {
		while (this.index < this.children.length) {
			const value = renderChildWithTarget(this.context, this.children[this.index++], this.target);
			if (value instanceof Promise)
				return awaitSsrProgramSink(this.sink, value).then((result) => {
					this.append(result);
					return mapRenderValue(this.sink?.ready(), () => this.render());
				});
			this.append(value);
			const pending = this.sink?.ready();
			if (pending instanceof Promise) return pending.then(() => this.render());
		}
		return this.html;
	}
	private append(result: ChildRenderResult): void {
		if (this.sink) {
			// Publish scalar siblings before the next child can write directly.
			let html = result.html;
			if (this.context.textSeparators && result.text && this.previousWasText)
				html = '<!-- -->' + html;
			if (html !== '') this.sink.write(html);
			this.previousWasText = result.text;
			return;
		}
		this.html = captureNestedEnhancementStringPrefix(this.context, this.html);
		if (this.context.textSeparators && result.text && this.previousWasText)
			this.html = appendBoundedHtml(this.context, this.html, '<!-- -->');
		if (result.html !== '') this.html = appendBoundedHtml(this.context, this.html, result.html);
		this.previousWasText = result.text;
	}
}

/** Serializes one opaque native operation or scalar child. */
export function renderChild(
	context: SsrContext,
	child: Child,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor = false,
	target = new SsrOperationTarget(context, parent, options, hasComponentAncestor, renderChildren)
): RenderValue<ChildRenderResult> {
	return renderChildWithTarget(context, child, target);
}

/** Holds tree depth until an actually pending child settles, without closures for completed work. */
function renderChildWithTarget(
	context: SsrContext,
	child: Child,
	target: SsrOperationTarget
): RenderValue<ChildRenderResult> {
	countSsrNode(context);
	enterSsrTreeDepth(context);
	let output: RenderValue<ChildRenderResult>;
	try {
		output = renderChildValue(context, child, target);
	} catch (error) {
		leaveSsrTreeDepth(context);
		throw error;
	}
	if (output instanceof Promise) return output.finally(() => leaveSsrTreeDepth(context));
	leaveSsrTreeDepth(context);
	return output;
}

function renderChildValue(
	context: SsrContext,
	child: Child,
	target: SsrOperationTarget
): RenderValue<ChildRenderResult> {
	const program = readPreparedServerRenderProgram(child);
	if (program) return mapRenderValue(target.renderPreparedServerProgram(program), operationResult);
	const component = readServerComponentReference(child);
	if (component)
		return mapRenderValue(target.renderDirectServerComponent(component), operationResult);
	const range = readPreparedServerChildRange(child);
	if (range) return mapRenderValue(target.renderDirectServerChildRange(range), operationResult);
	const list = readServerList(child);
	if (list) return mapRenderValue(target.renderServerList(list), operationResult);
	const keyed = readPreparedServerKeyedChild(child);
	if (keyed) return mapRenderValue(target.renderDirectServerKeyedChild(keyed), operationResult);
	const executed = executeOpaqueOperation<string | Promise<string>>(child, target);
	if (executed) return mapRenderValue(executed.value, operationResult);
	const value = unwrap(child);
	if (value === null || value === undefined || value === false || value === true)
		return emptyChildResult;
	if (typeof value === 'object' || typeof value === 'function')
		throw new TypeError('Native SSR children require compiler-issued operations or scalar values');
	claimRootText(context);
	return {
		html:
			context.textProjectionDepth === context.hostStack.length
				? String(value)
				: escapeText(String(value)),
		text: true
	};
}

function operationResult(html: string): ChildRenderResult {
	return html === '' ? emptyChildResult : { html, text: false };
}
