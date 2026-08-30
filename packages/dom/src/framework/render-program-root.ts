import type { Child } from '@exactjs/core';
import { readRenderProgramReceipt } from '@exactjs/core/runtime/render-operations';
import type { RenderOptions } from '../types.js';
import { renderFocusedOperationRoot } from './focused-root.js';

export type { RenderOptions } from '../types.js';

/** Mounts or updates a compiler-issued render-program root through its focused operation ABI. */
export function renderCompiledProgramRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): void {
	const receipt = readRenderProgramReceipt(operation);
	if (!receipt)
		throw new TypeError(
			'Compiled program root requires a compiler-issued render-program operation'
		);
	renderFocusedOperationRoot(operation, receipt.domain, container, options);
}
