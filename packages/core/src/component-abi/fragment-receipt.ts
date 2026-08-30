import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child, CompiledEnhancementNode, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { normalizeRenderResult } from '../render-children.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactFragmentReceiptBrand: unique symbol;

/** Opaque compiler-issued transparent child-range operation. */
export type ExactFragmentReceipt = object & { readonly [exactFragmentReceiptBrand]: never };

/** Private target-renderer inputs for a transparent compiler-owned range. */
export type ExactFragmentReceiptData = Readonly<{
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	key?: string;
	domain?: ComponentDomain;
	enhancement?: CompiledEnhancementNode;
}>;

const fragments = sharedOpaqueOperationStore<ExactFragmentReceiptData>('fragment');
/** Dispatch key implemented by render targets that accept fragment ranges. */
export const exactFragmentOperation = Symbol.for('@exactjs/target-operation/fragment');
/** Target contract selected by an opaque fragment-range operation. */
export type ExactFragmentOperationTarget<Result = unknown> = Readonly<{
	[exactFragmentOperation](operation: ExactFragmentReceipt, data: ExactFragmentReceiptData): Result;
}>;

function executeFragmentOperation(this: object, target: object): unknown {
	const data = fragments.get(this);
	if (!data) throw new TypeError('Fragment operation lost its compiler-issued payload');
	return (target as ExactFragmentOperationTarget)[exactFragmentOperation](
		this as ExactFragmentReceipt,
		data
	);
}

/** Issues a transparent range operation directly. */
export function createCompiledFragmentReceipt(
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactFragmentReceipt {
	const { key: authoredKey, __exactEnhancements: enhancement, ...fragmentProps } = props ?? {};
	const rawKey = unwrap(authoredKey);
	const domain = currentComponentDomain();
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	const receipt = createOpaqueOperation<ExactFragmentReceipt>(executeFragmentOperation, {
		...(key === undefined ? {} : { key }),
		...(domain ? { domain } : {})
	});
	fragments.set(receipt, {
		props: fragmentProps,
		children: normalizeRenderResult(children),
		...(key === undefined ? {} : { key }),
		...(domain ? { domain } : {}),
		...(enhancement ? { enhancement: enhancement as CompiledEnhancementNode } : {})
	});
	return receipt;
}

/** Reads only compiler-issued transparent range operations. */
export function readCompiledFragmentReceipt(value: unknown): ExactFragmentReceiptData | undefined {
	return typeof value === 'object' && value !== null ? fragments.get(value) : undefined;
}

/** Removes declaration metadata while preserving one compiler-issued transparent range. */
export function withoutCompiledFragmentReceiptEnhancement(
	value: unknown
): ExactFragmentReceipt | undefined {
	const data = readCompiledFragmentReceipt(value);
	if (!data) return undefined;
	if (!data.enhancement) return value as ExactFragmentReceipt;
	const receipt = createOpaqueOperation<ExactFragmentReceipt>(executeFragmentOperation, data);
	const { enhancement: _enhancement, ...plain } = data;
	fragments.set(receipt, plain);
	return receipt;
}
