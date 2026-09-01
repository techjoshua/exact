import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';
import { encodeValidatedReactiveCollection } from '@exactjs/reactive/framework/protocol';
import { escapeAttr } from './html.js';
import { encodeHydrationProtocolValue } from './hydration-encoding-capability.js';
import { validateJsonSafeHydrationValue } from './hydration-json.js';
import {
	createDirectHydrationMetadata,
	createExtensibleHydrationMetadata
} from './render/hydration-metadata.js';
import { utf8ByteLength } from './render/utf8.js';
import type { HydrationScriptOptions } from './types.js';
import type { SsrResumptionLayout } from './resumption.js';
import type { SsrSerializedResumption } from './resumption.js';

/** Renders the JSON script tag consumed by the hydration client. */
export function renderHydrationScript(
	options: HydrationScriptOptions = {},
	resumptionLayouts?: ReadonlyMap<string, SsrResumptionLayout>,
	capturedResumptions?: readonly SsrSerializedResumption[]
): string {
	return renderHydrationScriptValue(options, resumptionLayouts, capturedResumptions);
}

/** Renders hydration markup while publishing its exact UTF-8 length to one request-owned record. */
export function renderHydrationScriptWithByteCount(
	options: HydrationScriptOptions,
	resumptionLayouts: ReadonlyMap<string, SsrResumptionLayout> | undefined,
	capturedResumptions: readonly SsrSerializedResumption[] | undefined,
	target: { hydrationBytes?: number }
): string {
	return renderHydrationScriptValue(options, resumptionLayouts, capturedResumptions, target);
}

function renderHydrationScriptValue(
	options: HydrationScriptOptions,
	resumptionLayouts?: ReadonlyMap<string, SsrResumptionLayout>,
	capturedResumptions?: readonly SsrSerializedResumption[],
	byteTarget?: { hydrationBytes?: number }
): string {
	if (
		options.buildKey &&
		options.componentAuthorization &&
		options.componentAuthorization.buildKey !== options.buildKey
	)
		throw new Error('Component authorization identity does not match the hydration build key');
	const directResumptions =
		!options.outputExtensions?.length && capturedResumptions?.length
			? capturedResumptions
			: undefined;
	const structurallyKnown = new WeakSet<object>();
	const compacted = directResumptions
		? createDirectHydrationMetadata(options, directResumptions, structurallyKnown)
		: createExtensibleHydrationMetadata(options, resumptionLayouts);
	const reactiveCollections = new WeakMap<unknown[], unknown>();
	let hasReactiveCollections = false;
	const unsafePath = validateJsonSafeHydrationValue(compacted, {
		maxDepth: options.maxHydrationDepth,
		maxNodes: options.maxHydrationNodes,
		onValidatedArray(value) {
			const encoded = encodeValidatedReactiveCollection(value, value);
			if (encoded === value) return;
			reactiveCollections.set(value, encoded);
			hasReactiveCollections = true;
		},
		structurallyKnown
	});
	if (unsafePath) throw new Error(`Hydration payload must be JSON-serializable at ${unsafePath}`);
	const payload = serializeValidatedHydrationPayload(
		compacted,
		hasReactiveCollections ? reactiveCollections : undefined
	);
	const payloadBytes = utf8ByteLength(payload);
	if (payloadBytes > positiveLimit(options.maxHydrationBytes, 16 * 1024 * 1024)) {
		throw new Error('Hydration payload exceeded maxHydrationBytes');
	}
	const id = options.scriptId ?? '__exact_hydration';
	const nonce = options.nonce ? ` nonce="${escapeAttr(options.nonce)}"` : '';
	const prefix = `<script type="application/json" id="${escapeAttr(id)}"${nonce}>`;
	const suffix = '</script>';
	if (byteTarget) byteTarget.hydrationBytes = utf8ByteLength(prefix) + payloadBytes + suffix.length;
	return `${prefix}${payload}${suffix}`;
}

/** Serializes hydration JSON while escaping script-breaking characters. */
export function serializeHydrationPayload(payload: Record<string, unknown>): string {
	return serializeEncodedHydrationPayload(encodeHydrationProtocolValue(payload));
}

function serializeEncodedHydrationPayload(payload: unknown): string {
	return serializeJson(payload);
}

/** Encodes registered arrays as JSON visits them without cloning the validated payload graph. */
function serializeValidatedHydrationPayload(
	payload: unknown,
	reactiveCollections?: WeakMap<unknown[], unknown>
): string {
	if (!reactiveCollections) return serializeJson(payload);
	const emittedCollections = new WeakSet<unknown[]>();
	return serializeJson(payload, function (_key, value) {
		if (!Array.isArray(value)) return value;
		if (emittedCollections.has(value)) return value;
		const encoded = reactiveCollections.get(value);
		if (encoded === undefined) return value;
		emittedCollections.add(value);
		return encoded;
	});
}

function serializeJson(
	payload: unknown,
	replacer?: (this: unknown, key: string, value: unknown) => unknown
): string {
	return JSON.stringify(payload, replacer)
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
