import { type AnyComponentInstance, normalizeRenderResult } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { ExactRenderProgramSsrOperations } from '@exactjs/core/framework/render-structure';
import type { ExactPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import { readServerSlotReceipt } from '@exactjs/core/runtime/component-abi';
import {
	readRenderProgramSlot,
	type ExactRenderProgramInvocation
} from '@exactjs/core/framework/render-structure';
import { escapeText } from '../html.js';
import { exactMarkerId, renderAttrs, renderNativeAttribute } from '../markup.js';
import { consumeTargetReceiptLayers } from './receipt-target-contributions.js';
import { appendBoundedHtml, countSsrNodes, SsrOutputLimitError } from './limits.js';
import type { Child, SsrContext } from '../types.js';
import {
	readServerComponentReference,
	type ServerComponentReference
} from './server-component-reference.js';
import { captureNestedEnhancementStringPrefix } from './operation-enhancements.js';

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
const unpreparedSsrValue = Symbol('exact.ssr.unprepared');

function prepareSsrText(invocation: ExactRenderProgramInvocation, index: number): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	return value instanceof Promise || (typeof value === 'object' && value !== null)
		? unpreparedSsrValue
		: value;
}

function prepareSsrChild(invocation: ExactRenderProgramInvocation, index: number): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	return value instanceof Promise ? unpreparedSsrValue : value;
}

function prepareSsrComponent(invocation: ExactRenderProgramInvocation, index: number): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	if (value instanceof Promise) return unpreparedSsrValue;
	const component = readServerComponentReference(value);
	return component ?? (readServerSlotReceipt(value) ? [value] : undefined) ?? unpreparedSsrValue;
}

function prepareSsrAttribute(invocation: ExactRenderProgramInvocation, index: number): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	return value instanceof Promise ? unpreparedSsrValue : value;
}

function beginSsrProgram(
	context: SsrContext,
	nodeCount: number,
	slotCount: number,
	staticCharacters: number
): void {
	// Intrinsic identities are not serialized as cell comments, but their compiler-owned positions
	// still occupy the shared request identity space before nested output is rendered.
	context.nextId += nodeCount;
	countSsrNodes(context, nodeCount - 1 + slotCount);
	if (staticCharacters > context.maxOutputBytes)
		throw new SsrOutputLimitError(context.maxOutputBytes);
}

