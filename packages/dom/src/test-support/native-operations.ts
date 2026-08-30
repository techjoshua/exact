import type { Child } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyExactComponentCallable } from '@exactjs/core/framework/component-contracts';

export {
	createCompiledTestOperation as createCompiledOperation,
	createTestComponentReceipt,
	createTestJsx as jsx,
	createTestJsxs as jsxs,
	createTestOperation as createOperation
} from '@exactjs/testing/internal/fixtures';

/** Issues the component operation emitted by exactc for an already-compiled fixture. */
export function createCompiledComponentOperation(
	type: AnyExactComponentCallable,
	props: Record<string, unknown> | null,
	...children: unknown[]
): Child {
	return createCompiledComponentReceipt(type, props, ...children);
}
