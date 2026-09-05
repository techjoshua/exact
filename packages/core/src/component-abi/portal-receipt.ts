import type { Child, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { normalizeRenderResult } from '../render-children.js';
import { unwrap } from '@exactjs/reactive/framework/values';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactPortalReceiptBrand: unique symbol;

/** Opaque logical-child placement operation for a renderer-owned target. */
export type ExactPortalReceipt = object & { readonly [exactPortalReceiptBrand]: never };

/** Private portal input readable only by an enabled client target capability. */
export type ExactPortalReceiptData = Readonly<{
	target: unknown;
	children: readonly Child[];
	domain?: ComponentDomain;
}>;

const portals = sharedOpaqueOperationStore<ExactPortalReceiptData>('portal');
/** Dispatch key implemented by render targets that accept portal operations. */
export const exactPortalOperation = Symbol.for('@exactjs/target-operation/portal');
/** Target contract selected by an opaque portal operation. */
export type ExactPortalOperationTarget<Result = unknown> = Readonly<{
	[exactPortalOperation](operation: ExactPortalReceipt, data: ExactPortalReceiptData): Result;
}>;

function executePortalOperation(this: object, target: object): unknown {
	const data = portals.get(this);
	if (!data) throw new TypeError('Portal operation lost its compiler-issued payload');
	return (target as ExactPortalOperationTarget)[exactPortalOperation](
		this as ExactPortalReceipt,
		data
	);
}

/** Issues a focused portal operation directly. */
export function createPortalReceipt(target: unknown, ...children: unknown[]): ExactPortalReceipt {
	return issuePortalReceipt(target, children);
}

/** Creates a logical child subtree whose nodes are placed in another renderer container. */
export const createPortal = createPortalReceipt;

/** Issues a portal from compiler-lowered JSX props. */
export function createCompiledPortalReceipt(
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactPortalReceipt {
	return issuePortalReceipt(unwrap(props?.target), children);
}

function issuePortalReceipt(target: unknown, children: unknown[]): ExactPortalReceipt {
	const domain = currentComponentDomain();
	const receipt = createOpaqueOperation<ExactPortalReceipt>(executePortalOperation, {
		...(domain ? { domain } : {})
	});
	portals.set(receipt, {
		target,
		children: normalizeRenderResult(children),
		...(domain ? { domain } : {})
	});
	return receipt;
}

/** Reads only framework-issued portal operations. */
export function readPortalReceipt(value: unknown): ExactPortalReceiptData | undefined {
	return typeof value === 'object' && value !== null ? portals.get(value) : undefined;
}
