import { unwrap } from '@exactjs/reactive';
import type { ReactRef } from '../types.js';

/** Unwraps a reactive ref before passing it to React-owned class or function components. */
export function readReactRef(value: unknown): unknown {
	return unwrap(value);
}

/** Assigns a ref immediately. A non-null assignment returns an idempotent, assignment-owned release that honors callback cleanup. */
export function assignReactRef<T>(
	ref: ReactRef<T> | undefined,
	value: T | null
): (() => void) | undefined {
	if (!ref) return;
	const rawRef = unwrap(ref) as ReactRef<T>;
	let cleanup: void | (() => void) = undefined;
	if (typeof rawRef === 'function') cleanup = rawRef(value);
	else if (rawRef) rawRef.current = value;
	if (value === null) return;
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		if (typeof cleanup === 'function') cleanup();
		else if (typeof rawRef === 'function') rawRef(null);
		else if (rawRef) rawRef.current = null;
	};
}
