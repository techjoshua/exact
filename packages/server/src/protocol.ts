import { ResponseResourceLimitError } from '@exactjs/core/framework/protocol-records';
import { reportDefaultRequestSize } from './request-body-size.js';
import type { Logger } from '@exactjs/core';
import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '@exactjs/core';
import {
	isNativeJsonCollection,
	jsonDataKeys,
	jsonDataProperty,
	normalizeProtocolLimit as positiveLimit,
	protocolUtf8ByteLength as utf8Length
} from '@exactjs/core/framework/protocol-records';
import { parseExactDebugRequest } from '@exactjs/devtools-protocol';
import type {
	ExactBatchRequest,
	ExactInvocationRequest,
	ExactProtocolRequest,
	ExactRequestLike,
	ExactTextResponse
} from './types.js';

/** Reads a runtime-neutral request body without buffering beyond the configured byte limit. */
export async function readBody(
	request: ExactRequestLike,
	maxRequestBytes?: number
): Promise<unknown> {
	if (request.body !== undefined) return request.body;
	const limit = positiveLimit(maxRequestBytes, Number.MAX_SAFE_INTEGER);
	const declaredLength = requestHeader(request, 'content-length');
	if (declaredLength !== undefined) {
		const parsed = Number(declaredLength);
		if (Number.isFinite(parsed) && parsed > limit) throw new Error('request byte limit exceeded');
	}
	if (request.bodyStream)
		return readBoundedRequestStream(request.bodyStream, limit, request.signal);
	if (request.text) return request.text();
	if (request.json) return request.json();
	return undefined;
}

async function readBoundedRequestStream(
	stream: ReadableStream<Uint8Array>,
	maxBytes: number,
	signal?: AbortSignal
): Promise<string> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	const abort = () => void reader.cancel(signal?.reason).catch(() => undefined);
	if (signal?.aborted) abort();
	else signal?.addEventListener('abort', abort, { once: true });
	try {
		while (true) {
			signal?.throwIfAborted();
			const next = await reader.read();
			signal?.throwIfAborted();
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > maxBytes) throw new Error('request byte limit exceeded');
			chunks.push(next.value);
		}
		const body = new Uint8Array(bytes);
		let offset = 0;
		for (const chunk of chunks) {
			body.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder('utf-8', { fatal: true }).decode(body);
	} catch (error) {
		const failure = signal?.aborted ? signal.reason : error;
		try {
			await reader.cancel(failure);
		} catch {
			/* preserve the validation failure */
		}
		throw failure;
	} finally {
		signal?.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}

function requestHeader(request: ExactRequestLike, name: string): string | undefined {
	if (request.headers instanceof Headers) return request.headers.get(name) ?? undefined;
	for (const [headerName, value] of Object.entries(request.headers ?? {})) {
		if (headerName.toLowerCase() === name) return Array.isArray(value) ? value[0] : value;
	}
	return undefined;
}

/**
 * Parses and validates the complete eXact request graph and its top-level envelope.
 *
 * The encoded graph is bounded before decoding. Reactive protocol decoding then reconstructs only
 * plain records, arrays, and validated Map/Set/keyed-collection envelopes, so callers must not
 * repeat a second decoded-graph safety traversal.
 */
export function parseExactRequestBody(
	body: unknown,
	options: {
		maxBatchOperations?: number;
		maxJsonDepth?: number;
		maxJsonNodes?: number;
		maxRequestBytes?: number;
	} = {},
	logger?: Logger
): ExactProtocolRequest {
	const requestLimit = positiveLimit(options.maxRequestBytes, Number.MAX_SAFE_INTEGER);
	let bodyBytes: number | undefined;
	if (body instanceof Uint8Array) {
		bodyBytes = body.byteLength;
		if (bodyBytes > requestLimit) throw new Error('request byte limit exceeded');
		body = new TextDecoder('utf-8', { fatal: true }).decode(body);
	}
	if (typeof body === 'string') {
		bodyBytes ??= utf8Length(body);
		if (bodyBytes > requestLimit) throw new Error('request byte limit exceeded');
	}
	const encodedValue = typeof body === 'string' ? JSON.parse(body) : body;
	if (
		!isEncodedRequestSafe(encodedValue, {
			maxDepth: positiveLimit(options.maxJsonDepth, 100),
			maxNodes: positiveLimit(options.maxJsonNodes, 100_000),
			maxBytes: requestLimit
		})
	)
		throw new Error('request graph limit exceeded');
	if (typeof body !== 'string') {
		const encoded = JSON.stringify(encodedValue);
		if (encoded === undefined) throw new Error('request byte limit exceeded');
		bodyBytes = utf8Length(encoded);
		if (bodyBytes > requestLimit) throw new Error('request byte limit exceeded');
	}
	reportDefaultRequestSize(bodyBytes!, options.maxRequestBytes, logger);
	const value = decodeReactiveProtocolValue(encodedValue);
	if (!value || typeof value !== 'object') throw new Error('invalid invocation');
	const record = value as Record<string, unknown>;
	if (record.type === 'debug') return parseExactDebugRequest(record);
	if (record.type === 'batch')
		return parseBatch(record, positiveLimit(options.maxBatchOperations, 100));
	return parseInvocationRecord(record);
}

