import type { ExactDebugCapability } from './runtime.js';
import type { ExactInspectionFilter, ExactInspectionRequest } from './query.js';

/** Debug message family carried by the application's existing eXact endpoint. */
export type ExactDebugRequest =
	| Readonly<{
			type: 'debug';
			version: 1;
			request: 'open';
			capabilities?: readonly ExactDebugCapability[];
	  }>
	| Readonly<{
			type: 'debug';
			version: 1;
			request: 'query';
			sessionId: string;
			query: ExactInspectionRequest;
	  }>
	| Readonly<{
			type: 'debug';
			version: 1;
			request: 'subscribe';
			sessionId: string;
			cursor?: string;
			filter?: ExactInspectionFilter;
	  }>
	| Readonly<{
			type: 'debug';
			version: 1;
			request: 'close';
			sessionId: string;
	  }>;

/** Parses an untrusted debug envelope without accepting invocation-shaped fields. */
export function parseExactDebugRequest(value: unknown): ExactDebugRequest {
	if (!record(value) || value.type !== 'debug' || value.version !== 1)
		throw new TypeError('Invalid eXact debug envelope');
	if (!['open', 'query', 'subscribe', 'close'].includes(String(value.request)))
		throw new TypeError('Unknown eXact debug request');
	if (value.request === 'open') {
		if (
			value.capabilities !== undefined &&
			(!Array.isArray(value.capabilities) ||
				value.capabilities.length > 4 ||
				!value.capabilities.every((capability: unknown) =>
					['catalog', 'snapshot', 'events', 'source'].includes(String(capability))
				))
		)
			throw new TypeError('Invalid eXact debug capabilities');
		return value as ExactDebugRequest;
	}
	if (!boundedString(value.sessionId, 256)) throw new TypeError('Invalid eXact debug session');
	if (value.request === 'query' && !record(value.query))
		throw new TypeError('Invalid eXact debug query');
	if (
		value.request === 'subscribe' &&
		value.cursor !== undefined &&
		!boundedString(value.cursor, 256)
	)
		throw new TypeError('Invalid eXact debug cursor');
	return value as ExactDebugRequest;
}

/** Returns the independently authorized capability required by one debug message. */
export function exactDebugCapabilityForRequest(request: ExactDebugRequest): ExactDebugCapability {
	if (request.request === 'subscribe') return 'events';
	if (request.request === 'query') {
		if (request.query.method === 'source.excerpt') return 'source';
		if (
			request.query.method === 'catalog.entity' ||
			request.query.method === 'dependencies.explain' ||
			request.query.method === 'partitions.plan'
		)
			return 'catalog';
		return 'snapshot';
	}
	return 'snapshot';
}

function boundedString(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
