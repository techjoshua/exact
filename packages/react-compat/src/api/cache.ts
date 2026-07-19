import {
	activeReactCacheScope,
	currentReactOwnerFrame,
	ReactSharedInternals19
} from '../internals.js';

const cacheResultKey = Symbol('react.cache.result');
type CacheEntry<T> = { status: 'fulfilled' | 'rejected'; value: T | unknown };

export function cache<Args extends readonly unknown[], Result>(
	fn: (...args: Args) => Result
): (...args: Args) => Result {
	const identity = {};
	const fallbackRoot = new Map<unknown, unknown>();
	const createExternalRoot = () => new Map<unknown, unknown>();
	return (...args: Args): Result => {
		const externalRoot = ReactSharedInternals19.A?.getCacheForType?.(createExternalRoot);
		const scope = externalRoot ? undefined : activeReactCacheScope();
		let root = externalRoot ?? scope?.roots.get(identity);
		if (!root) {
			root = scope ? new Map<unknown, unknown>() : fallbackRoot;
			scope?.roots.set(identity, root);
		}
		let node = root;
		for (const argument of args) {
			let next = node.get(argument);
			if (!(next instanceof Map)) {
				next = new Map<unknown, unknown>();
				node.set(argument, next);
			}
			node = next as Map<unknown, unknown>;
		}
		const entry = node.get(cacheResultKey) as CacheEntry<Result> | undefined;
		if (entry) {
			if (entry.status === 'rejected') throw entry.value;
			return entry.value as Result;
		}
		try {
			const value = fn(...args);
			node.set(cacheResultKey, { status: 'fulfilled', value } satisfies CacheEntry<Result>);
			return value;
		} catch (error) {
			node.set(cacheResultKey, { status: 'rejected', value: error } satisfies CacheEntry<Result>);
			throw error;
		}
	};
}
const compatibilityCacheController = new AbortController();
/** Returns the abort signal associated with the active React cache scope. */
export function cacheSignal(): AbortSignal {
	return (
		ReactSharedInternals19.A?.cacheSignal?.() ??
		activeReactCacheScope()?.controller.signal ??
		compatibilityCacheController.signal
	);
}
/** Formats the current compatibility owner chain as a React-style component stack. */
export function captureOwnerStack(): string | null {
	let frame = currentReactOwnerFrame() as { type?: unknown; return?: unknown } | null;
	if (!frame) return null;
	const lines: string[] = [];
	while (frame) {
		const type = frame.type as { displayName?: string; name?: string } | string | symbol;
		const name =
			typeof type === 'string'
				? type
				: typeof type === 'symbol'
					? (type.description ?? 'Anonymous')
					: (type?.displayName ?? type?.name ?? 'Anonymous');
		lines.push(`\n    at ${name}`);
		frame = frame.return as typeof frame;
	}
	return lines.join('');
}
