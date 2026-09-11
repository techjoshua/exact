import { normalizeRenderResult } from '@exactjs/core';
import { readServerComponentOutputForHost } from '@exactjs/core/framework/server-component-execution';
import type {
	ExactRenderProgramSsrOperations,
	ExactRenderProgramSsrOutput
} from '@exactjs/core/framework/render-structure';
import {
	createPreparedServerComponentReference,
	createPreparedServerComponentReferenceFromPlainProps,
	type ExactPreparedServerRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import { escapeText } from '../html.js';
import { renderAttrs, renderCompiledNativeAttribute, renderNativeAttribute } from '../markup.js';
import type { Child, SsrContext } from '../types.js';
import { SsrOutputLimitError } from './limits.js';
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
import { mapRenderValue, type RenderValue } from './execution.js';
import {
	renderProgramWriter,
	type SsrProgramRenderTarget,
	type SsrProgramWriterOutput
} from './program-writer-output.js';
import { writeProgramChild } from './program-boundary.js';
import { hasScalarPropsAttempt, markScalarPropsProof } from './scalar-props-proof.js';

/** Executes a compiler-closed invocation directly into caller-owned output. */
export function renderPreparedSsrProgram(
	context: SsrContext,
	invocation: ExactPreparedServerRenderProgram,
	render: ((value: unknown) => RenderValue<string>) | SsrProgramRenderTarget<unknown>,
	prepareReferences?: (values: readonly unknown[]) => AsyncDisposable | undefined
): RenderValue<string> {
	if (invocation.deferredValues) {
		const { host, read } = invocation.deferredValues;
		return mapRenderValue(readServerComponentOutputForHost(host, read), (eagerValues) =>
			renderPreparedSsrProgram(
				context,
				{ ...invocation, eagerValues, deferredValues: undefined },
				render,
				prepareReferences
			)
		);
	}
	if (context.reactMarkup)
		throw new TypeError('React markup cannot execute a native eXact render program');
	const writer = invocation.program.ssr;
	if (!writer)
		throw new TypeError(
			`Client-only render program ${invocation.program.id} cannot execute during native SSR`
		);
	return renderProgramWriter(
		context,
		invocation.program.ssrHost,
		invocation,
		invokePreparedSsrProgram,
		render,
		prepareReferences
	);
}

/** Invokes a validated program without allocating a wrapper closure for each traversal position. */
function invokePreparedSsrProgram(
	output: SsrProgramWriterOutput<unknown>,
	invocation: ExactPreparedServerRenderProgram
): unknown {
	const writer = invocation.program.ssr!;
	return writer(generatedSsrOperations, output.context, invocation, output);
}

/**
 * Supplies stateless serialization operations to one compiler-generated server lane.
 *
 * A compiler-emitted preparation prefix validates slots before generated writes begin. Invalid
 * preparation rejects the invocation; runtime helpers do not reconstruct a fallback tree from an
 * operation table. The caller owns document ancestry and cleanup around the invocation.
 */
const generatedSsrOperations: ExactRenderProgramSsrOperations = Object.freeze({
	unprepared: unpreparedSsrValue,
	promise: Promise,
	reference(component, props, scalarPropKey, proofInvocation) {
		// Reference creation reads reserved metadata. Inherited metadata could run authored
		// accessors and expose the otherwise private bag before preparation.
		const privateProps =
			proofInvocation !== undefined &&
			!('key' in Object.prototype) &&
			!('__exactEnhancements' in Object.prototype);
		// The same first-use proof excludes reserved metadata normalization. Later visits
		// must inspect props again because component execution may have exposed the bag.
		const reference =
			privateProps && scalarPropKey !== undefined && !hasScalarPropsAttempt(proofInvocation)
				? createPreparedServerComponentReferenceFromPlainProps(
						component as Parameters<typeof createPreparedServerComponentReference>[0],
						props as Record<string, unknown>
					)
				: createPreparedServerComponentReference(
						component as Parameters<typeof createPreparedServerComponentReference>[0],
						props as Record<string, unknown> | null
					);
		if (proofInvocation && scalarPropKey !== undefined)
			markScalarPropsProof(reference, props, proofInvocation, scalarPropKey, privateProps);
		return reference;
	},
	prepareText: prepareSsrText,
	prepareChild: prepareSsrChild,
	prepareComponent: prepareSsrComponent,
	prepareComponentProps: prepareSsrComponentProps,
	prepareAttribute: prepareSsrAttribute,
	begin(opaqueContext, nodeCount, slotCount, staticCharacters, _staticBytes) {
		beginSsrProgram(opaqueContext as SsrContext, nodeCount, slotCount, staticCharacters);
	},
	static(output, value, bodyCloseOffset) {
		if (bodyCloseOffset !== undefined) {
			const target = output as SsrProgramWriterOutput<unknown>;
			if (
				target.context.documentRootSeen &&
				target.context.hostStack.at(-1) === 'body' &&
				target.sink.captureDocumentBoundary
			) {
				if (
					!Number.isSafeInteger(bodyCloseOffset) ||
					bodyCloseOffset < 0 ||
					value.slice(bodyCloseOffset) !== '</body>'
				)
					throw new TypeError('Invalid compiler body-closing boundary');
				if (bodyCloseOffset) target.sink.write(value.slice(0, bodyCloseOffset));
				target.sink.captureDocumentBoundary();
				target.sink.write(value.slice(bodyCloseOffset));
				return;
			}
		}
		if (value !== '') appendProgramText(output, value);
	},
	text(opaqueContext, output, value, id, characters, markerless, prefix = '', suffix = '') {
		const context = opaqueContext as SsrContext;
		const rendered =
			value === null || value === undefined || value === false || value === true
				? ''
				: escapeText(String(value));
		const dynamic =
			context.markers && !markerless ? `<!--x:${id}-->${rendered}<!--/x:${id}-->` : rendered;
		const html = `${prefix}${dynamic}${suffix}`;
		const nextCharacters = characters + dynamic.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') appendProgramText(output, html);
		return nextCharacters;
	},
	child(opaqueContext, output, value, id, characters) {
		return writeProgramChild(
			opaqueContext as SsrContext,
			output as SsrProgramWriterOutput<unknown>,
			normalizeRenderResult(value as Child | Child[]),
			id,
			characters
		);
	},
	keyedChild(output, value) {
		const target = output as SsrProgramWriterOutput<unknown>;
		return mapRenderValue(
			writeProgramChild(
				target.context,
				target,
				normalizeRenderResult(value as Child | Child[]),
				'',
				0,
				true
			),
			() => undefined
		);
	},
	component(opaqueContext, output, value, id, characters, markerless) {
		return writeProgramChild(
			opaqueContext as SsrContext,
			output as SsrProgramWriterOutput<unknown>,
			value,
			id,
			characters,
			markerless
		);
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
		if (html !== '') appendProgramText(output, html);
		return nextCharacters;
	},
	compiledAttribute(opaqueContext, output, value, kind, name, attributeName, tag, characters) {
		const context = opaqueContext as SsrContext;
		const html = renderCompiledNativeAttribute(value, kind, name, attributeName, tag, context);
		const nextCharacters = characters + html.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') appendProgramText(output, html);
		return nextCharacters;
	},
	attributes(opaqueContext, output, value, tag, characters) {
		const context = opaqueContext as SsrContext;
		const props = value !== null && typeof value === 'object' ? value : {};
		const html = renderAttrs(props as Record<string, unknown>, false, tag, context);
		const nextCharacters = characters + html.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (html !== '') appendProgramText(output, html);
		return nextCharacters;
	},
	rootOpening(opaqueContext, output, value, tag, prefix, suffix, characters, staticAttributes) {
		const context = opaqueContext as SsrContext;
		const rendered = renderSsrRootAttributes(context, value, tag, staticAttributes);
		const nextCharacters = characters + rendered.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		appendProgramText(output, `${prefix}${rendered}${suffix}`);
		return nextCharacters;
	}
});

/** Publishes one completed span without allocating a deferred segment array. */
function appendProgramText(output: ExactRenderProgramSsrOutput, html: string): void {
	output.sink.write(html);
}
