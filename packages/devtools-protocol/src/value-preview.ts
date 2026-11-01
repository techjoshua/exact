/** One key/value pair in a bounded object preview. */
export type ExactPreviewEntry = Readonly<{
	key: string;
	value: ExactValuePreview;
}>;

/** Safe bounded representation that never exposes a raw runtime value. Constants preserve undefined and non-finite numbers without confusing them with strings or inspection failures. */
export type ExactValuePreview =
	| Readonly<{ kind: 'scalar'; value: string | number | boolean | null }>
	| Readonly<{ kind: 'constant'; value: 'undefined' | 'NaN' | 'Infinity' | '-Infinity' | '-0' }>
	| Readonly<{
			kind: 'object';
			type: string;
			entries: readonly ExactPreviewEntry[];
			truncated: boolean;
	  }>
	| Readonly<{ kind: 'function'; name?: string }>
	| Readonly<{ kind: 'dom'; tag: string; id?: string; classes: readonly string[] }>
	| Readonly<{ kind: 'redacted'; reason: 'secret' | 'server-resource' | 'policy' }>
	| Readonly<{ kind: 'unavailable'; reason: string }>;

/** Limits recursive preview construction and output retention. */
export type ExactValuePreviewLimits = Readonly<{
	maxDepth?: number;
	maxEntries?: number;
	maxStringLength?: number;
	maxBytes?: number;
}>;

/** Decides whether a path must be redacted before its value is traversed. */
export type ExactValueRedactor = (
	path: readonly string[],
	value: unknown
) => 'secret' | 'server-resource' | 'policy' | undefined;

/** Configuration for side-effect-free value preview construction. */
export type ExactValuePreviewOptions = Readonly<{
	limits?: ExactValuePreviewLimits;
	redact?: ExactValueRedactor;
	path?: readonly string[];
}>;

type PreviewState = {
	readonly limits: Required<ExactValuePreviewLimits>;
	readonly redact?: ExactValueRedactor;
	readonly seen: WeakSet<object>;
	entries: number;
	bytes: number;
};

const defaults: Required<ExactValuePreviewLimits> = Object.freeze({
	maxDepth: 4,
	maxEntries: 50,
	maxStringLength: 500,
	maxBytes: 16 * 1024
});

/**
 * Builds independent ordinary preview data without invoking getters, toJSON, or custom inspectors.
 *
 * Redaction runs before traversal. Property descriptor failures stop enumeration and return an
 * unavailable marker rather than retrying through a potentially hostile Proxy.
 */
export function previewExactValue(
	value: unknown,
	options: ExactValuePreviewOptions = {}
): ExactValuePreview {
	const state: PreviewState = {
		limits: normalizeLimits(options.limits),
		redact: options.redact,
		seen: new WeakSet(),
		entries: 0,
		bytes: 0
	};
	return preview(value, [...(options.path ?? [])], 0, state);
}

/** Returns an ordinary redaction observation without inspecting the protected value. */
export function redactExactValue(
	reason: 'secret' | 'server-resource' | 'policy'
): ExactValuePreview {
	return reason === 'secret' || reason === 'server-resource' || reason === 'policy'
		? { kind: 'redacted', reason }
		: { kind: 'unavailable', reason: 'redaction-failed' };
}

function preview(
	value: unknown,
	path: string[],
	depth: number,
	state: PreviewState
): ExactValuePreview {
	let redaction: ReturnType<ExactValueRedactor>;
	try {
		if (state.redact !== undefined) redaction = state.redact([...path], value);
	} catch {
		return { kind: 'unavailable', reason: 'redaction-failed' };
	}
	if (redaction !== undefined) return redactExactValue(redaction);
	if (typeof value === 'number' && Object.is(value, -0)) return { kind: 'constant', value: '-0' };
	if (typeof value === 'number' && !Number.isFinite(value))
		return {
			kind: 'constant',
			value: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity'
		};
	if (value === null || typeof value === 'boolean' || typeof value === 'number')
		return { kind: 'scalar', value };
	if (typeof value === 'string') return scalarString(value, state);
	if (typeof value === 'bigint') return scalarString(`${value}n`, state);
	if (typeof value === 'symbol') return scalarString(String(value), state);
	if (typeof value === 'undefined') return { kind: 'constant', value: 'undefined' };
	if (typeof value === 'function') return previewFunction(value);
	if (typeof value !== 'object') return { kind: 'unavailable', reason: typeof value };
	try {
		if (domNode(value)) return previewDom(value);
		if (depth >= state.limits.maxDepth) return objectPreview(typeName(value), [], true);
		if (state.seen.has(value)) return { kind: 'unavailable', reason: 'cycle' };
		state.seen.add(value);
		if (value instanceof Map) return previewMap(value, path, depth, state);
		if (value instanceof Set) return previewSet(value, path, depth, state);
		if (Array.isArray(value)) return previewArray(value, path, depth, state);
		if (value instanceof Error) return previewError(value, path, depth, state);
		return previewObject(value, path, depth, state);
	} catch {
		return { kind: 'unavailable', reason: 'inspection-failed' };
	}
}

