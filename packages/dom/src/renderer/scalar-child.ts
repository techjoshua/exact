import type { Child } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';

/** Normalizes only scalar text values; object representations remain opaque to this target. */
export function scalarText(value: Child): string | undefined {
	const resolved = unwrap(value);
	return typeof resolved === 'string' || typeof resolved === 'number'
		? String(resolved)
		: undefined;
}
