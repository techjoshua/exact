import { ResponseResourceLimitError } from '@exactjs/core/framework/protocol-records';
import {
	jsonDataKeys,
	jsonDataProperty,
	isNativeJsonCollection
} from '@exactjs/core/framework/protocol-records';
/** Returns whether an object contains only the explicitly allowed own enumerable keys. */
export function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
	return Object.keys(record).every((key) => allowed.includes(key));
}

/**
 * Checks JSON publication safety without invoking authored getters or serialization hooks.
 * Shared siblings are checked once per serialized occurrence. Active ancestor cycles and
 * unsupported prototypes are rejected, and each occurrence consumes the configured budgets.
 * Set decodedConstants only after protocol decoding to admit restored special primitive values.
 */
export function isJsonSafe(
	value: unknown,
	limits: {
		maxDepth?: number;
		maxNodes?: number;
		maxBytes?: number;
		onResource?: (kind: 'depth' | 'nodes' | 'bytes', actual: number) => void;
	} = {},
	decodedConstants = false
): boolean {
	const maxDepth = limits.onResource
		? Number.MAX_SAFE_INTEGER
		: positiveLimit(limits.maxDepth, 100);
	const maxNodes = limits.onResource
		? Number.MAX_SAFE_INTEGER
		: positiveLimit(limits.maxNodes, 100_000);
	const maxBytes = limits.onResource
		? Number.MAX_SAFE_INTEGER
		: positiveLimit(limits.maxBytes, 16 * 1024 * 1024);
	try {
		const active = new Set<object>();
		const ancestors: object[] = [];
		const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
		let nodes = 0;
		let bytes = 0;
		while (pending.length) {
			const current = pending.pop()!;
			// Depth-first work retires the previous sibling's ancestry before checking this value.
			while (ancestors.length > current.depth) active.delete(ancestors.pop()!);
			const { value: item, depth } = current;
			nodes++;
			limits.onResource?.('nodes', nodes);
			limits.onResource?.('depth', depth);
			if (nodes > maxNodes || depth > maxDepth) return false;
			if (item === undefined) {
				if (!decodedConstants) return false;
				continue;
			}
			if (item === null || typeof item === 'boolean') continue;
			if (typeof item === 'number') {
				if (!decodedConstants && !Number.isFinite(item)) return false;
				continue;
			}
			if (typeof item === 'string') {
				bytes += utf8ByteLength(item);
				limits.onResource?.('bytes', bytes);
				if (bytes > maxBytes) return false;
				continue;
			}
			if (typeof item !== 'object' || active.has(item)) return false;
			active.add(item);
			ancestors.push(item);
			if (item instanceof Map) {
				if (!isNativeJsonCollection(item)) return false;
				for (const [key, entryValue] of item) {
					if (!isTransportableReactiveMapKey(key)) return false;
					limits.onResource?.('nodes', nodes + pending.length + 1);
					if (nodes + pending.length + 1 > maxNodes) return false;
					if (typeof key === 'string') bytes += utf8ByteLength(key);
					limits.onResource?.('bytes', bytes);
					if (bytes > maxBytes) return false;
					pending.push({ value: entryValue, depth: depth + 1 });
				}
				continue;
			}
			if (item instanceof Set) {
				if (!isNativeJsonCollection(item)) return false;
				for (const entryValue of item) {
					limits.onResource?.('nodes', nodes + pending.length + 1);
					if (nodes + pending.length + 1 > maxNodes) return false;
					pending.push({ value: entryValue, depth: depth + 1 });
				}
				continue;
			}
			if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) return false;
			if (Array.isArray(item)) limits.onResource?.('nodes', nodes + pending.length + item.length);
			const keys = jsonDataKeys(item, maxNodes - nodes - pending.length);
			if (!keys) return false;
			limits.onResource?.('nodes', nodes + pending.length + keys.length);
			if (nodes + pending.length + keys.length > maxNodes) return false;
			for (const key of keys) {
				const descriptor = jsonDataProperty(item, key);
				if (!descriptor || !('value' in descriptor)) return false;
				bytes += utf8ByteLength(key);
				limits.onResource?.('bytes', bytes);
				if (bytes > maxBytes) return false;
				pending.push({ value: descriptor.value, depth: depth + 1 });
			}
		}
		return true;
	} catch (error) {
		if (error instanceof ResponseResourceLimitError) throw error;
		return false;
	}
}

import { isTransportableReactiveMapKey } from '@exactjs/core';
import { positiveLimit, utf8ByteLength } from './limits.js';

/** Checks decoded protocol values, including restored constants, against the same graph budgets. */
export function isDecodedProtocolSafe(
	value: unknown,
	limits: {
		maxDepth?: number;
		maxNodes?: number;
		maxBytes?: number;
		onResource?: (kind: 'depth' | 'nodes' | 'bytes', actual: number) => void;
	} = {}
): boolean {
	return isJsonSafe(value, limits, true);
}
