import type { ComponentDomain, RenderResult } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactChildRangeReceiptBrand: unique symbol;

/** Opaque compiler-owned operation for one intentionally dynamic child range. */
export type ExactChildRangeReceipt = object & {
	readonly [exactChildRangeReceiptBrand]: never;
};

/** Private focused range inputs readable only by a target renderer. */
export type ExactChildRangeReceiptData = Readonly<{
	value: unknown;
	markerId?: string;
	mayReplaceSubtree: boolean;
	domain?: ComponentDomain;
	/** Optional open client-component resolution state owned by this focused range. */
	dynamicComponent?: Readonly<{
		inspection: import('../dynamic-component/contracts.js').DynamicComponentInspection;
		props?: Readonly<Record<string, unknown>>;
		readiness?: () => PromiseLike<unknown> | undefined;
	}>;
}>;

const ranges = sharedOpaqueOperationStore<ExactChildRangeReceiptData>('child-range');
/** Dispatch key implemented by render targets that accept focused child ranges. */
export const exactChildRangeOperation = Symbol.for('@exactjs/target-operation/child-range');
/** Target contract selected by an opaque focused child-range operation. */
export type ExactChildRangeOperationTarget<Result = unknown> = Readonly<{
	[exactChildRangeOperation](
		operation: ExactChildRangeReceipt,
		data: ExactChildRangeReceiptData
	): Result;
}>;

function executeChildRangeOperation(this: object, target: object): unknown {
	const data = ranges.get(this);
	if (!data) throw new TypeError('Child-range operation lost its compiler-issued payload');
	return (target as ExactChildRangeOperationTarget)[exactChildRangeOperation](
		this as ExactChildRangeReceipt,
		data
	);
}

/** Issues a focused child-range operation without exposing child topology. */
export function createChildRangeReceipt(
	value: unknown,
	markerId?: string,
	mayReplaceSubtree = true,
	dynamicComponent?: ExactChildRangeReceiptData['dynamicComponent']
): ExactChildRangeReceipt {
	const domain = currentComponentDomain();
	const receipt = createOpaqueOperation<ExactChildRangeReceipt>(executeChildRangeOperation, {
		...(domain ? { domain } : {})
	});
	ranges.set(receipt, {
		value,
		mayReplaceSubtree,
		...(markerId ? { markerId } : {}),
		...(domain ? { domain } : {}),
		...(dynamicComponent ? { dynamicComponent } : {})
	});
	return receipt;
}

/** Reads only compiler-issued range operations. */
export function readChildRangeReceipt(value: unknown): ExactChildRangeReceiptData | undefined {
	return typeof value === 'object' && value !== null ? ranges.get(value) : undefined;
}

/** Recomputes the authored value owned by one focused dynamic child-range operation. */
export type ExactChildRangeCompute = () => RenderResult;
