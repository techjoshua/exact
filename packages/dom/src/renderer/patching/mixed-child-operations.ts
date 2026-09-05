import type { Child } from '@exactjs/core';
import { isOpaqueOperation, opaqueOperationKey } from '@exactjs/core/runtime/component-operations';
import type { Mounted } from '../../types.js';
import { scalarText } from '../scalar-child.js';

/** One sibling classified as an explicit native or scalar ownership operation. */
export type MixedChildOperation = Readonly<{
	value: Child;
	native?: true;
	scalar?: string;
	key?: string;
}>;

/** Classifies sibling inputs into target-local operations without converting native receipts. */
export function mixedChildOperations(children: readonly Child[]): MixedChildOperation[] {
	const operations: MixedChildOperation[] = [];
	for (const value of children) {
		if (value === null || value === undefined || value === false || value === true) continue;
		if (isOpaqueOperation(value)) {
			const key = opaqueOperationKey(value);
			operations.push({ value, native: true, ...(key === undefined ? {} : { key }) });
			continue;
		}
		const scalar = scalarText(value);
		if (scalar !== undefined) {
			operations.push({ value, scalar });
			continue;
		}
		throw new TypeError(
			'Native eXact children must be compiler-issued operations, scalar values, or empty placeholders'
		);
	}
	return operations;
}

/** Returns renderer sibling identity for a native operation or explicit compatibility value. */
export function mountedChildKey(mounted: Mounted): string | undefined {
	return (
		mounted.operationKey ??
		mounted.componentReceipt?.key ??
		mounted.intrinsicReceipt?.key ??
		mounted.fragmentReceipt?.key ??
		mounted.targetReceipt?.key
	);
}

/** Reports whether a mounted range is owned by a focused native operation. */
export function hasMountedNativeOperation(mounted: Mounted): boolean {
	return !!(
		mounted.componentReceipt ||
		mounted.intrinsicReceipt ||
		mounted.childRangeReceipt ||
		mounted.activityReceipt ||
		mounted.suspenseReceipt ||
		mounted.renderProgramReceipt ||
		mounted.fragmentReceipt ||
		mounted.targetReceipt ||
		mounted.unsafeHtmlReceipt ||
		mounted.portalReceipt ||
		mounted.serverSlotReceipt ||
		mounted.operationKey !== undefined
	);
}
