import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child } from '../component/contracts.js';
import { createChildRangeReceipt } from '../component-abi/child-range-receipt.js';

/** Identifies present scalar output without treating absent values as live targets. */
export function isTextTargetOutput(value: unknown): boolean {
	const actual = unwrap(value);
	if (Array.isArray(actual)) return actual.length > 0 && actual.every(isTextTargetOutput);
	return typeof actual === 'string' || typeof actual === 'number';
}

/** Gives scalar component output a request-local identity for namespace routing and adoption. */
export function prepareTextTargetOutput(children: readonly Child[]): Child[] {
	return children.map((child) =>
		isTextTargetOutput(child) ? createChildRangeReceipt(child) : child
	);
}
