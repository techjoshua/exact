import { unwrap } from '@exactjs/reactive/framework/values';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import {
	createOpaqueOperation,
	opaqueOperationDomain,
	sharedOpaqueOperationStore
} from './opaque-operation.js';

declare const exactKeyedChildReceiptBrand: unique symbol;

/** Opaque compiler-issued keyed sibling operation. */
export type ExactKeyedChildReceipt = object & { readonly [exactKeyedChildReceiptBrand]: never };

/** Private target-renderer identity joined to one already lowered child operation. */
export type ExactKeyedChildReceiptData = Readonly<{
	value: unknown;
	key: string;
	/** Reactive resources created while materializing this keyed item. */
	ownerScope?: EffectScope;
}>;

const keyedChildren = sharedOpaqueOperationStore<ExactKeyedChildReceiptData>('keyed-child');
/** Dispatch key implemented by render targets that accept keyed-child operations. */
export const exactKeyedChildOperation = Symbol.for('@exactjs/target-operation/keyed-child');
/** Target contract selected by an opaque keyed-child operation. */
export type ExactKeyedChildOperationTarget<Result = unknown> = Readonly<{
	[exactKeyedChildOperation](
		operation: ExactKeyedChildReceipt,
		data: ExactKeyedChildReceiptData
	): Result;
}>;

function executeKeyedChildOperation(this: object, target: object): unknown {
	const data = keyedChildren.get(this);
	if (!data) throw new TypeError('Keyed child operation lost its compiler-issued payload');
	return (target as ExactKeyedChildOperationTarget)[exactKeyedChildOperation](
		this as ExactKeyedChildReceipt,
		data
	);
}

/** Joins compiler-proven list identity without mutating or interpreting the child operation. */
export function createCompiledKeyedChildReceipt(
	value: unknown,
	authoredKey: unknown,
	ownerScope?: EffectScope
): ExactKeyedChildReceipt {
	const key = unwrap(authoredKey);
	if (key === null || key === undefined) throw new Error('Compiled keyed lists require a key');
	const stringKey = String(key);
	const domain = opaqueOperationDomain(value);
	const receipt = createOpaqueOperation<ExactKeyedChildReceipt>(executeKeyedChildOperation, {
		key: stringKey,
		...(domain ? { domain } : {})
	});
	keyedChildren.set(receipt, {
		value,
		key: stringKey,
		...(ownerScope ? { ownerScope } : {})
	});
	return receipt;
}

/** Reads only compiler-issued keyed sibling operations. */
export function readCompiledKeyedChildReceipt(
	value: unknown
): ExactKeyedChildReceiptData | undefined {
	return typeof value === 'object' && value !== null ? keyedChildren.get(value) : undefined;
}