function previewError(
	value: Error,
	path: string[],
	depth: number,
	state: PreviewState
): ExactValuePreview {
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const entries: ExactPreviewEntry[] = [];
	let truncated = false;
	for (const key of ['name', 'message', 'cause'] as const) {
		const descriptor = descriptors[key];
		if (!descriptor || !('value' in descriptor)) continue;
		if (!reserve(key, state)) {
			truncated = true;
			break;
		}
		entries.push({ key, value: preview(descriptor.value, [...path, key], depth + 1, state) });
	}
	return objectPreview(typeName(value), entries, truncated);
}

function previewFunction(value: CallableFunction): ExactValuePreview {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, 'name');
		const name =
			descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
				? descriptor.value.slice(0, 128)
				: undefined;
		return { kind: 'function', ...(name ? { name } : {}) };
	} catch {
		return { kind: 'unavailable', reason: 'inspection-failed' };
	}
}

function previewObject(
	value: object,
	path: string[],
	depth: number,
	state: PreviewState
): ExactValuePreview {
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const entries: ExactPreviewEntry[] = [];
	let truncated = false;
	for (const key of Object.keys(descriptors)) {
		const descriptor = descriptors[key]!;
		if (!('value' in descriptor)) continue;
		if (!reserve(key, state)) {
			truncated = true;
			break;
		}
		entries.push({ key, value: preview(descriptor.value, [...path, key], depth + 1, state) });
	}
	return objectPreview(typeName(value), entries, truncated);
}

function previewArray(
	value: readonly unknown[],
	path: string[],
	depth: number,
	state: PreviewState
): ExactValuePreview {
	const entries: ExactPreviewEntry[] = [];
	for (let index = 0; index < value.length; index++) {
		const key = String(index);
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !('value' in descriptor) || !reserve(key, state))
			return objectPreview('Array', entries, true);
		entries.push({ key, value: preview(descriptor.value, [...path, key], depth + 1, state) });
	}
	return objectPreview('Array', entries, false);
}

function previewMap(
	value: Map<unknown, unknown>,
	path: string[],
	depth: number,
	state: PreviewState
): ExactValuePreview {
	const entries: ExactPreviewEntry[] = [];
	let index = 0;
	// Use the native iterator so inspection never invokes an application override.
	for (const [key, item] of Map.prototype.entries.call(value)) {
		const label = `entry:${index++}`;
		if (!reserve(label, state)) return objectPreview('Map', entries, true);
		entries.push({
			key: label,
			value: objectPreview(
				'Entry',
				[
					{
						key: 'key',
						value: preview(key, [...path, label, 'key'], depth + 1, state)
					},
					{
						key: 'value',
						value: preview(item, [...path, label, 'value'], depth + 1, state)
					}
				],
				false
			)
		});
	}
	return objectPreview('Map', entries, false);
}

function previewSet(
	value: Set<unknown>,
	path: string[],
	depth: number,
	state: PreviewState
): ExactValuePreview {
	const entries: ExactPreviewEntry[] = [];
	let index = 0;
	// Use the native iterator so inspection never invokes an application override.
	for (const item of Set.prototype.values.call(value)) {
		const key = String(index++);
		if (!reserve(key, state)) return objectPreview('Set', entries, true);
		entries.push({ key, value: preview(item, [...path, key], depth + 1, state) });
	}
	return objectPreview('Set', entries, false);
}

function scalarString(value: string, state: PreviewState): ExactValuePreview {
	const truncated = value.length > state.limits.maxStringLength;
	const characterBounded = truncated ? value.slice(0, state.limits.maxStringLength) : value;
	const remaining = Math.max(0, state.limits.maxBytes - state.bytes);
	const output = boundedStringPreview(characterBounded, truncated, remaining);
	state.bytes += new TextEncoder().encode(output).byteLength;
	return { kind: 'scalar', value: output };
}

