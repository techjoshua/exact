import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child, CompiledEnhancementNode, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { normalizeRenderResult } from '../render-children.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactIntrinsicReceiptBrand: unique symbol;

/** Opaque compiler-issued operation for one intrinsic element. */
export type ExactIntrinsicReceipt = object & {
	readonly [exactIntrinsicReceiptBrand]: never;
};

/** Private target-renderer inputs for a compiler-selected intrinsic operation. */
export type ExactIntrinsicReceiptData = Readonly<{
	tag: string;
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	key?: string;
	domain?: ComponentDomain;
	enhancement?: CompiledEnhancementNode;
}>;

const intrinsics = sharedOpaqueOperationStore<ExactIntrinsicReceiptData>('intrinsic');
/** Dispatch key implemented by render targets that accept intrinsic operations. */
export const exactIntrinsicOperation = Symbol.for('@exactjs/target-operation/intrinsic');

/** Target-owned intrinsic placement selected by the operation rather than by caller inspection. */
export type ExactIntrinsicOperationTarget<Result = unknown> = Readonly<{
	[exactIntrinsicOperation](
		operation: ExactIntrinsicReceipt,
		data: ExactIntrinsicReceiptData
	): Result;
}>;

function executeIntrinsicOperation(this: object, target: object): unknown {
	const data = intrinsics.get(this);
	if (!data) throw new TypeError('Intrinsic operation lost its compiler-issued payload');
	return (target as ExactIntrinsicOperationTarget)[exactIntrinsicOperation](
		this as ExactIntrinsicReceipt,
		data
	);
}

/** Issues a direct intrinsic operation. */
export function createCompiledIntrinsicReceipt(
	tag: string,
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactIntrinsicReceipt {
	if (typeof tag !== 'string')
		throw new TypeError('Compiled intrinsic receipt requires an intrinsic tag');
	const { key: authoredKey, __exactEnhancements: enhancement, ...intrinsicProps } = props ?? {};
	const rawKey = unwrap(authoredKey);
	const domain = currentComponentDomain();
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	const receipt = createOpaqueOperation<ExactIntrinsicReceipt>(executeIntrinsicOperation, {
		...(key === undefined ? {} : { key }),
		...(domain ? { domain } : {})
	});
	intrinsics.set(receipt, {
		tag,
		props: intrinsicProps,
		children: normalizeRenderResult(children),
		...(key === undefined ? {} : { key }),
		...(domain ? { domain } : {}),
		...(enhancement ? { enhancement: enhancement as CompiledEnhancementNode } : {})
	});
	return receipt;
}

/** Reads only compiler-issued intrinsic operations. */
export function readCompiledIntrinsicReceipt(
	value: unknown
): ExactIntrinsicReceiptData | undefined {
	return typeof value === 'object' && value !== null ? intrinsics.get(value) : undefined;
}

/** Removes declaration metadata while preserving one compiler-issued intrinsic operation. */
export function withoutCompiledIntrinsicReceiptEnhancement(
	value: unknown
): ExactIntrinsicReceipt | undefined {
	const data = readCompiledIntrinsicReceipt(value);
	if (!data) return undefined;
	if (!data.enhancement) return value as ExactIntrinsicReceipt;
	const receipt = createOpaqueOperation<ExactIntrinsicReceipt>(executeIntrinsicOperation, data);
	const { enhancement: _enhancement, ...plain } = data;
	intrinsics.set(receipt, plain);
	return receipt;
}
