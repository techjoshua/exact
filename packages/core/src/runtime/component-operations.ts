export {
	attachExactCompiledClientComponent,
	disposeExactClientComponent,
	receiveExactClientComponentProps,
	receiveExactDynamicClientComponentProps
} from '../component-abi/compiled-runtime.js';
export {
	disposeExactServerComponent,
	issueExactServerComponent,
	writeExactServerComponent
} from '../component-abi/server-runtime.js';
export {
	exactCompiledClientAttachment,
	exactCompatibilityClientAttachment,
	type ExactClientAttachMode,
	type ExactClientComponentArtifact,
	type ExactCompiledClientAttachmentTarget,
	type ExactCompatibilityClientAttachmentTarget,
	type ExactClientMountedRange,
	type ExactClientPropSource
} from '../component-abi/client.js';
export * from '../component-abi/receipt.js';
export * from '../component-abi/child-range-receipt.js';
export * from '../component-abi/intrinsic-receipt.js';
export * from '../component-abi/suspense-receipt.js';
export * from '../component-abi/activity-receipt.js';
export * from '../component-abi/fragment-receipt.js';
export * from '../component-abi/target-receipt.js';
export * from '../component-abi/keyed-child-receipt.js';
export * from '../component-abi/unsafe-html-receipt.js';
export * from '../component-abi/portal-receipt.js';
export * from '../component-abi/server-structure-receipts.js';
export {
	createOpaqueOperation,
	executeOpaqueOperation,
	isOpaqueOperation,
	opaqueOperationDomain,
	opaqueOperationKey
} from '../component-abi/opaque-operation.js';