function boundedStringPreview(value: string, alreadyTruncated: boolean, maxBytes: number): string {
	const encoder = new TextEncoder();
	if (!alreadyTruncated && encoder.encode(value).byteLength <= maxBytes) return value;
	const suffix = maxBytes >= 3 ? '…' : '';
	const contentBudget = Math.max(0, maxBytes - encoder.encode(suffix).byteLength);
	let low = 0;
	let high = value.length;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		const candidate = safeUtf16Prefix(value, middle);
		if (encoder.encode(candidate).byteLength <= contentBudget) low = middle;
		else high = middle - 1;
	}
	return `${safeUtf16Prefix(value, low)}${suffix}`;
}

function safeUtf16Prefix(value: string, length: number): string {
	let end = Math.min(length, value.length);
	if (end > 0 && end < value.length) {
		const code = value.charCodeAt(end - 1);
		if (code >= 0xd800 && code <= 0xdbff) end--;
	}
	return value.slice(0, end);
}

/** Reserves a protocol-safe key within the shared UTF-8 budget before inspecting its value. */
function reserve(key: string, state: PreviewState): boolean {
	if (
		key.length > 512 ||
		state.entries >= state.limits.maxEntries ||
		state.bytes >= state.limits.maxBytes
	)
		return false;
	const bytes = new TextEncoder().encode(key).byteLength;
	if (bytes > state.limits.maxBytes - state.bytes) return false;
	state.entries++;
	state.bytes += bytes;
	return true;
}

function objectPreview(
	type: string,
	entries: readonly ExactPreviewEntry[],
	truncated: boolean
): ExactValuePreview {
	return { kind: 'object', type, entries: entries, truncated };
}

/** Reads a diagnostic type label through data descriptors without executing application accessors. */
function typeName(value: object): string {
	let prototype: object | null = Object.getPrototypeOf(value);
	for (let depth = 0; prototype && depth < 20; depth++) {
		const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
		if (descriptor) {
			if (!('value' in descriptor) || typeof descriptor.value !== 'function') return 'Object';
			const name = Object.getOwnPropertyDescriptor(descriptor.value, 'name');
			return name && 'value' in name && typeof name.value === 'string' && name.value
				? name.value.slice(0, 256)
				: 'Object';
		}
		prototype = Object.getPrototypeOf(prototype);
	}
	return 'Object';
}

function domNode(value: object): value is {
	nodeType: number;
	nodeName: string;
	id?: string;
	classList?: Iterable<string>;
} {
	const descriptor = Object.getOwnPropertyDescriptor(value, 'nodeType');
	const prototype = Object.getPrototypeOf(value);
	const inherited = prototype ? Object.getOwnPropertyDescriptor(prototype, 'nodeType') : undefined;
	return descriptor?.value === 1 || inherited?.get !== undefined;
}

function previewDom(value: {
	nodeName: string;
	id?: string;
	classList?: Iterable<string>;
}): ExactValuePreview {
	try {
		const nodeName = ownDataProperty(value, 'nodeName');
		const id = ownDataProperty(value, 'id');
		const className = ownDataProperty(value, 'className');
		const classes =
			typeof className === 'string' ? className.split(/\s+/).filter(Boolean).slice(0, 10) : [];
		return {
			kind: 'dom',
			tag: typeof nodeName === 'string' ? nodeName.toLowerCase().slice(0, 64) : 'element',
			...(typeof id === 'string' && id ? { id: id.slice(0, 128) } : {}),
			classes: classes.map((value) => String(value).slice(0, 128))
		};
	} catch {
		return { kind: 'unavailable', reason: 'inspection-failed' };
	}
}

function ownDataProperty(value: object, key: PropertyKey): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function normalizeLimits(
	limits: ExactValuePreviewLimits | undefined
): Required<ExactValuePreviewLimits> {
	return {
		maxDepth: positive(limits?.maxDepth, defaults.maxDepth, 20),
		maxEntries: positive(limits?.maxEntries, defaults.maxEntries, 10_000),
		maxStringLength: positive(limits?.maxStringLength, defaults.maxStringLength, 100_000),
		maxBytes: positive(limits?.maxBytes, defaults.maxBytes, 4 * 1024 * 1024)
	};
}

function positive(value: number | undefined, fallback: number, ceiling: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
		? Math.min(value, ceiling)
		: fallback;
}