/** Creates a no-store JSON response for the runtime-neutral handler. */
export function jsonResponse(status: number, body: unknown): ExactTextResponse {
	return {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store'
		},
		body: JSON.stringify(encodeReactiveProtocolValue(body, { maxDepth: Number.MAX_SAFE_INTEGER }))
	};
}

/** Returns whether an object contains only the explicitly allowed own enumerable keys. */
export function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
	return Object.keys(record).every((key) => allowed.includes(key));
}

/**
 * Checks JSON publication safety without invoking authored getters or serialization hooks.
 * Shared siblings are checked once per serialized occurrence. Active ancestor cycles and
 * unsupported prototypes are rejected, and each occurrence consumes the configured budgets.
 */
export function isJsonSafe(
	value: unknown,
	limits: {
		maxDepth?: number;
		maxNodes?: number;
		maxBytes?: number;
		onResource?: (kind: 'depth' | 'nodes' | 'bytes', actual: number) => void;
	} = {}
): boolean {
	return jsonGraphSafe(value, limits, true);
}

/** Validates the JSON-shaped request representation before protocol envelopes are decoded. */
function isEncodedRequestSafe(
	value: unknown,
	limits: {
		maxDepth?: number;
		maxNodes?: number;
		maxBytes?: number;
		onResource?: (kind: 'depth' | 'nodes' | 'bytes', actual: number) => void;
	}
): boolean {
	return jsonGraphSafe(value, limits, false);
}

/** Traverses one bounded graph without invoking accessors or accepting unknown prototypes. */
function jsonGraphSafe(
	value: unknown,
	limits: {
		maxDepth?: number;
		maxNodes?: number;
		maxBytes?: number;
		onResource?: (kind: 'depth' | 'nodes' | 'bytes', actual: number) => void;
	},
	allowDecodedCollections: boolean
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
			nodes++;
			limits.onResource?.('nodes', nodes);
			limits.onResource?.('depth', current.depth);
			if (nodes > maxNodes || current.depth > maxDepth) return false;
			const item = current.value;
			if (item === undefined || item === null) continue;
			if (typeof item === 'string') {
				bytes += utf8Length(item);
				limits.onResource?.('bytes', bytes);
				if (bytes > maxBytes) return false;
				continue;
			}
			if (typeof item === 'boolean') continue;
			if (typeof item === 'number') {
				if (!allowDecodedCollections && !Number.isFinite(item)) return false;
				continue;
			}
			if (typeof item !== 'object' || active.has(item)) return false;
			active.add(item);
			ancestors.push(item);
			if (allowDecodedCollections && item instanceof Map) {
				if (!isNativeJsonCollection(item)) return false;
				for (const [key, entryValue] of item) {
					if (!isTransportableMapKey(key)) return false;
					limits.onResource?.('nodes', nodes + pending.length + 1);
					if (nodes + pending.length + 1 > maxNodes) return false;
					if (typeof key === 'string') bytes += utf8Length(key);
					limits.onResource?.('bytes', bytes);
					if (bytes > maxBytes) return false;
					pending.push({ value: entryValue, depth: current.depth + 1 });
				}
				continue;
			}
			if (allowDecodedCollections && item instanceof Set) {
				if (!isNativeJsonCollection(item)) return false;
				for (const entryValue of item) {
					limits.onResource?.('nodes', nodes + pending.length + 1);
					if (nodes + pending.length + 1 > maxNodes) return false;
					pending.push({ value: entryValue, depth: current.depth + 1 });
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
				bytes += utf8Length(key);
				limits.onResource?.('bytes', bytes);
				if (bytes > maxBytes) return false;
				pending.push({ value: descriptor.value, depth: current.depth + 1 });
			}
		}
		return true;
	} catch (error) {
		if (error instanceof ResponseResourceLimitError) throw error;
		return false;
	}
}

function isTransportableMapKey(value: unknown): boolean {
	return (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'string' ||
		(typeof value === 'number' && Number.isFinite(value))
	);
}

