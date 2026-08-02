import {
	isExactInspectionRuntimeId,
	type ExactBuildInspectionCatalog,
	type ExactInspectionRuntimeId
} from './identity.js';
import type { ExactInspectedMicrofrontend, ExactRuntimeInspectionEvent } from './runtime.js';

/** Read-only methods understood by both Chromium and agent consumers. */
export const EXACT_INSPECTION_METHODS = Object.freeze([
	'session.describe',
	'roots.list',
	'microfrontends.list',
	'components.tree',
	'partitions.tree',
	'components.get',
	'components.ownerOfElement',
	'state.get',
	'contexts.list',
	'tasks.list',
	'tasks.get',
	'tasks.getTree',
	'dependencies.explain',
	'timeline.query',
	'errors.list',
	'catalog.entity',
	'source.excerpt'
] as const);

/** One supported, side-effect-free inspection method. */
export type ExactInspectionMethod = (typeof EXACT_INSPECTION_METHODS)[number];

/** Bounded collection selection shared by all list methods. */
export type ExactInspectionPagination = Readonly<{
	cursor?: string;
	limit?: number;
}>;

/** Common filters for runtime roots and timeline records. */
export type ExactInspectionFilter = Readonly<{
	side?: 'client' | 'server';
	binding?: string;
	buildKey?: string;
	executionRoot?: string;
	componentTypeId?: string;
	instanceId?: string;
	sourceEntityId?: string;
	operationId?: string;
	requestId?: string;
	interactionId?: string;
	kinds?: readonly string[];
}>;

/** Versioned query accepted by the shared read-only service. */
export type ExactInspectionRequest = Readonly<{
	protocol: 1;
	id: string;
	method: ExactInspectionMethod;
	params?: Readonly<{
		identity?: ExactInspectionRuntimeId;
		elementId?: string;
		sourceEntityId?: string;
		sourceHash?: string;
		path?: string;
		filter?: ExactInspectionFilter;
		page?: ExactInspectionPagination;
	}>;
}>;

/** Successful query response with explicit build/root identity. */
export type ExactInspectionSuccess = Readonly<{
	protocol: 1;
	id: string;
	ok: true;
	identity: Readonly<{
		sessionId: string;
		buildKey?: string;
		executionRoot?: string;
		binding?: string;
	}>;
	result: unknown;
	page?: Readonly<{ nextCursor?: string; count: number }>;
}>;

/** Structured query failure that never reveals unauthorized catalog existence. */
export type ExactInspectionFailure = Readonly<{
	protocol: 1;
	id: string;
	ok: false;
	error:
		| 'bad-request'
		| 'unknown-method'
		| 'not-found'
		| 'not-authorized'
		| 'unavailable'
		| 'session-expired'
		| 'limit-exceeded';
	reason?: string;
}>;

/** Result of one read-only inspection query. */
export type ExactInspectionResponse = ExactInspectionSuccess | ExactInspectionFailure;

/** Subscription request for bounded timeline events after an optional cursor. */
export type ExactInspectionSubscription = Readonly<{
	protocol: 1;
	sessionId: string;
	cursor?: string;
	filter?: ExactInspectionFilter;
}>;

/** Disposable ownership handle for one event subscription. */
export interface ExactInspectionSubscriptionHandle {
	readonly closed: boolean;
	close(): void;
}

/** Shared service consumed without scraping or arbitrary JavaScript evaluation. */
export interface ExactInspectionQueryService {
	request(request: ExactInspectionRequest): Promise<ExactInspectionResponse>;
	subscribe(
		request: ExactInspectionSubscription,
		listener: (event: ExactRuntimeInspectionEvent) => void
	): ExactInspectionSubscriptionHandle;
}

/** Catalog-backed query data used by server and in-page service implementations. */
export type ExactInspectionQueryData = Readonly<{
	catalogs?: readonly ExactBuildInspectionCatalog[];
	microfrontends?: readonly ExactInspectedMicrofrontend[];
}>;

/** Parses and bounds an untrusted inspection query. */
export function parseExactInspectionRequest(
	value: unknown,
	options: Readonly<{
		maxResults?: number;
		maxFilterKinds?: number;
		maxDepth?: number;
		maxNodes?: number;
	}> = {}
): ExactInspectionRequest {
	validateStructure(value, options.maxDepth ?? 20, options.maxNodes ?? 10_000);
	if (!record(value) || value.protocol !== 1 || !boundedString(value.id, 256))
		throw new TypeError('Invalid eXact inspection request envelope');
	if (
		typeof value.method !== 'string' ||
		!EXACT_INSPECTION_METHODS.includes(value.method as ExactInspectionMethod)
	)
		throw new TypeError('Unknown eXact inspection method');
	if (value.params !== undefined) validateParams(value.params, options);
	return value as ExactInspectionRequest;
}

