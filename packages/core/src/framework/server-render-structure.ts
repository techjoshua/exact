import type { RenderResult, VNode } from '../component/contracts.js';
import { Dynamic } from '../symbols.js';
import { createVNode } from '../vnode.js';

export { isFiniteClientBoundary, markFiniteClientBoundary } from '../hydration-boundary.js';
export { hasIndependentAsyncSiblings, markIndependentAsyncSiblings } from '../ssr-independence.js';
export { RenderProgram, ServerBoundary, ServerSlot } from '../symbols.js';
export {
	createPreparedRenderProgram,
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram,
	readPreparedServerRenderProgram,
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback,
	type ExactRenderProgram,
	type ExactDirectRenderProgram,
	type ExactDomRenderProgram,
	type ExactRenderProgramBinding,
	type ExactRenderProgramBinder,
	type ExactRenderProgramBindingTarget,
	type ExactRenderProgramInvocation,
	type ExactPreparedServerRenderProgram,
	type ExactRenderProgramNode,
	type ExactRenderProgramSlot,
	type ExactRenderProgramSsrOperations,
	type ExactRenderProgramSsrOutput,
	type ExactRenderProgramSsrWriter,
	type ExactRenderProgramUpdater,
	type ExactSsrRenderProgram,
	type ExactTableRenderProgram
} from '../render-program.js';
export {
	createCellVNode,
	createCompiledComponentVNode,
	createCompiledFragment,
	createCompiledTarget,
	createCompiledVNode,
	createKeyedServerSlot,
	createServerBoundary,
	createServerSlot,
	getCellVNode,
	isCellVNode,
	keyCompiledVNode
} from '../vnode.js';

/** Evaluates a compiler-known expression directly in a compiler-closed server component. */
export function createExpression<T>(compute: () => T): T {
	return compute();
}

/** Evaluates a compiler-forwarded input directly in a compiler-closed server component. */
export function createForwardedExpression<T>(compute: () => T): T {
	return compute();
}

/** Evaluates one compiler-owned non-JSX component result without adding a nested range. */
export function createCompiledComponentOutput<T extends RenderResult>(compute: () => T): T {
	return compute();
}

/** Creates an eager dynamic boundary for a direct server render or its local fallback. */
export function createDynamicChild(
	compute: () => RenderResult,
	markerId?: string,
	mayReplaceSubtree = true
): VNode {
	return createVNode(Dynamic, {
		value: compute(),
		...(mayReplaceSubtree ? {} : { __exactScalarDynamic: true }),
		...(markerId ? { __exactMarkerId: markerId } : {})
	});
}
