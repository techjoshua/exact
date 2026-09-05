import type { Child, CompiledEnhancementNode, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { normalizeRenderResult } from '../render-children.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactSuspenseReceiptBrand: unique symbol;

/** Opaque compiler-issued operation for one native readiness boundary. */
export type ExactSuspenseReceipt = object & {
	readonly [exactSuspenseReceiptBrand]: never;
};

/** Private readiness-boundary inputs readable only by a selected target renderer. */
export type ExactSuspenseReceiptData = Readonly<{
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	domain?: ComponentDomain;
	enhancement?: CompiledEnhancementNode;
}>;

const suspenseReceipts = sharedOpaqueOperationStore<ExactSuspenseReceiptData>('suspense');
/** Dispatch key implemented by render targets that accept Suspense operations. */
export const exactSuspenseOperation = Symbol.for('@exactjs/target-operation/suspense');
/** Target contract selected by an opaque Suspense operation. */
export type ExactSuspenseOperationTarget<Result = unknown> = Readonly<{
	[exactSuspenseOperation](operation: ExactSuspenseReceipt, data: ExactSuspenseReceiptData): Result;
}>;

function executeSuspenseOperation(this: object, target: object): unknown {
	const data = suspenseReceipts.get(this);
	if (!data) throw new TypeError('Suspense operation lost its compiler-issued payload');
	return (target as ExactSuspenseOperationTarget)[exactSuspenseOperation](
		this as ExactSuspenseReceipt,
		data
	);
}

/** Issues a focused readiness-boundary operation without exposing output topology. */
export function createCompiledSuspenseReceipt(
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactSuspenseReceipt {
	const { __exactEnhancements: enhancement, ...suspenseProps } = props ?? {};
	const domain = currentComponentDomain();
	const receipt = createOpaqueOperation<ExactSuspenseReceipt>(executeSuspenseOperation, {
		...(domain ? { domain } : {})
	});
	suspenseReceipts.set(receipt, {
		props: suspenseProps,
		children: normalizeRenderResult(children),
		...(domain ? { domain } : {}),
		...(enhancement ? { enhancement: enhancement as CompiledEnhancementNode } : {})
	});
	return receipt;
}

/** Reads only compiler-issued native readiness-boundary operations. */
export function readCompiledSuspenseReceipt(value: unknown): ExactSuspenseReceiptData | undefined {
	return typeof value === 'object' && value !== null ? suspenseReceipts.get(value) : undefined;
}

/** Removes declaration metadata while preserving one compiler-issued readiness operation. */
export function withoutCompiledSuspenseReceiptEnhancement(
	value: unknown
): ExactSuspenseReceipt | undefined {
	const data = readCompiledSuspenseReceipt(value);
	if (!data) return undefined;
	if (!data.enhancement) return value as ExactSuspenseReceipt;
	const receipt = createOpaqueOperation<ExactSuspenseReceipt>(executeSuspenseOperation, data);
	const { enhancement: _enhancement, ...plain } = data;
	suspenseReceipts.set(receipt, plain);
	return receipt;
}
