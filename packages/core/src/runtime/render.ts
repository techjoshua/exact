export { isFiniteClientBoundary, markFiniteClientBoundary } from '../hydration-boundary.js';
export { hasIndependentAsyncSiblings, markIndependentAsyncSiblings } from '../ssr-independence.js';
export {
	clearCompiledRenderPrograms,
	compiledRenderProgramCacheSize,
	createCompiledRenderProgram,
	readRenderProgram,
	readRenderProgramSlot,
	renderProgramFallback,
	type ExactRenderProgram,
	type ExactRenderProgramInvocation,
	type ExactRenderProgramNode,
	type ExactRenderProgramSlot,
	type ExactRenderProgramSsrOperation
} from '../render-program.js';
export {
	createCompiledFragment,
	createCompiledComponentVNode,
	createCompiledTarget,
	createCompiledVNode,
	createDynamicChild,
	createExpression,
	createForwardedExpression,
	createKeyedServerSlot,
	createServerBoundary,
	createServerSlot
} from '../vnode.js';
