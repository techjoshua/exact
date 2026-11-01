import { unwrap } from '@exactjs/reactive/framework/values';
import { inspectComponentInput } from '../component-abi/receipt.js';
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
	supplied: unknown,
	readPrepared?: (entry: unknown) => Readonly<{ value: unknown; children: readonly unknown[] }>
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
	const visit = (raw: unknown, occurrence: { parent: unknown; cursor: number }): void => {
		const prepared = readPrepared?.(raw);
		const value = unwrap(prepared ? prepared.value : raw);
		if (prepared && value === undefined) {
			for (const child of prepared.children) visit(child, occurrence);
			return;
		}
		if (Array.isArray(value)) {
			for (const child of value) visit(child, occurrence);
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
		const identity = inspectComponentInput(value);
		if (identity.kind === 'component' && !prepared)
			throw new TypeError('Component placement requires actual occurrence-owned prepared output');
		const intrinsic = readCompiledIntrinsicReceipt(value);
		const fragment = readCompiledFragmentReceipt(value);
		const range = readChildRangeReceipt(value);
		const serverRange = readPreparedServerChildRange(value);
		const keyed = readCompiledKeyedChildReceipt(value);
		const program = readRenderProgramReceipt(value);
		const serverProgram = readPreparedServerRenderProgram(value);
		const children =
			prepared?.children ??
			target?.children ??
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
		for (const child of children) visit(child, occurrence);
	};
	const occurrence = { parent: undefined, cursor: 0 };
	for (const child of output) visit(child, occurrence);
	return placement;
}
