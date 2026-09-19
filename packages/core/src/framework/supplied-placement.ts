import { unwrap } from '@exactjs/reactive/framework/values';
import {
	readCompiledComponentReceipt,
	readPreparedServerComponentReference
} from '../component-abi/receipt.js';
import { readCompiledIntrinsicReceipt } from '../component-abi/intrinsic-receipt.js';
import { readCompiledFragmentReceipt } from '../component-abi/fragment-receipt.js';
import { readCompiledTargetReceipt } from '../component-abi/target-receipt.js';
import { readChildRangeReceipt } from '../component-abi/child-range-receipt.js';
import { readPreparedServerChildRange } from '../component-abi/server-child-range.js';
import { readCompiledKeyedChildReceipt } from '../component-abi/keyed-child-receipt.js';
import { readRenderProgramReceipt, readRenderProgramSlot } from '../render-program.js';
import { readPreparedServerRenderProgram } from '../server-render-program.js';

/**
 * Checks an owner's current structural output before placement. It follows compiler child slots,
 * never executes a component, and ignores scalar ranges unrelated to placement. Mutually exclusive
 * placements are evaluated from the same reactive snapshot so moving a child is not a duplicate.
 * Returns the selected operation so a renderer can transfer its existing placement ownership.
 */
export function assertSingleSuppliedPlacement(
	output: readonly unknown[],
	supplied: unknown
): object | undefined {
	let selected = unwrap(supplied);
	while (Array.isArray(selected) && selected.length === 1) selected = unwrap(selected[0]);
	if (selected == null || typeof selected === 'boolean') return;
	let placements = 0;
	let placement: object | undefined;
	const place = (value: object) => {
		if (++placements > 1)
			throw new TypeError('A supplied target cannot be placed more than once by one component');
		placement = value;
	};
	const visit = (raw: unknown): void => {
		const value = unwrap(raw);
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
			return;
		}
		if (typeof value !== 'object' || value === null) return;
		if (value === selected) {
			place(value);
			return;
		}
		const target = readCompiledTargetReceipt(value);
		if (target && target.children.length === 1 && unwrap(target.children[0]) === selected) {
			place(value);
			return;
		}
		const component =
			readCompiledComponentReceipt(value) ?? readPreparedServerComponentReference(value);
		const intrinsic = readCompiledIntrinsicReceipt(value);
		const fragment = readCompiledFragmentReceipt(value);
		const range = readChildRangeReceipt(value);
		const serverRange = readPreparedServerChildRange(value);
		const keyed = readCompiledKeyedChildReceipt(value);
		const program = readRenderProgramReceipt(value);
		const serverProgram = readPreparedServerRenderProgram(value);
		const children =
			target?.children ??
			component?.children ??
			intrinsic?.children ??
			fragment?.children ??
			(range
				? range.mayReplaceSubtree
					? [range.value]
					: []
				: serverRange
					? [serverRange.value]
					: keyed
						? [keyed.value]
						: program
							? (program.invocation.program.targetSlots ?? []).map((index) =>
									readRenderProgramSlot(program.invocation, index)
								)
							: serverProgram
								? (serverProgram.program.targetSlots ?? []).map(
										(index) => serverProgram.eagerValues[index]
									)
								: []);
		for (const child of children) visit(child);
	};
	for (const child of output) visit(child);
	return placement;
}
