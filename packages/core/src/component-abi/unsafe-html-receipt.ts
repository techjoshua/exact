import type { ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { unwrap } from '@exactjs/reactive/framework/values';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactUnsafeHtmlReceiptBrand: unique symbol;

/** Opaque compiler-selected raw-HTML range operation. */
export type ExactUnsafeHtmlReceipt = object & { readonly [exactUnsafeHtmlReceiptBrand]: never };

/** Private raw-HTML input readable only by an enabled target capability. */
export type ExactUnsafeHtmlReceiptData = Readonly<{
	value: unknown;
	domain?: ComponentDomain;
}>;

const unsafeHtmlReceipts = sharedOpaqueOperationStore<ExactUnsafeHtmlReceiptData>('unsafe-html');
/** Dispatch key implemented by render targets that accept audited raw HTML. */
export const exactUnsafeHtmlOperation = Symbol.for('@exactjs/target-operation/unsafe-html');
/** Target contract selected by an opaque audited raw-HTML operation. */
export type ExactUnsafeHtmlOperationTarget<Result = unknown> = Readonly<{
	[exactUnsafeHtmlOperation](
		operation: ExactUnsafeHtmlReceipt,
		data: ExactUnsafeHtmlReceiptData
	): Result;
}>;

function executeUnsafeHtmlOperation(this: object, target: object): unknown {
	const data = unsafeHtmlReceipts.get(this);
	if (!data) throw new TypeError('Unsafe HTML operation lost its compiler-issued payload');
	return (target as ExactUnsafeHtmlOperationTarget)[exactUnsafeHtmlOperation](
		this as ExactUnsafeHtmlReceipt,
		data
	);
}

/** Issues a focused raw-HTML range operation directly. */
export function createUnsafeHtmlReceipt(value: unknown): ExactUnsafeHtmlReceipt {
	const domain = currentComponentDomain();
	const receipt = createOpaqueOperation<ExactUnsafeHtmlReceipt>(executeUnsafeHtmlOperation, {
		...(domain ? { domain } : {})
	});
	unsafeHtmlReceipts.set(receipt, { value, ...(domain ? { domain } : {}) });
	return receipt;
}

/** Creates an explicitly authorized opaque raw-HTML operation. */
export const unsafeHtml = createUnsafeHtmlReceipt;

/** Issues raw HTML from compiler-lowered JSX props. */
export function createCompiledUnsafeHtmlReceipt(
	props: Record<string, unknown> | null
): ExactUnsafeHtmlReceipt {
	return createUnsafeHtmlReceipt(unwrap(props?.value));
}

/** Reads only compiler-authorized raw-HTML operations. */
export function readUnsafeHtmlReceipt(value: unknown): ExactUnsafeHtmlReceiptData | undefined {
	return typeof value === 'object' && value !== null ? unsafeHtmlReceipts.get(value) : undefined;
}
