export { isFiniteClientBoundary, markFiniteClientBoundary } from '../hydration-boundary.js';
export { hasIndependentAsyncSiblings, markIndependentAsyncSiblings } from '../ssr-independence.js';
export { RenderProgram, ServerBoundary, ServerSlot } from '../symbols.js';
export {
	createPreparedRenderProgram,
	prepareCompiledRenderProgram,
	readRenderProgram,
	readRenderProgramReceipt,
	readRenderProgramSlot,
	type ExactRenderProgram,
	type ExactDirectRenderProgram,
	type ExactDomRenderProgram,
	type ExactRenderProgramBinding,
	type ExactRenderProgramBindingOperation,
	type ExactRenderProgramBinder,
	type ExactRenderProgramBindingTarget,
	type ExactRenderProgramClaimOperation,
	type ExactRenderProgramInvocation,
	type ExactRenderProgramReceipt,
	type ExactRenderProgramReceiptData,
	type ExactRenderProgramNode,
	type ExactRenderProgramSlot,
	type ExactRenderProgramSsrOperations,
	type ExactRenderProgramSsrAttribute,
	type ExactRenderProgramSsrInvocation,
	type ExactRenderProgramSsrOutput,
	type ExactRenderProgramSsrWriter,
	type ExactRenderProgramWiring,
	type ExactSsrRenderProgram,
	type ExactTableRenderProgram
} from '../render-program.js';
export {
	createDynamicChild,
	createExpression,
	createForwardedExpression
} from '../component/reactive-expressions.js';
export {
	assertNativePropAllowed,
	assertNativeEventHandler,
	isNativeEventProp,
	isNativeSrcdocProp
} from '../native-props.js';
export {
	projectPreparedText,
	type PreparedTextResolver
} from '../component-abi/text-projection.js';
export {
	FragmentPresentationHosts,
	hasFragmentHostProps,
	type FragmentContribution,
	type FragmentPresentationHost
} from './fragment-hosts.js';
export { readPreparedTargetOutput, readSuppliedTargetValue } from './prepared-target-output.js';
export { assertEnhancementSourceOrder } from './enhancement-order.js';

export { createFragmentTargetProjection } from './fragment-target-projection.js';
export { createFragmentEnhancementChain } from './fragment-enhancement-chain.js';

export { isTextTargetOutput, prepareTextTargetOutput } from './text-target-output.js';

export { projectedAttributes } from '../component-abi/text-projection-markup.js';

export {
	fallbackEnhancementEntries,
	claimEnhancementFallback,
	enhancementFallbackAvailable,
	forwardEnhancementFallback,
	checkpointEnhancementFallback
} from './enhancement-fallback.js';

export { assertSingleSuppliedPlacement } from './supplied-placement.js';
