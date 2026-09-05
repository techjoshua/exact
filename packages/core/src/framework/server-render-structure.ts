import type { RenderResult } from '../component/contracts.js';
import {
	createPreparedServerChildRange,
	type ExactPreparedServerChildRange
} from '../component-abi/server-child-range.js';

export { isFiniteClientBoundary, markFiniteClientBoundary } from '../hydration-boundary.js';
export { hasIndependentAsyncSiblings, markIndependentAsyncSiblings } from '../ssr-independence.js';
export { RenderProgram, ServerBoundary, ServerSlot } from '../symbols.js';
export {
	createPreparedRenderProgram,
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram,
	readPreparedServerRenderProgram,
	readRenderProgram,
	readRenderProgramReceipt,
	readRenderProgramSlot,
	type ExactRenderProgram,
	type ExactDirectRenderProgram,
	type ExactDomRenderProgram,
	type ExactRenderProgramBinding,
	type ExactRenderProgramBinder,
	type ExactRenderProgramBindingTarget,
	type ExactRenderProgramInvocation,
	type ExactRenderProgramReceipt,
	type ExactRenderProgramReceiptData,
	type ExactPreparedServerRenderProgram,
	type ExactRenderProgramNode,
	type ExactRenderProgramSlot,
	type ExactRenderProgramSsrOperations,
	type ExactRenderProgramSsrOutput,
	type ExactRenderProgramSsrInvocation,
	type ExactRenderProgramSsrWriter,
	type ExactSsrRenderProgram,
	type ExactTableRenderProgram
} from '../render-program.js';
export {
	createPreparedServerComponentReference,
	readPreparedServerComponentReference,
	type ExactPreparedServerComponentReference
} from '../component-abi/receipt.js';
export {
	readPreparedServerChildRange,
	type ExactPreparedServerChildRange
} from '../component-abi/server-child-range.js';
export {
	createPreparedServerKeyedChild,
	readPreparedServerKeyedChild,
	type ExactPreparedServerKeyedChild
} from '../component-abi/server-keyed-child.js';
export {
	createKeyedServerSlot,
	createServerBoundary,
	createServerSlot
} from '../component-abi/server-structure-receipts.js';

/** Evaluates a compiler-known expression directly in a compiler-closed server component. */
export function createExpression<T>(compute: () => T): T {
	return compute();
}

/** Evaluates a compiler-forwarded input directly in a compiler-closed server component. */
export function createForwardedExpression<T>(compute: () => T): T {
	return compute();
}

/** Creates an eager focused child range for a direct server render or its local fallback. */
export function createDynamicChild(
	compute: () => RenderResult,
	markerId?: string,
	mayReplaceSubtree = true
): ExactPreparedServerChildRange {
	return createPreparedServerChildRange(compute(), markerId, mayReplaceSubtree);
}

/** Creates the eager server operation for one compiler-owned dynamic child range. */
export function createCompiledChildRangeReceipt(
	compute: () => RenderResult,
	markerId?: string,
	mayReplaceSubtree = true
): ExactPreparedServerChildRange {
	return createPreparedServerChildRange(compute(), markerId, mayReplaceSubtree);
}
