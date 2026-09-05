import { type AnyComponentInstance, normalizeRenderResult } from '@exactjs/core';
import type {
	ExactRenderProgramSsrInvocation,
	ExactRenderProgramSsrOperations,
	ExactRenderProgramSsrOutput
} from '@exactjs/core/framework/render-structure';
import type { ExactPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import type { AnyExactComponentCallable } from '@exactjs/core/framework/component-contracts';
import { renderAttrs, renderCompiledNativeAttribute, renderNativeAttribute } from '../markup.js';
import type { Child, SsrContext } from '../types.js';
import { appendBoundedHtml, SsrOutputLimitError } from './limits.js';
import { captureNestedEnhancementStringPrefix } from './operation-enhancements.js';
import { escapeSsrText } from './output-text.js';
import { renderSsrRootAttributes, type SsrAttributeKind } from './render-program-attributes.js';
import {
	beginSsrProgram,
	prepareSsrAttribute,
	prepareSsrChild,
	prepareSsrComponent,
	prepareSsrComponentProps,
	prepareSsrText,
	unpreparedSsrValue
} from './render-program-values.js';
import type { ServerComponentReference } from './server-component-reference.js';
import type { SyncComponentOperations } from './sync-component.js';

type RenderProgramMarkerPair = readonly [opening: string, closing: string];

const renderProgramMarkerPairs = new Map<string, RenderProgramMarkerPair>();
const emptyRenderProgramMarkerPair = ['', ''] as const;

/** Reuses immutable compiler-local marker strings across requests and component artifacts. */
function renderProgramMarkerPair(id: string): RenderProgramMarkerPair {
	let pair = renderProgramMarkerPairs.get(id);
	if (!pair) {
		pair = [`<!--x:${id}-->`, `<!--/x:${id}-->`];
		renderProgramMarkerPairs.set(id, pair);
	}
	return pair;
}

/**
 * Request-local target that lets a compiler-closed synchronous writer publish directly.
 *
 * Methods live on the prototype so one target replaces a segment array without creating
 * per-operation adapter closures. Deferred and asynchronous rendering use the stateless collector.
 */
class SyncSsrProgramTarget implements ExactRenderProgramSsrOperations {
	readonly unprepared = unpreparedSsrValue;
	private html = '';
	private staticBytesAccounted = false;

	constructor(
		private readonly context: SsrContext,
		private readonly owner: AnyComponentInstance | undefined,
		private readonly operations: SyncComponentOperations
	) {}

	output(): ExactRenderProgramSsrOutput {
		return this as unknown as ExactRenderProgramSsrOutput;
	}

	prepareText(invocation: ExactRenderProgramSsrInvocation, index: number): unknown {
		return prepareSsrText(invocation, index);
	}

	prepareChild(invocation: ExactRenderProgramSsrInvocation, index: number): unknown {
		return prepareSsrChild(invocation, index);
	}

	prepareComponent(invocation: ExactRenderProgramSsrInvocation, index: number): unknown {
		return prepareSsrComponent(invocation, index);
	}

	prepareComponentProps(invocation: ExactRenderProgramSsrInvocation, index: number): unknown {
		return prepareSsrComponentProps(invocation, index);
	}

	prepareAttribute(invocation: ExactRenderProgramSsrInvocation, index: number): unknown {
		return prepareSsrAttribute(invocation, index);
	}

	begin(
		_context: object,
		nodeCount: number,
		slotCount: number,
		staticCharacters: number,
		staticBytes?: number
	): void {
		beginSsrProgram(this.context, nodeCount, slotCount, staticCharacters);
		if (staticBytes !== undefined) {
			this.context.outputSink?.accountClosedBytes(staticBytes);
			this.staticBytesAccounted = true;
		}
	}

	static(_output: object, value: string): void {
		if (!this.staticBytesAccounted) this.context.outputSink?.account(value);
		this.append(value);
	}

	text(
		_context: object,
		_output: object,
		value: unknown,
		id: string,
		characters: number,
		markerless?: true,
		prefix = '',
		suffix = ''
	): number {
		const markerPair =
			this.context.markers && !markerless
				? renderProgramMarkerPair(id)
				: emptyRenderProgramMarkerPair;
		const opening = markerPair[0];
		const closing = markerPair[1];
		this.accountAscii(opening);
		const rendered =
			value === null || value === undefined || value === false || value === true
				? ''
				: escapeSsrText(this.context, String(value));
		this.accountAscii(closing);
		const html = `${prefix}${opening}${rendered}${closing}${suffix}`;
		this.assertCharacters(characters + opening.length + rendered.length + closing.length);
		this.append(html);
		return characters + opening.length + rendered.length + closing.length;
	}

	child(_context: object, _output: object, value: unknown, id: string, characters: number): number {
		const markerPair = this.context.markers
			? renderProgramMarkerPair(id)
			: emptyRenderProgramMarkerPair;
		const opening = markerPair[0];
		const closing = markerPair[1];
		const nextCharacters = characters + opening.length + closing.length;
		this.assertCharacters(nextCharacters);
		this.accountAscii(opening);
		this.append(opening);
		this.append(
			this.operations.renderChildren(
				this.context,
				normalizeRenderResult(value as Child | Child[]),
				this.owner,
				true
			)
		);
		this.accountAscii(closing);
		this.append(closing);
		return nextCharacters;
	}

	keyedChild(_output: object, value: unknown): void {
		this.append(
			this.operations.renderChildren(
				this.context,
				normalizeRenderResult(value as Child | Child[]),
				this.owner,
				true
			)
		);
	}

	component(
		_context: object,
		_output: object,
		value: unknown,
		id: string,
		characters: number,
		markerless?: true
	): number {
		const markerPair =
			this.context.markers && !markerless
				? renderProgramMarkerPair(id)
				: emptyRenderProgramMarkerPair;
		const opening = markerPair[0];
		const closing = markerPair[1];
		const nextCharacters = characters + opening.length + closing.length;
		this.assertCharacters(nextCharacters);
		this.accountAscii(opening);
		this.append(opening);
		this.append(
			this.operations.renderComponent(
				this.context,
				value as ServerComponentReference,
				this.owner,
				true,
				true
			)
		);
		this.accountAscii(closing);
		this.append(closing);
		return nextCharacters;
	}

	directComponent(
		_context: object,
		_output: object,
		component: unknown,
		props: unknown,
		id: string,
		characters: number,
		markerless?: true
	): number {
		const markerPair =
			this.context.markers && !markerless
				? renderProgramMarkerPair(id)
				: emptyRenderProgramMarkerPair;
		const opening = markerPair[0];
		const closing = markerPair[1];
		const nextCharacters = characters + opening.length + closing.length;
		this.assertCharacters(nextCharacters);
		this.accountAscii(opening);
		this.append(opening);
		this.append(
			this.operations.renderDirectComponent(
				this.context,
				component as AnyExactComponentCallable,
				props as Record<string, unknown> | null,
				this.owner,
				true,
				true
			)
		);
		this.accountAscii(closing);
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

	compiledAttribute(
		_context: object,
		_output: object,
		value: unknown,
		kind: SsrAttributeKind,
		name: string,
		attributeName: string,
		tag: string,
		characters: number
	): number {
		return this.appendAttribute(
			renderCompiledNativeAttribute(value, kind, name, attributeName, tag, this.context, true),
			characters,
			true
		);
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

	rootOpening(
		_context: object,
		_output: object,
		value: unknown,
		tag: string,
		prefix: string,
		suffix: string,
		characters: number,
		staticAttributes?: import('@exactjs/core/framework/render-structure').ExactRenderProgram['ssrRootStatic']
	): number {
		const attributes = renderSsrRootAttributes(this.context, value, tag, staticAttributes, true);
		const nextCharacters = characters + attributes.length;
		this.assertCharacters(nextCharacters);
		this.append(`${prefix}${attributes}${suffix}`);
		return nextCharacters;
	}

	/** Returns the bounded output after the generated writer accepted every slot. */
	finish(): string {
		return this.html;
	}

	private appendAttribute(html: string, characters: number, accounted = false): number {
		const nextCharacters = characters + html.length;
		this.assertCharacters(nextCharacters);
		if (!accounted) this.context.outputSink?.account(html);
		this.append(html);
		return nextCharacters;
	}

	private append(value: string): void {
		if (this.context.enhancementOperationRoutes?.length)
			this.context.outputSink?.invalidateAccounting();
		if (this.context.outputSink?.publishesDirectly()) {
			this.context.outputSink.publishAccounted(value);
			return;
		}
		this.html = captureNestedEnhancementStringPrefix(this.context, this.html);
		if (value !== '') this.html = appendBoundedHtml(this.context, this.html, value);
	}

	private accountAscii(value: string): void {
		if (value) this.context.outputSink?.accountKnown(value, value.length);
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
	owner: AnyComponentInstance | undefined,
	operations: SyncComponentOperations
): string {
	if (context.reactMarkup)
		throw new TypeError('React markup cannot execute a native eXact render program');
	const writer = invocation.program.ssr;
	if (!writer)
		throw new TypeError(
			`Client-only render program ${invocation.program.id} cannot execute during native SSR`
		);
	const target = new SyncSsrProgramTarget(context, owner, operations);
	const output = writer(target, context, invocation);
	if (output !== (target as unknown))
		throw new TypeError(
			`Native server render program ${invocation.program.id} rejected its issued values`
		);
	return target.finish();
}
