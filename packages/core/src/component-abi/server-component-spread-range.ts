import type { RenderResult } from '../component/contracts.js';
import { createDeferredServerChildRange } from './server-child-range.js';

/** Copies server component props once after its provider prepares the owning environment. */
export function createCompiledComponentSpreadRange(compute: () => RenderResult, markerId?: string) {
	let resolved = false;
	let value: RenderResult;
	return createDeferredServerChildRange(() => {
		if (!resolved) {
			value = compute();
			resolved = true;
		}
		return value;
	}, markerId);
}
