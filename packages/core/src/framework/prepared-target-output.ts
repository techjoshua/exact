import type { Child } from '../component/contracts.js';
import { readChildRangeReceipt } from '../component-abi/child-range-receipt.js';
import { readPreparedServerChildRange } from '../component-abi/server-child-range.js';
import {
	readCompiledTargetReceipt,
	type ExactTargetReceiptData
} from '../component-abi/target-receipt.js';
import { unwrap } from '@exactjs/reactive/framework/values';

/**
 * Reads one prepared contribution boundary or transparent supplied-child placement. Never executes
 * descendant components. A contribution must place the supplied logical child exactly once;
 * structural output belongs to a separate preparation boundary rather than a descendant search.
 */
export function readPreparedTargetOutput(
	output: readonly Child[],
	supplied: Child
): ExactTargetReceiptData | undefined {
	const value = singlePreparedValue(output, supplied);
	if (value === supplied) return undefined;
	const target = readCompiledTargetReceipt(value);
	if (!target)
		throw new TypeError(
			'Fragment contribution preparation requires a single supplied-target placement'
		);
	if (singlePreparedValue(target.children, supplied) !== supplied)
		throw new TypeError('An enhancement must place its supplied fragment exactly once');
	return target;
}

/** Retains the selected receipt itself while unwrapping transparent compiler expression ranges. */
function singlePreparedValue(output: unknown, supplied: Child): unknown {
	let value = output;
	for (;;) {
		if (value === supplied) return value;
		value = unwrap(value);
		if (value === supplied) return value;
		if (Array.isArray(value) && value.length === 1) {
			value = value[0];
			continue;
		}
		const range = readChildRangeReceipt(value);
		if (range && !range.dynamicComponent) {
			value = range.value;
			continue;
		}
		const serverRange = readPreparedServerChildRange(value);
		if (serverRange) {
			value = serverRange.value;
			continue;
		}
		return value;
	}
}

/** Reads a single supplied logical operation through transparent value containers, retaining fragments. */
export function readSuppliedTargetValue(output: readonly Child[]): unknown {
	return singlePreparedValue(output, undefined);
}