const generatedSsrOperations: ExactRenderProgramSsrOperations = Object.freeze({
	unprepared: unpreparedSsrValue,
	output: () => [],
	prepareText: prepareSsrText,
	prepareChild: prepareSsrChild,
	prepareComponent: prepareSsrComponent,
	prepareAttribute: prepareSsrAttribute,
	begin(opaqueContext, nodeCount, slotCount, staticCharacters) {
		beginSsrProgram(opaqueContext as SsrContext, nodeCount, slotCount, staticCharacters);
	},
	static(output, value) {
		if (value !== '') output.push(value);
	},
	text(opaqueContext, output, value, id, characters, markerless) {
		const context = opaqueContext as SsrContext;
		const rendered =
			value === null || value === undefined || value === false || value === true
				? ''
				: escapeText(String(value));
		const html =
			context.markers && !markerless
				? `<!--x:${exactMarkerId(id)}-->${rendered}<!--/x:${exactMarkerId(id)}-->`
				: rendered;
		const nextCharacters = characters + html.length;
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
	attribute(opaqueContext, output, value, name, tag, characters) {
		const context = opaqueContext as SsrContext;
		const html = renderNativeAttribute(value, name, tag, context);
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
	rootAttributes(opaqueContext, output, value, tag, characters, staticAttributes) {
		const context = opaqueContext as SsrContext;
		const props = value !== null && typeof value === 'object' ? value : {};
		const effective = consumeTargetReceiptLayers(context, props as Record<string, unknown>);
		const html = renderAttrs(
			effective as Record<string, unknown>,
			false,
			tag,
			context,
			effective === props ? staticAttributes?.[1] : undefined
		);
		const rendered = effective === props ? `${staticAttributes?.[0] ?? ''}${html}` : html;
		const nextCharacters = characters + rendered.length;
		if (nextCharacters > context.maxOutputBytes)
			throw new SsrOutputLimitError(context.maxOutputBytes);
		if (rendered !== '') output.push(rendered);
		return nextCharacters;
	}
});

/**
 * Request-local target that lets a compiler-closed synchronous writer publish directly.
 *
 * Methods live on the prototype so one target replaces the former segment array without creating
 * per-operation closures. Deferred and asynchronous rendering retain the stateless collector above.
 */
class SyncSsrProgramTarget implements ExactRenderProgramSsrOperations {
	readonly unprepared = unpreparedSsrValue;
	private html = '';

	constructor(
		private readonly context: SsrContext,
		private readonly renderChildren: (children: readonly Child[]) => string,
		private readonly renderOwnedComponent: (component: ServerComponentReference) => string
	) {}

	output(): import('@exactjs/core/framework/render-structure').ExactRenderProgramSsrOutput {
		return this as unknown as import('@exactjs/core/framework/render-structure').ExactRenderProgramSsrOutput;
	}

	prepareText(invocation: ExactRenderProgramInvocation, index: number): unknown {
		return prepareSsrText(invocation, index);
	}

	prepareChild(invocation: ExactRenderProgramInvocation, index: number): unknown {
		return prepareSsrChild(invocation, index);
	}

	prepareComponent(invocation: ExactRenderProgramInvocation, index: number): unknown {
		return prepareSsrComponent(invocation, index);
	}

	prepareAttribute(invocation: ExactRenderProgramInvocation, index: number): unknown {
		return prepareSsrAttribute(invocation, index);
	}

	begin(_context: object, nodeCount: number, slotCount: number, staticCharacters: number): void {
		beginSsrProgram(this.context, nodeCount, slotCount, staticCharacters);
	}

	static(_output: object, value: string): void {
		this.append(value);
	}

	text(
		_context: object,
		_output: object,
		value: unknown,
		id: string,
		characters: number,
		markerless?: true
	): number {
		const rendered =
			value === null || value === undefined || value === false || value === true
				? ''
				: escapeText(String(value));
		const html =
			this.context.markers && !markerless
				? `<!--x:${exactMarkerId(id)}-->${rendered}<!--/x:${exactMarkerId(id)}-->`
				: rendered;
		this.assertCharacters(characters + html.length);
		this.append(html);
		return characters + html.length;
	}

	child(_context: object, _output: object, value: unknown, id: string, characters: number): number {
		const opening = this.context.markers ? `<!--x:${exactMarkerId(id)}-->` : '';
		const closing = this.context.markers ? `<!--/x:${exactMarkerId(id)}-->` : '';
		const nextCharacters = characters + opening.length + closing.length;
		this.assertCharacters(nextCharacters);
		this.append(opening);
		this.append(this.renderChildren(normalizeRenderResult(value as Child | Child[])));
		this.append(closing);
		return nextCharacters;
	}

	keyedChild(_output: object, value: unknown): void {
		this.append(this.renderChildren(normalizeRenderResult(value as Child | Child[])));
	}

	component(
		_context: object,
		_output: object,
		value: unknown,
		id: string,
		characters: number,
		markerless?: true
	): number {
		const opening = this.context.markers && !markerless ? `<!--x:${exactMarkerId(id)}-->` : '';
		const closing = this.context.markers && !markerless ? `<!--/x:${exactMarkerId(id)}-->` : '';
		const nextCharacters = characters + opening.length + closing.length;
		this.assertCharacters(nextCharacters);
		this.append(opening);
		this.append(this.renderOwnedComponent(value as ServerComponentReference));
		this.append(closing);
		return nextCharacters;
	}

	attribute(
		_context: object,
		_output: object,
		value: unknown,
		name: string,
		tag: string,
		characters: number
	): number {
		return this.appendAttribute(renderNativeAttribute(value, name, tag, this.context), characters);
	}

	attributes(
		_context: object,
		_output: object,
		value: unknown,
		tag: string,
		characters: number
	): number {
		const props = value !== null && typeof value === 'object' ? value : {};
		return this.appendAttribute(
			renderAttrs(props as Record<string, unknown>, false, tag, this.context),
			characters
		);
	}

	rootAttributes(
		_context: object,
		_output: object,
		value: unknown,
		tag: string,
		characters: number,
		staticAttributes?: readonly [html: string, propNames: readonly string[]]
	): number {
		const props = value !== null && typeof value === 'object' ? value : {};
		const effective = consumeTargetReceiptLayers(this.context, props as Record<string, unknown>);
		const html = renderAttrs(
			effective as Record<string, unknown>,
			false,
			tag,
			this.context,
			effective === props ? staticAttributes?.[1] : undefined
		);
		return this.appendAttribute(
			effective === props ? `${staticAttributes?.[0] ?? ''}${html}` : html,
			characters
		);
	}

	/** Returns the bounded output after the generated writer accepted every slot. */
	finish(): string {
		return this.html;
	}

	private appendAttribute(html: string, characters: number): number {
		const nextCharacters = characters + html.length;
		this.assertCharacters(nextCharacters);
		this.append(html);
		return nextCharacters;
	}

	private append(value: string): void {
		this.html = captureNestedEnhancementStringPrefix(this.context, this.html);
		if (value !== '') this.html = appendBoundedHtml(this.context, this.html, value);
	}

	private assertCharacters(characters: number): void {
		if (characters > this.context.maxOutputBytes)
			throw new SsrOutputLimitError(this.context.maxOutputBytes);
	}
}

/** Serializes one direct compiler-issued server invocation into a bounded string. */
export function renderPreparedSsrProgramString(
	context: SsrContext,
	invocation: ExactPreparedServerRenderProgram,
	_owner: AnyComponentInstance | undefined,
	renderChildren: (children: readonly Child[]) => string,
	renderOwnedComponent: (component: ServerComponentReference) => string
): string {
	if (context.reactMarkup)
		throw new TypeError('React markup cannot execute a native eXact render program');
	const writer = invocation.program.ssr;
	if (!writer)
		throw new TypeError(
			`Client-only render program ${invocation.program.id} cannot execute during native SSR`
		);
	const target = new SyncSsrProgramTarget(context, renderChildren, renderOwnedComponent);
	const output = writer(target, context, invocation);
	if (output !== (target as unknown))
		throw new TypeError(
			`Native server render program ${invocation.program.id} rejected its issued values`
		);
	return target.finish();
}

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
