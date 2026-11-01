import type { ExactRenderProgramSsrInvocation } from '@exactjs/core/framework/render-structure';
import { readServerSlotReceipt } from '@exactjs/core/runtime/component-abi';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { SsrContext } from '../types.js';
import { prepareIntrinsicRefAttributes } from '../intrinsic-ref-identity.js';
import { countSsrNodes, SsrOutputLimitError } from './limits.js';
import { readServerComponentReference } from './server-component-reference.js';

/** Sentinel returned when a generated writer must reject a slot during its preparation prefix. */
export const unpreparedSsrValue = Symbol('exact.ssr.unprepared');

/** Prepares one scalar text slot without admitting structural or pending values. */
export function prepareSsrText(
	invocation: ExactRenderProgramSsrInvocation,
	index: number
): unknown {
	const value = unwrap(invocation.eagerValues[index]);
	return value instanceof Promise || (typeof value === 'object' && value !== null)
		? unpreparedSsrValue
		: value;
}

/** Prepares one arbitrary child slot after its request-local source settles. */
export function prepareSsrChild(
	invocation: ExactRenderProgramSsrInvocation,
	index: number
): unknown {
	const value = unwrap(invocation.eagerValues[index]);
	return value instanceof Promise ? unpreparedSsrValue : value;
}

/** Prepares one general component slot while preserving its existing reference representation. */
export function prepareSsrComponent(
	invocation: ExactRenderProgramSsrInvocation,
	index: number
): unknown {
	const value = unwrap(invocation.eagerValues[index]);
	if (value instanceof Promise) return unpreparedSsrValue;
	const component = readServerComponentReference(value);
	return component
		? value
		: ((readServerSlotReceipt(value) ? [value] : undefined) ?? unpreparedSsrValue);
}

/** Prepares finalized props for a compiler-selected component callable. */
export function prepareSsrComponentProps(
	invocation: ExactRenderProgramSsrInvocation,
	index: number
): unknown {
	const value = unwrap(invocation.eagerValues[index]);
	return value instanceof Promise || (value !== null && typeof value !== 'object')
		? unpreparedSsrValue
		: value;
}

/**
 * Prepares a host value without awaiting work. Only compiler-owned intrinsic bags may
 * reserve ref identity before child serialization. The omitted flag keeps scalar behavior.
 */
export function prepareSsrAttribute(
	invocation: ExactRenderProgramSsrInvocation,
	index: number,
	intrinsicProps?: true
): unknown {
	const value = unwrap(invocation.eagerValues[index]);
	if (value instanceof Promise) return unpreparedSsrValue;
	return intrinsicProps && value !== null && typeof value === 'object'
		? prepareIntrinsicRefAttributes(value as Record<string, unknown>)
		: value;
}

/** Reserves compiler-owned identities and enforces the conservative character bound. */
export function beginSsrProgram(
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
