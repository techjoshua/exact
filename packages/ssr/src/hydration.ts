import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';
import type { ExactOutputExtension } from '@exactjs/plugin-api';
import { processExactOutputSync } from '@exactjs/plugin-host/runtime';
import { encodeReactiveProtocolValue } from '@exactjs/reactive/framework/protocol';
import { escapeAttr } from './html.js';
import { encodeHydrationProtocolValue } from './hydration-encoding-capability.js';
import type { HydrationScriptOptions } from './types.js';
import type { SsrResumptionLayout } from './resumption.js';

/** Renders the JSON script tag consumed by the hydration client. */
export function renderHydrationScript(
	options: HydrationScriptOptions = {},
	resumptionLayouts?: ReadonlyMap<string, SsrResumptionLayout>
): string {
	if (
		options.buildKey &&
		options.componentAuthorization &&
		options.componentAuthorization.buildKey !== options.buildKey
	)
		throw new Error('Component authorization identity does not match the hydration build key');
	const payloadValue = processExactOutputSync<Record<string, unknown>>(
		omitUndefinedProperties({
			pluginRegistryFingerprint: options.pluginRegistryFingerprint,
			endpoint: options.endpoint,
			endpoints: options.endpoints,
			state: options.state,
			continuations: options.continuations,
			resumptions: options.resumptions,
			publicContexts: options.publicContexts,
			wallClockSnapshot: options.wallClockSnapshot,
			h: options.hydrationTable,
			executionRoot: options.executionRoot,
			binding: options.binding,
			buildKey: options.buildKey,
			componentAuthorization: options.componentAuthorization
		}),
		{ kind: 'hydration' },
		(options.outputExtensions ?? []) as readonly ExactOutputExtension<Record<string, unknown>>[]
	);
	const unsafePath = findJsonUnsafePath(payloadValue, '$', new Set(), true, {
		maxDepth: options.maxHydrationDepth,
		maxNodes: options.maxHydrationNodes
	});
	if (unsafePath) throw new Error(`Hydration payload must be JSON-serializable at ${unsafePath}`);
	const payload = serializeEncodedHydrationPayload(
		encodeReactiveProtocolValue(compactHydrationMetadata(payloadValue, resumptionLayouts))
	);
	if (
		new TextEncoder().encode(payload).byteLength >
		positiveLimit(options.maxHydrationBytes, 16 * 1024 * 1024)
	) {
		throw new Error('Hydration payload exceeded maxHydrationBytes');
	}
	const id = options.scriptId ?? '__exact_hydration';
	const nonce = options.nonce ? ` nonce="${escapeAttr(options.nonce)}"` : '';
	return `<script type="application/json" id="${escapeAttr(id)}"${nonce}>${payload}</script>`;
}

function compactHydrationMetadata(
	value: Record<string, unknown>,
	resumptionLayouts?: ReadonlyMap<string, SsrResumptionLayout>
): Record<string, unknown> {
	const output = { ...value };
	compactOptionalRecord(output, 'endpoints', compactEndpointRoutes);
	compactOptionalRecord(output, 'continuations', compactContinuations);
	compactOptionalArray(output, 'resumptions', (resumption) =>
		compactResumption(resumption, resumptionLayouts)
	);
	for (const field of ['publicContexts'] as const) {
		if (isEmptyRecord(output[field])) delete output[field];
	}
	return output;
}

function compactEndpointRoutes(value: Record<string, unknown>): Record<string, unknown> {
	const output = { ...value };
	for (const field of ['invocations', 'boundaries'] as const) {
		if (isEmptyRecord(output[field])) delete output[field];
	}
	return output;
}

function compactContinuations(value: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(value).map(([id, continuation]) => [
			id,
			isPlainRecord(continuation) ? compactContinuation(continuation) : continuation
		])
	);
}

function compactContinuation(value: Record<string, unknown>): Record<string, unknown> {
	const output = omitEmptyArrays(value, [
		'dependencies',
		'stateReads',
		'stateWrites',
		'publicContexts',
		'contextWrites',
		'boundaries'
	]);
	delete output.serverContexts;
	delete output.serverContextWrites;
	return output;
}

function compactResumption(
	value: unknown,
	layouts?: ReadonlyMap<string, SsrResumptionLayout>
): unknown {
	if (!isPlainRecord(value)) return value;
	const output = omitEmptyArrays(value, ['settledContinuations']);
	for (const field of ['values', 'contexts'] as const) {
		if (isEmptyRecord(output[field])) delete output[field];
	}
	const componentId = output.componentId;
	const layout = typeof componentId === 'string' ? layouts?.get(componentId) : undefined;
	if (typeof componentId === 'string') {
		const values = compactEntries(output.values, layout?.statePaths);
		const contexts = compactEntries(output.contexts, layout?.contexts);
		if (!values || !contexts) return output;
		const settled = Array.isArray(output.settledContinuations) ? output.settledContinuations : [];
		const tuple: unknown[] = [componentId];
		if (values.length || contexts.length || settled.length) tuple.push(values);
		if (contexts.length || settled.length) tuple.push(contexts);
		if (settled.length) tuple.push(settled);
		return tuple;
	}
	return output;
}

