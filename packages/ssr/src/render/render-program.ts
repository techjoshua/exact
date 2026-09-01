import { type AnyComponentInstance, normalizeRenderResult } from '@exactjs/core';
import type { ExactRenderProgramSsrOperations } from '@exactjs/core/framework/render-structure';
import {
	createPreparedServerComponentReference,
	type ExactPreparedServerRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import type { ExactRenderProgramInvocation } from '@exactjs/core/framework/render-structure';
import { escapeText } from '../html.js';
import {
	exactMarkerId,
	renderAttrs,
	renderCompiledNativeAttribute,
	renderNativeAttribute
} from '../markup.js';
import { SsrOutputLimitError } from './limits.js';
import type { Child, SsrContext } from '../types.js';
import type { ServerComponentReference } from './server-component-reference.js';
import { renderSsrRootAttributes } from './render-program-attributes.js';
import {
	beginSsrProgram,
	prepareSsrAttribute,
	prepareSsrChild,
	prepareSsrComponent,
	prepareSsrComponentProps,
	prepareSsrText,
	unpreparedSsrValue
} from './render-program-values.js';

/** Executes a compiler-closed server invocation directly. */
export function renderPreparedSsrProgram(
	context: SsrContext,
	invocation: ExactPreparedServerRenderProgram,
	owner?: AnyComponentInstance
): { readonly segments: readonly DeferredSsrSegment[] } {
	if (context.reactMarkup)
		throw new TypeError('React markup cannot execute a native eXact render program');
	return executeSsrProgram(context, invocation, owner);
}

function executeSsrProgram(
	context: SsrContext,
	invocation: ExactRenderProgramInvocation,
	_owner?: AnyComponentInstance
): { readonly segments: readonly DeferredSsrSegment[] } {
	const { program } = invocation;
	if (program.ssr) {
		const output = program.ssr(generatedSsrOperations, context, invocation);
		if (!output)
			throw new TypeError(`Native server render program ${program.id} rejected its issued values`);
		return { segments: output as DeferredSsrSegment[] };
	}
	throw new TypeError(`Client-only render program ${program.id} cannot execute during native SSR`);
}

type DeferredSsrSegment = string | readonly Child[] | ServerComponentReference;

/**
 * Supplies stateless serialization operations to one compiler-generated server lane.
 *
 * A compiler-emitted preparation prefix reads and validates every slot before later generated
 * calls can mutate the SSR context. This preserves local fallback semantics without making the
 * runtime rediscover component topology from an operation table.
 */
const generatedSsrOperations: ExactRenderProgramSsrOperations = Object.freeze({
	unprepared: unpreparedSsrValue,
	output: () => [],
	prepareText: prepareSsrText,
	prepareChild: prepareSsrChild,
	prepareComponent: prepareSsrComponent,
	prepareComponentProps: prepareSsrComponentProps,
	prepareAttribute: prepareSsrAttribute,
	begin(opaqueContext, nodeCount, slotCount, staticCharacters, _staticBytes) {
		beginSsrProgram(opaqueContext as SsrContext, nodeCount, slotCount, staticCharacters);
	},
	static(output, value) {
		if (value !== '') output.push(value);
	},
	text(opaqueContext, output, value, id, characters, markerless, prefix = '', suffix = '') {
		const context = opaqueContext as SsrContext;
		const rendered =
			value === null || value === undefined || value === false || value === true
				? ''
				: escapeText(String(value));
		const dynamic =
			context.markers && !markerless
				? `<!--x:${exactMarkerId(id)}-->${rendered}<!--/x:${exactMarkerId(id)}-->`
				: rendered;
		const html = `${prefix}${dynamic}${suffix}`;
		const nextCharacters = characters + dynamic.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') output.push(html);
		return nextCharacters;
	},
	child(opaqueContext, output, value, id, characters) {
		const context = opaqueContext as SsrContext;
		const children = normalizeRenderResult(value as Child | Child[]);
		const opening = context.markers ? `<!--x:${exactMarkerId(id)}-->` : '';
		const closing = context.markers ? `<!--/x:${exactMarkerId(id)}-->` : '';
		const nextCharacters = characters + opening.length + closing.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (opening) output.push(opening);
		output.push(children);
		if (closing) output.push(closing);
		return nextCharacters;
	},
	keyedChild(output, value) {
		output.push(normalizeRenderResult(value as Child | Child[]));
	},
	component(opaqueContext, output, value, id, characters, markerless) {
		const context = opaqueContext as SsrContext;
		const opening = context.markers && !markerless ? `<!--x:${exactMarkerId(id)}-->` : '';
		const closing = context.markers && !markerless ? `<!--/x:${exactMarkerId(id)}-->` : '';
		const nextCharacters = characters + opening.length + closing.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (opening) output.push(opening);
		(output as unknown as DeferredSsrSegment[]).push(value as ServerComponentReference);
		if (closing) output.push(closing);
		return nextCharacters;
	},
	directComponent(opaqueContext, output, component, props, id, characters, markerless) {
		const reference = createPreparedServerComponentReference(
			component as Parameters<typeof createPreparedServerComponentReference>[0],
			props as Record<string, unknown> | null
		);
		return generatedSsrOperations.component(
			opaqueContext,
			output,
			reference,
			id,
			characters,
			markerless
		);
	},
	attribute(opaqueContext, output, value, name, tag, characters) {
		const context = opaqueContext as SsrContext;
		const html = renderNativeAttribute(value, name, tag, context);
		const nextCharacters = characters + html.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') output.push(html);
		return nextCharacters;
	},
	compiledAttribute(opaqueContext, output, value, kind, name, attributeName, tag, characters) {
		const context = opaqueContext as SsrContext;
		const html = renderCompiledNativeAttribute(value, kind, name, attributeName, tag, context);
		const nextCharacters = characters + html.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') output.push(html);
		return nextCharacters;
	},
	attributes(opaqueContext, output, value, tag, characters) {
		const context = opaqueContext as SsrContext;
		const props = value !== null && typeof value === 'object' ? value : {};
		const html = renderAttrs(props as Record<string, unknown>, false, tag, context);
		const nextCharacters = characters + html.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') output.push(html);
		return nextCharacters;
	},
	rootOpening(opaqueContext, output, value, tag, prefix, suffix, characters, staticAttributes) {
		const context = opaqueContext as SsrContext;
		const rendered = renderSsrRootAttributes(context, value, tag, staticAttributes);
		const nextCharacters = characters + rendered.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		output.push(`${prefix}${rendered}${suffix}`);
		return nextCharacters;
	}
});

/** Streams one direct compiler-issued server invocation. */
export function renderPreparedSsrProgramChunks(
	context: SsrContext,
	invocation: ExactPreparedServerRenderProgram,
	owner: AnyComponentInstance | undefined,
	renderChildren: (children: readonly Child[]) => Iterable<string>,
	renderOwnedComponent: (component: ServerComponentReference) => Iterable<string>
): Iterable<string> {
	const planned = renderPreparedSsrProgram(context, invocation, owner);
	return flattenDeferredSegments(planned.segments, renderChildren, renderOwnedComponent);
}

function* flattenDeferredSegments(
	segments: readonly DeferredSsrSegment[],
	renderChildren: (children: readonly Child[]) => Iterable<string>,
	renderOwnedComponent: (component: ServerComponentReference) => Iterable<string>
): Iterable<string> {
	for (const segment of segments) {
		if (typeof segment === 'string') yield segment;
		else if (Array.isArray(segment)) yield* renderChildren(segment);
		else yield* renderOwnedComponent(segment as ServerComponentReference);
	}
}
