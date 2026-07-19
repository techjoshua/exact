import { resolveDispatcher } from './internals.js';

/** Runtime cache hook emitted by the React Compiler. */
export function c(size: number): unknown[] {
	if (!Number.isInteger(size) || size < 0)
		throw new TypeError('React compiler memo cache size must be a non-negative integer');
	return resolveDispatcher().useMemoCache(size);
}
