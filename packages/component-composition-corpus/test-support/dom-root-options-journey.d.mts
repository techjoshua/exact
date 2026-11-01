import type { createExactRuntimeInspectionOwner } from '../../core/src/index.js';
import type { createCompiledComponentOperation } from '../../dom/src/test-support/native-operations.js';
import type { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import type { renderCompiledIntrinsicRoot } from '../../dom/src/framework/intrinsic-root.js';
import type { render, unmount, setExactDomInspectionOwnerFactory } from '../../dom/src/index.js';
/** Checks inherited work limits, profiling, retained updates and cleanup through both root paths. */
export function verifyDomRootOptions(api: {
	Panel: Parameters<typeof createCompiledComponentOperation>[0];
	operation: typeof createCompiledComponentOperation;
	intrinsic: typeof createCompiledIntrinsicReceipt;
	renderIntrinsic: typeof renderCompiledIntrinsicRoot;
	render: typeof render;
	unmount: typeof unmount;
	createExactRuntimeInspectionOwner: typeof createExactRuntimeInspectionOwner;
	setExactDomInspectionOwnerFactory: typeof setExactDomInspectionOwnerFactory;
}): true;
