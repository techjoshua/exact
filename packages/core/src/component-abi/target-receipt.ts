import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { normalizeRenderResult } from '../render-children.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactTargetReceiptBrand: unique symbol;

/** Opaque compiler-issued semantic-target child-range operation. */
export type ExactTargetReceipt = object & { readonly [exactTargetReceiptBrand]: never };

/** Private DOM and SSR inputs for one semantic target range. */
export type ExactTargetReceiptData = Readonly<{
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	key?: string;
	domain?: ComponentDomain;
}>;

const targets = sharedOpaqueOperationStore<ExactTargetReceiptData>('target');
/** Dispatch key implemented by render targets that accept semantic target ranges. */
export const exactTargetOperation = Symbol.for('@exactjs/target-operation/target');
/** Target contract selected by an opaque semantic-target operation. */
export type ExactTargetOperationTarget<Result = unknown> = Readonly<{
	[exactTargetOperation](operation: ExactTargetReceipt, data: ExactTargetReceiptData): Result;
}>;

function executeTargetOperation(this: object, target: object): unknown {
	const data = targets.get(this);
	if (!data) throw new TypeError('Target operation lost its compiler-issued payload');
	return (target as ExactTargetOperationTarget)[exactTargetOperation](
		this as ExactTargetReceipt,
		data
	);
}

/** Issues a semantic-target range operation directly. */
export function createCompiledTargetReceipt(
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactTargetReceipt {
	const { key: authoredKey, ...targetProps } = props ?? {};
	const rawKey = unwrap(authoredKey);
	const domain = currentComponentDomain();
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	const receipt = createOpaqueOperation<ExactTargetReceipt>(executeTargetOperation, {
		...(key === undefined ? {} : { key }),
		...(domain ? { domain } : {})
	});
	targets.set(receipt, {
		props: targetProps,
		children: normalizeRenderResult(children),
		...(key === undefined ? {} : { key }),
		...(domain ? { domain } : {})
	});
	return receipt;
}

/** Reads only compiler-issued semantic-target operations. */
export function readCompiledTargetReceipt(value: unknown): ExactTargetReceiptData | undefined {
	return typeof value === 'object' && value !== null ? targets.get(value) : undefined;
}