/** Replaces compiler-declared field names with their stable contract indexes. */
function compactEntries(
	value: unknown,
	fields?: readonly string[]
): readonly (readonly [number | string, unknown])[] | undefined {
	if (value === undefined) return [];
	if (!isPlainRecord(value)) return undefined;
	const entries: Array<readonly [number | string, unknown]> = [];
	for (const [field, item] of Object.entries(value)) {
		const index = fields?.indexOf(field);
		if (fields && index === -1) return undefined;
		entries.push([index ?? field, item]);
	}
	return entries;
}

function compactOptionalRecord(
	owner: Record<string, unknown>,
	field: string,
	compact: (value: Record<string, unknown>) => Record<string, unknown>
): void {
	const value = owner[field];
	if (!isPlainRecord(value)) return;
	const compacted = compact(value);
	if (Object.keys(compacted).length) owner[field] = compacted;
	else delete owner[field];
}

function compactOptionalArray(
	owner: Record<string, unknown>,
	field: string,
	compact: (value: unknown) => unknown
): void {
	const value = owner[field];
	if (!Array.isArray(value)) return;
	if (!value.length) delete owner[field];
	else owner[field] = value.map(compact);
}

function omitEmptyArrays(
	value: Record<string, unknown>,
	fields: readonly string[]
): Record<string, unknown> {
	const output = { ...value };
	for (const field of fields) {
		const item = output[field];
		if (Array.isArray(item) && !item.length) delete output[field];
	}
	const invocation = output.invocation;
	if (isPlainRecord(invocation)) output.invocation = omitEmptyArrays(invocation, ['arguments']);
	return output;
}

function isEmptyRecord(value: unknown): boolean {
	return isPlainRecord(value) && Object.keys(value).length === 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Serializes hydration JSON while escaping script-breaking characters. */
export function serializeHydrationPayload(payload: Record<string, unknown>): string {
	return serializeEncodedHydrationPayload(encodeHydrationProtocolValue(payload));
}

function serializeEncodedHydrationPayload(payload: unknown): string {
	return JSON.stringify(payload)
		.replace(/</g, '\\u003C')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

/** Returns the first non-JSON-safe path in a value, or undefined when it is safe. */
export function jsonUnsafePath(
	value: unknown,
	path = '$',
	seen = new Set<object>()
): string | undefined {
	return findJsonUnsafePath(value, path, seen, false, {});
}

/** Returns whether a value can be safely serialized into hydration JSON. */
export function isJsonSafe(value: unknown, seen = new Set<object>()): boolean {
	return jsonUnsafePath(value, '$', seen) === undefined;
}

function omitUndefinedProperties(value: Record<string, unknown>): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) output[key] = item;
	}
	return output;
}

function findJsonUnsafePath(
	value: unknown,
	path: string,
	seen: Set<object>,
	strict: boolean,
	limits: { maxDepth?: number; maxNodes?: number }
): string | undefined {
	const maxDepth = positiveLimit(limits.maxDepth, 100);
	const maxNodes = positiveLimit(limits.maxNodes, 100_000);
	const pending: Array<
		{ value: unknown; path: string; depth: number } | { exit: object; path: string; depth: number }
	> = [{ value, path, depth: 0 }];
	let nodes = 0;
	try {
		while (pending.length) {
			const current = pending.pop()!;
			if ('exit' in current) {
				seen.delete(current.exit);
				continue;
			}
			if (++nodes > maxNodes || current.depth > maxDepth) return current.path;
			const item = current.value;
			if (item === null || (!strict && item === undefined)) continue;
			if (typeof item === 'string' || typeof item === 'boolean') continue;
			if (typeof item === 'number') {
				if (!Number.isFinite(item)) return current.path;
				continue;
			}
			if (typeof item !== 'object' || seen.has(item)) return current.path;
			seen.add(item);
			if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
				return current.path;
			const keys = Object.keys(item);
			pending.push({ exit: item, path: current.path, depth: current.depth });
			for (let index = keys.length - 1; index >= 0; index--) {
				const key = keys[index]!;
				const descriptor = Object.getOwnPropertyDescriptor(item, key);
				if (!descriptor || !('value' in descriptor))
					return `${current.path}${Array.isArray(item) ? `[${key}]` : `.${key}`}`;
				pending.push({
					value: descriptor.value,
					path: `${current.path}${Array.isArray(item) ? `[${key}]` : `.${key}`}`,
					depth: current.depth + 1
				});
			}
		}
		return undefined;
	} catch {
		return path;
	}
}