/** Parses an untrusted subscription without accepting query methods or executable fields. */
export function parseExactInspectionSubscription(
	value: unknown,
	options: Readonly<{ maxFilterKinds?: number; maxDepth?: number; maxNodes?: number }> = {}
): ExactInspectionSubscription {
	validateStructure(value, options.maxDepth ?? 10, options.maxNodes ?? 1_000);
	if (
		!record(value) ||
		value.protocol !== 1 ||
		!boundedString(value.sessionId, 256) ||
		!onlyKeys(value, ['protocol', 'sessionId', 'cursor', 'filter'])
	)
		throw new TypeError('Invalid eXact inspection subscription');
	if (value.cursor !== undefined && !boundedString(value.cursor, 2_048))
		throw new TypeError('Invalid eXact inspection subscription cursor');
	if (value.filter !== undefined) validateFilter(value.filter, options.maxFilterKinds ?? 32);
	return value as ExactInspectionSubscription;
}

/** Parses a bounded response returned across an extension, CDP, or server transport boundary. */
export function parseExactInspectionResponse(
	value: unknown,
	options: Readonly<{ maxDepth?: number; maxNodes?: number }> = {}
): ExactInspectionResponse {
	validateStructure(value, options.maxDepth ?? 30, options.maxNodes ?? 100_000);
	if (
		!record(value) ||
		value.protocol !== 1 ||
		!boundedString(value.id, 256) ||
		typeof value.ok !== 'boolean'
	)
		throw new TypeError('Invalid eXact inspection response envelope');
	if (value.ok) {
		if (!onlyKeys(value, ['protocol', 'id', 'ok', 'identity', 'result', 'page']))
			throw new TypeError('Unknown eXact inspection response field');
		if (
			!record(value.identity) ||
			!onlyKeys(value.identity, ['sessionId', 'buildKey', 'executionRoot', 'binding']) ||
			!boundedString(value.identity.sessionId, 256)
		)
			throw new TypeError('Invalid eXact inspection response identity');
		for (const key of ['buildKey', 'executionRoot', 'binding'] as const)
			if (value.identity[key] !== undefined && !boundedString(value.identity[key], 512))
				throw new TypeError(`Invalid eXact inspection response ${key}`);
		if (!Object.prototype.hasOwnProperty.call(value, 'result'))
			throw new TypeError('Missing eXact inspection response result');
		if (value.page !== undefined) {
			if (
				!record(value.page) ||
				!onlyKeys(value.page, ['nextCursor', 'count']) ||
				!Number.isSafeInteger(value.page.count) ||
				(value.page.count as number) < 0 ||
				(value.page.nextCursor !== undefined && !boundedString(value.page.nextCursor, 2_048))
			)
				throw new TypeError('Invalid eXact inspection response page');
		}
		return value as ExactInspectionSuccess;
	}
	if (!onlyKeys(value, ['protocol', 'id', 'ok', 'error', 'reason']))
		throw new TypeError('Unknown eXact inspection failure field');
	if (
		![
			'bad-request',
			'unknown-method',
			'not-found',
			'not-authorized',
			'unavailable',
			'session-expired',
			'limit-exceeded'
		].includes(String(value.error)) ||
		(value.reason !== undefined && !boundedString(value.reason, 2_048))
	)
		throw new TypeError('Invalid eXact inspection failure');
	return value as ExactInspectionFailure;
}

/** Applies deterministic cursor pagination without retaining a caller-owned collection. */
export function paginateExactInspection<T>(
	values: readonly T[],
	page: ExactInspectionPagination | undefined,
	maximum = 500
): Readonly<{ values: readonly T[]; nextCursor?: string }> {
	const limit = positive(page?.limit, Math.min(100, maximum), maximum);
	const offset = decodeCursor(page?.cursor);
	if (offset > values.length) throw new RangeError('Inspection cursor is outside the collection');
	const selected = Object.freeze(values.slice(offset, offset + limit));
	const next = offset + selected.length;
	return Object.freeze({
		values: selected,
		...(next < values.length ? { nextCursor: encodeCursor(next) } : {})
	});
}

