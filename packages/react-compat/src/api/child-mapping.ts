import {
	iterateReactChildEntries,
	reactChildEntryKey,
	type ReactChildEntry
} from '../runtime/child-arrays.js';
import { isReactElement, REACT_PORTAL_TYPE } from '../runtime/shared.js';
import type { ReactNode } from '../types.js';

/** Applies React's empty-slot convention while rejecting values that are neither text nor opaque elements or portals. */
function childValue(value: ReactNode): ReactNode {
	if (value === undefined || typeof value === 'boolean') return null;
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		isReactElement(value)
	)
		return value;
	if (typeof value === 'object' && '$$typeof' in value && value.$$typeof === REACT_PORTAL_TYPE)
		return value;
	throw new TypeError('Objects are not valid as a React child');
}

/** Computes the source slot identity before applying a callback's replacement key. */
function entryKey(entry: ReactChildEntry, node: ReactNode): string {
	return reactChildEntryKey(
		entry,
		isReactElement(node)
			? node.key
			: typeof node === 'object' && node !== null && 'key' in node
				? (node.key as string | null)
				: undefined
	);
}

function escapeMappedKey(key: string): string {
	return key.replace(/\/+/g, '$&/');
}

/** Maps input slots in order, flattens returned arrays and preserves source, replacement and array key scopes. */
export function mapReactChildren(
	children: ReactNode,
	callback: (child: ReactNode, index: number) => unknown,
	context?: unknown
): unknown[] | null {
	if (children === null || children === undefined) return null;
	const output: unknown[] = [];
	let index = 0;
	for (const entry of iterateReactChildEntries(children)) {
		const child = childValue(entry.node);
		const key = entryKey(entry, child);
		const mapped = Reflect.apply(callback, context, [child, index++]);
		if (Array.isArray(mapped)) {
			const prefix = escapeMappedKey(key) + '/';
			for (const result of iterateReactChildEntries(mapped)) {
				const value = childValue(result.node);
				if (value === null) continue;
				output.push(
					isReactElement(value) ? { ...value, key: prefix + entryKey(result, value) } : value
				);
			}
		} else if (mapped !== null && mapped !== undefined) {
			const replacement = isReactElement(mapped) ? mapped.key : undefined;
			const original = isReactElement(child) ? child.key : undefined;
			output.push(
				isReactElement(mapped)
					? {
							...mapped,
							key:
								(replacement && replacement !== original
									? escapeMappedKey(String(replacement)) + '/'
									: '') + key
						}
					: mapped
			);
		}
	}
	return output;
}

/** Visits supplied slots, optionally invoking a callback, and returns their count. The absent root has no slots. */
export function visitReactChildren(
	children: ReactNode,
	callback?: (child: ReactNode, index: number) => void,
	context?: unknown
): number {
	if (children === null || children === undefined) return 0;
	// Count-only traversal omits the callback. Explicit invalid callbacks still fail when visited.
	const visit = arguments.length > 1;
	let index = 0;
	for (const node of iterateReactChildEntries(children, true)) {
		const value = childValue(node);
		if (visit) Reflect.apply(callback!, context, [value, index]);
		index++;
	}
	return index;
}
