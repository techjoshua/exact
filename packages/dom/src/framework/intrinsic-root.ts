import type { Child } from '@exactjs/core';
import { readCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import type { RenderOptions } from '../types.js';
import { renderFocusedOperationRoot } from './focused-root.js';

export type { RenderOptions } from '../types.js';

/** Mounts or updates a compiler-issued intrinsic root through its focused operation ABI. */
export function renderCompiledIntrinsicRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): void {
	const receipt = readCompiledIntrinsicReceipt(operation);
	if (!receipt)
		throw new TypeError('Compiled intrinsic root requires a compiler-issued intrinsic operation');
	renderFocusedOperationRoot(operation, receipt.domain, container, options);
}
