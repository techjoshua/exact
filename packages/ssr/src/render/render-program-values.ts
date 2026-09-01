import { unwrap } from '@exactjs/reactive/framework/values';
import {
	readRenderProgramSlot,
	type ExactRenderProgramInvocation
} from '@exactjs/core/framework/render-structure';
import { readServerSlotReceipt } from '@exactjs/core/runtime/component-abi';
import type { SsrContext } from '../types.js';
import { countSsrNodes, SsrOutputLimitError } from './limits.js';
import { readServerComponentReference } from './server-component-reference.js';

/** Sentinel returned when a generated writer must reject a slot during its preparation prefix. */
export const unpreparedSsrValue = Symbol('exact.ssr.unprepared');

/** Prepares one scalar text slot without admitting structural or pending values. */
export function prepareSsrText(invocation: ExactRenderProgramInvocation, index: number): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	return value instanceof Promise || (typeof value === 'object' && value !== null)
		? unpreparedSsrValue
		: value;
}

/** Prepares one arbitrary child slot after its request-local source settles. */
export function prepareSsrChild(invocation: ExactRenderProgramInvocation, index: number): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	return value instanceof Promise ? unpreparedSsrValue : value;
}

/** Prepares one general component slot while preserving its existing reference representation. */
export function prepareSsrComponent(
	invocation: ExactRenderProgramInvocation,
	index: number
): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	if (value instanceof Promise) return unpreparedSsrValue;
	const component = readServerComponentReference(value);
	return component ?? (readServerSlotReceipt(value) ? [value] : undefined) ?? unpreparedSsrValue;
}

/** Prepares finalized props for a compiler-selected component callable. */
export function prepareSsrComponentProps(
	invocation: ExactRenderProgramInvocation,
	index: number
): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	return value instanceof Promise || (value !== null && typeof value !== 'object')
		? unpreparedSsrValue
		: value;
}

/** Prepares one host attribute slot without awaiting work during ordered publication. */
export function prepareSsrAttribute(
	invocation: ExactRenderProgramInvocation,
	index: number
): unknown {
	const value = unwrap(readRenderProgramSlot(invocation, index));
	return value instanceof Promise ? unpreparedSsrValue : value;
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