function parseBatch(record: Record<string, unknown>, maxOperations: number): ExactBatchRequest {
	if (!hasOnlyKeys(record, ['type', 'version', 'operations']))
		throw new Error('unknown batch field');
	if (record.version !== undefined && record.version !== 1)
		throw new Error('invalid batch version');
	if (!Array.isArray(record.operations)) throw new Error('invalid batch operations');
	if (record.operations.length > maxOperations) throw new Error('batch operation limit exceeded');
	const operations = record.operations.map((operation) => {
		if (!operation || typeof operation !== 'object' || Array.isArray(operation))
			throw new Error('invalid batch operation');
		return parseInvocationRecord(operation as Record<string, unknown>);
	});
	const operationIds = new Set<string>();
	for (const operation of operations) {
		if (!operation.opId) continue;
		if (operationIds.has(operation.opId)) throw new Error('duplicate batch operation id');
		operationIds.add(operation.opId);
	}
	return {
		type: 'batch',
		version: record.version === 1 ? 1 : undefined,
		operations
	};
}

function parseInvocationRecord(record: Record<string, unknown>): ExactInvocationRequest {
	if (
		!hasOnlyKeys(record, [
			'type',
			'arrayCompletion',
			'root',
			'id',
			'partition',
			'opId',
			'dependsOn',
			'payload',
			'state',
			'publicContext',
			'boundaryHtml',
			'boundaryHtmls'
		])
	)
		throw new Error('unknown invocation field');
	if (record.type !== 'invoke' && record.type !== 'refresh')
		throw new Error('invalid invocation type');
	if (record.root !== undefined && (typeof record.root !== 'string' || !record.root))
		throw new Error('invalid execution root');
	if (typeof record.id !== 'string' || !record.id) throw new Error('invalid invocation id');
	if (record.partition !== undefined && !isPartitionAuthority(record.partition))
		throw new Error('invalid partition authority');
	if (record.arrayCompletion !== undefined && record.arrayCompletion !== 4)
		throw new Error('invalid Array completion contract');
	if (record.opId !== undefined && (typeof record.opId !== 'string' || !record.opId))
		throw new Error('invalid operation id');
	if (record.dependsOn !== undefined && !isStringList(record.dependsOn))
		throw new Error('invalid operation dependencies');
	if (record.publicContext !== undefined && !isContextValueMap(record.publicContext))
		throw new Error('invalid public context');
	if (record.boundaryHtml !== undefined && typeof record.boundaryHtml !== 'string')
		throw new Error('invalid boundary html');
	if (record.boundaryHtmls !== undefined && !isBoundaryHtmlMap(record.boundaryHtmls))
		throw new Error('invalid boundary htmls');
	return {
		type: record.type,
		...(record.arrayCompletion === 4 ? { arrayCompletion: 4 as const } : {}),
		...(typeof record.root === 'string' ? { root: record.root } : {}),
		id: record.id,
		...(record.partition === undefined ? {} : { partition: record.partition }),
		...(typeof record.opId === 'string' ? { opId: record.opId } : {}),
		...(Array.isArray(record.dependsOn) ? { dependsOn: record.dependsOn } : {}),
		...(record.payload === undefined ? {} : { payload: record.payload }),
		...(record.state === undefined ? {} : { state: record.state }),
		...(record.publicContext === undefined ? {} : { publicContext: record.publicContext }),
		...(typeof record.boundaryHtml === 'string' ? { boundaryHtml: record.boundaryHtml } : {}),
		...(record.boundaryHtmls === undefined ? {} : { boundaryHtmls: record.boundaryHtmls })
	};
}

function isPartitionAuthority(value: unknown): value is ExactInvocationRequest['partition'] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const authority = value as Record<string, unknown>;
	if (
		!hasOnlyKeys(authority, [
			'version',
			'buildKey',
			'executionRoot',
			'planEdgeId',
			'ownerComponentId',
			'discriminator',
			'generation'
		]) ||
		authority.version !== 1 ||
		typeof authority.buildKey !== 'string' ||
		!authority.buildKey ||
		typeof authority.executionRoot !== 'string' ||
		!authority.executionRoot ||
		typeof authority.planEdgeId !== 'string' ||
		!authority.planEdgeId ||
		typeof authority.ownerComponentId !== 'string' ||
		!authority.ownerComponentId ||
		!Number.isSafeInteger(authority.generation) ||
		(authority.generation as number) < 1
	)
		return false;
	return isPartitionDiscriminator(authority.discriminator);
}

function isPartitionDiscriminator(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const discriminator = value as Record<string, unknown>;
	if (discriminator.kind === 'single') return hasOnlyKeys(discriminator, ['kind']);
	if (discriminator.kind === 'branch')
		return (
			hasOnlyKeys(discriminator, ['kind', 'branch']) &&
			typeof discriminator.branch === 'string' &&
			!!discriminator.branch
		);
	return (
		discriminator.kind === 'keyed' &&
		hasOnlyKeys(discriminator, ['kind', 'list', 'keyToken']) &&
		typeof discriminator.list === 'string' &&
		!!discriminator.list &&
		typeof discriminator.keyToken === 'string' &&
		!!discriminator.keyToken
	);
}

function isBoundaryHtmlMap(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.entries(value as Record<string, unknown>).every(
		([id, html]) => !!id && typeof html === 'string'
	);
}

function isContextValueMap(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}
