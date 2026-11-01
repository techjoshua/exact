const reservedObjectKeys = new Set(['__proto__', 'prototype', 'constructor']);

export { protocolUtf8ByteLength } from '../protocol-utf8.js';
export { jsonDataKeys, jsonDataProperty, isNativeJsonCollection } from './json-data.js';

/** Returns whether a key can be materialized in an eXact protocol dictionary. */
export function isSafeProtocolKey(key: string): boolean {
	return !reservedObjectKeys.has(key);
}

/** Creates a prototype-free dictionary for decoded or generated protocol records. */
export function createProtocolRecord<T>(): Record<string, T> {
	return Object.create(null) as Record<string, T>;
}

/** Normalizes a positive safe-integer protocol resource limit. */
export function normalizeProtocolLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * Validates every own key in a recursively decoded JSON-like protocol value.
 * Cycles are tolerated for defensive use outside JSON decoding.
 */
export function hasOnlySafeProtocolKeys(value: unknown): boolean {
	if (!value || typeof value !== 'object') return true;
	const pending: object[] = [value];
	const seen = new WeakSet<object>();
	while (pending.length) {
		const current = pending.pop()!;
		if (seen.has(current)) continue;
		seen.add(current);
		for (const key of Object.keys(current)) {
			if (!isSafeProtocolKey(key)) return false;
			const child = (current as Record<string, unknown>)[key];
			if (child && typeof child === 'object') pending.push(child);
		}
	}
	return true;
}

/** Validates the exact finite discriminator shape used by server slots and hydration. */
export function isServerSlotDiscriminator(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const discriminator = value as Record<string, unknown>;
	if (discriminator.kind === 'single') return Object.keys(discriminator).length === 1;
	if (discriminator.kind === 'branch')
		return (
			Object.keys(discriminator).length === 2 &&
			typeof discriminator.branch === 'string' &&
			!!discriminator.branch
		);
	return (
		discriminator.kind === 'keyed' &&
		Object.keys(discriminator).length === 3 &&
		typeof discriminator.list === 'string' &&
		!!discriminator.list &&
		typeof discriminator.keyToken === 'string' &&
		!!discriminator.keyToken
	);
}

/**
 * Validates a partial response tree without reading authorized subtrees.
 * Indexes exact selections and their ancestors once, then visits each checked key once.
 * Selection authority comes from array entries, never authored array methods.
 */
export function stateNodeMatchesWrites(
	value: object,
	path: string,
	writes: readonly string[]
): boolean {
	const authority = new Map<string, boolean>();
	for (let index = 0; index < writes.length; index++) {
		const selected = writes[index]!;
		authority.set(selected, true);
		for (
			let separator = selected.indexOf('.');
			separator >= 0;
			separator = selected.indexOf('.', separator + 1)
		) {
			const ancestor = selected.slice(0, separator);
			if (!authority.has(ancestor)) authority.set(ancestor, false);
		}
	}
	return matches(value, path);

	/** Keeps depth-first reads behind their selected ancestor's authority. */
	function matches(node: object, parent: string): boolean {
		for (const key of Object.keys(node)) {
			if (!isSafeProtocolKey(key)) return false;
			if (Array.isArray(node) && !/^(0|[1-9]\d*)$/.test(key)) return false;
			const childPath = parent ? `${parent}.${key}` : key;
			const exact = authority.get(childPath);
			if (exact === true) continue;
			if (exact === undefined) return false;
			const child = (node as Record<string, unknown>)[key];
			if (!child || typeof child !== 'object' || !matches(child, childPath)) return false;
		}
		return true;
	}
}

/** Compiler-owned permission used to authorize transported state selections. */
type StateWriteAuthority = {
	readonly path: string;
	readonly kind: string;
	readonly confidence: string;
	readonly operation?: string;
};

/** Authorizes performed deletions against exact value-write authority. */
export function stateDeletionPathsMatchWrites(
	deletions: readonly string[],
	writes: readonly StateWriteAuthority[]
): boolean {
	return isStateDeletionList(deletions) && statePathsMatchWrites(deletions, writes);
}

/** Authorizes performed output selections, including an explicitly permitted whole-state snapshot. */
export function stateOutputPathsMatchWrites(
	paths: readonly string[],
	writes: readonly StateWriteAuthority[]
): boolean {
	return isStateOutputPathList(paths) && statePathsMatchWrites(paths, writes);
}

/** Indexes compiler authority as needed, retaining early matches without rescanning writes. */
function statePathsMatchWrites(
	paths: readonly string[],
	writes: readonly StateWriteAuthority[]
): boolean {
	if (!paths.length) return true;
	const authority = new Set<string>();
	let cursor = 0;
	for (let index = 0; index < paths.length; index++) {
		const path = paths[index]!;
		while (!permits(path)) {
			if (cursor === writes.length) return false;
			const write = writes[cursor++]!;
			if (
				write.kind === 'write' &&
				write.confidence === 'exact' &&
				write.operation !== 'map' &&
				write.operation !== 'set'
			)
				authority.add(write.path);
		}
	}
	return true;

	/** Parent value writes authorize descendants, while collection deltas remain separate. */
	function permits(path: string): boolean {
		if (authority.has('*')) return true;
		while (!authority.has(path)) {
			const separator = path.lastIndexOf('.');
			if (separator < 0) return false;
			path = path.slice(0, separator);
		}
		return true;
	}
}

/** Validates dense owned deletion paths without invoking array-slot accessors. */
export function isStateDeletionList(value: unknown): value is string[] {
	return isStatePathList(value, false);
}

/** Validates dense owned state selections without invoking array-slot accessors. */
export function isStateOutputPathList(value: unknown): value is string[] {
	return isStatePathList(value, true);
}

/** Rejects holes, accessors, unsafe segments, and whole-state deletion before consuming a path list. */
function isStatePathList(value: unknown, allowWholeState: boolean): value is string[] {
	if (!Array.isArray(value)) return false;
	for (let index = 0; index < value.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor || !('value' in descriptor)) return false;
		const path: unknown = descriptor.value;
		if (
			typeof path !== 'string' ||
			!path ||
			(!allowWholeState && path === '*') ||
			!path.split('.').every((key) => !!key && isSafeProtocolKey(key))
		)
			return false;
	}
	return true;
}

/** Coalesces exact value reads so a complete enclosing snapshot retains property presence and is captured once. */
export function minimalStateReadPaths(
	reads: readonly { readonly path: string; readonly kind: string; readonly confidence: string }[]
): string[] {
	const paths = new Set(
		reads
			.filter((read) => read.kind === 'read' && read.confidence === 'exact')
			.map((read) => read.path)
	);
	if (paths.has('*')) return ['*'];
	return [...paths].filter((path) => {
		for (
			let separator = path.indexOf('.');
			separator >= 0;
			separator = path.indexOf('.', separator + 1)
		)
			if (paths.has(path.slice(0, separator))) return false;
		return true;
	});
}

export {
	createResponseResourceBudget,
	ResponseResourceLimitError,
	type ResponseResourceBudget,
	type ResponseResourceDetails
} from './response-resources.js';
