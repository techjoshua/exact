import type { Child, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { normalizeRenderResult } from '../render-children.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactActivityReceiptBrand: unique symbol;

/** Opaque compiler-issued operation for one retained Activity boundary. */
export type ExactActivityReceipt = object & {
	readonly [exactActivityReceiptBrand]: never;
};

/** Private retained-boundary inputs readable only by a selected target renderer. */
export type ExactActivityReceiptData = Readonly<{
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	domain?: ComponentDomain;
}>;

const activityReceipts = sharedOpaqueOperationStore<ExactActivityReceiptData>('activity');
/** Dispatch key implemented by render targets that accept Activity operations. */
export const exactActivityOperation = Symbol.for('@exactjs/target-operation/activity');
/** Target contract selected by an opaque Activity operation. */
export type ExactActivityOperationTarget<Result = unknown> = Readonly<{
	[exactActivityOperation](operation: ExactActivityReceipt, data: ExactActivityReceiptData): Result;
}>;

function executeActivityOperation(this: object, target: object): unknown {
	const data = activityReceipts.get(this);
	if (!data) throw new TypeError('Activity operation lost its compiler-issued payload');
	return (target as ExactActivityOperationTarget)[exactActivityOperation](
		this as ExactActivityReceipt,
		data
	);
}

/** Issues a focused retained-boundary operation without exposing its output topology. */
export function createCompiledActivityReceipt(
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactActivityReceipt {
	const domain = currentComponentDomain();
	const receipt = createOpaqueOperation<ExactActivityReceipt>(executeActivityOperation, {
		...(domain ? { domain } : {})
	});
	activityReceipts.set(receipt, {
		props: props ?? {},
		children: normalizeRenderResult(children),
		...(domain ? { domain } : {})
	});
	return receipt;
}

/** Reads only compiler-issued retained Activity operations. */
export function readCompiledActivityReceipt(value: unknown): ExactActivityReceiptData | undefined {
	return typeof value === 'object' && value !== null ? activityReceipts.get(value) : undefined;
}