/** Filters one event without reordering records from an owning host. */
export function exactInspectionEventMatches(
	event: ExactRuntimeInspectionEvent,
	filter: ExactInspectionFilter | undefined
): boolean {
	if (!filter) return true;
	for (const key of [
		'side',
		'binding',
		'buildKey',
		'executionRoot',
		'componentTypeId',
		'instanceId',
		'sourceEntityId',
		'operationId'
	] as const) {
		if (filter[key] !== undefined && event.id[key] !== filter[key]) return false;
	}
	if (filter.requestId !== undefined && event.requestId !== filter.requestId) return false;
	if (filter.interactionId !== undefined && event.interactionId !== filter.interactionId)
		return false;
	return !filter.kinds?.length || filter.kinds.includes(event.kind);
}

function validateParams(
	value: unknown,
	options: Readonly<{ maxResults?: number; maxFilterKinds?: number }>
): void {
	if (!record(value)) throw new TypeError('Invalid eXact inspection parameters');
	if (
		!onlyKeys(value, [
			'identity',
			'elementId',
			'sourceEntityId',
			'sourceHash',
			'path',
			'filter',
			'page'
		])
	)
		throw new TypeError('Unknown eXact inspection parameter');
	if (value.identity !== undefined && !isExactInspectionRuntimeId(value.identity))
		throw new TypeError('Invalid eXact inspection runtime identity');
	for (const key of ['elementId', 'sourceEntityId', 'sourceHash', 'path'] as const)
		if (value[key] !== undefined && !boundedString(value[key], key === 'path' ? 2048 : 512))
			throw new TypeError(`Invalid eXact inspection ${key}`);
	if (value.page !== undefined) {
		if (!record(value.page) || !onlyKeys(value.page, ['limit', 'cursor']))
			throw new TypeError('Invalid eXact inspection pagination');
		if (
			value.page.limit !== undefined &&
			(!Number.isSafeInteger(value.page.limit) ||
				(value.page.limit as number) < 1 ||
				(value.page.limit as number) > (options.maxResults ?? 500))
		)
			throw new RangeError('eXact inspection page limit exceeded');
		if (value.page.cursor !== undefined && !boundedString(value.page.cursor, 2_048))
			throw new TypeError('Invalid eXact inspection cursor');
	}
	if (value.filter !== undefined) validateFilter(value.filter, options.maxFilterKinds ?? 32);
}

function validateFilter(value: unknown, maxFilterKinds: number): void {
	if (
		!record(value) ||
		!onlyKeys(value, [
			'side',
			'binding',
			'buildKey',
			'executionRoot',
			'componentTypeId',
			'instanceId',
			'sourceEntityId',
			'operationId',
			'requestId',
			'interactionId',
			'kinds'
		])
	)
		throw new TypeError('Invalid eXact inspection filter');
	if (value.side !== undefined && value.side !== 'client' && value.side !== 'server')
		throw new TypeError('Invalid eXact inspection side filter');
	for (const key of [
		'binding',
		'buildKey',
		'executionRoot',
		'componentTypeId',
		'instanceId',
		'sourceEntityId',
		'operationId',
		'requestId',
		'interactionId'
	] as const)
		if (value[key] !== undefined && !boundedString(value[key], 512))
			throw new TypeError(`Invalid eXact inspection ${key} filter`);
	if (
		value.kinds !== undefined &&
		(!Array.isArray(value.kinds) ||
			value.kinds.length > maxFilterKinds ||
			!value.kinds.every((entry: unknown) => boundedString(entry, 128)))
	)
		throw new RangeError('eXact inspection filter is too large');
}

function validateStructure(value: unknown, maxDepth: number, maxNodes: number): void {
	let nodes = 0;
	const visit = (current: unknown, depth: number): void => {
		if (++nodes > maxNodes) throw new RangeError('eXact inspection query is too large');
		if (depth > maxDepth) throw new RangeError('eXact inspection query is too deep');
		if (Array.isArray(current)) {
			for (const item of current) visit(item, depth + 1);
			return;
		}
		if (!record(current)) return;
		for (const item of Object.values(current)) visit(item, depth + 1);
	};
	visit(value, 0);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	const keys = new Set(allowed);
	return Object.keys(value).every((key) => keys.has(key));
}

function encodeCursor(offset: number): string {
	return offset.toString(36);
}

function decodeCursor(cursor: string | undefined): number {
	if (!cursor) return 0;
	if (!/^[0-9a-z]+$/.test(cursor)) throw new TypeError('Invalid eXact inspection cursor');
	const offset = Number.parseInt(cursor, 36);
	if (!Number.isSafeInteger(offset) || offset < 0)
		throw new TypeError('Invalid eXact inspection cursor');
	return offset;
}

function positive(value: number | undefined, fallback: number, maximum: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
		? Math.min(value, maximum)
		: fallback;
}

function boundedString(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function record(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
