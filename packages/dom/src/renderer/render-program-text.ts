import { readRenderProgramSlot } from '@exactjs/core/runtime/render-operations';
import { readIndexedReactiveSlot } from '@exactjs/reactive/framework/runtime';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { Mounted } from '../types.js';

type IndexedOperandOwner = Readonly<{
	state: object;
	props: object;
}>;

/** Applies one focused text value from either an exact operand or an arbitrary slot reader. */
export function applyProgramText(
	mounted: Mounted,
	index: number,
	source?: 0 | 1,
	operandSlot?: number,
	prefix = '',
	suffix = ''
): boolean {
	const state = mounted.renderProgram!;
	const owner = state.invocation.owner as IndexedOperandOwner;
	const value = unwrap(
		source !== undefined
			? readIndexedReactiveSlot(source === 0 ? owner.state : owner.props, operandSlot!)
			: readRenderProgramSlot(state.invocation, index)
	);
	const node = state.slotNodes[index];
	if (!(node instanceof Text)) return false;
	const text =
		value === null || value === undefined || value === false || value === true
			? ''
			: typeof value === 'string' || typeof value === 'number'
				? String(value)
				: undefined;
	if (text === undefined) return false;
	const projected = `${prefix}${text}${suffix}`;
	if (node.data !== projected) node.data = projected;
	return true;
}
