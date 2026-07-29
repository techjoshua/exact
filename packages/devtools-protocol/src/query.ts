import type { ExactBuildInspectionCatalog, ExactInspectionRuntimeId } from './identity.js';
import type {
	ExactInspectedMicrofrontend,
	ExactRuntimeInspectionEvent
} from './runtime.js';

/** Read-only methods understood by both Chromium and agent consumers. */
export const EXACT_INSPECTION_METHODS = Object.freeze([
	'session.describe',
	'roots.list',
	'microfrontends.list',
	'components.tree',
	'components.get',
	'components.ownerOfElement',
	'state.get',
	'contexts.list',
	'tasks.list',
	'tasks.get',
	'actions.list',
	'actions.get',
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
	options: Readonly<{ maxResults?: number; maxFilterKinds?: number }> = {}
): ExactInspectionRequest {
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
	if (value.page !== undefined) {
		if (!record(value.page)) throw new TypeError('Invalid eXact inspection pagination');
		if (
			value.page.limit !== undefined &&
			(!Number.isSafeInteger(value.page.limit) ||
				(value.page.limit as number) < 1 ||
				(value.page.limit as number) > (options.maxResults ?? 500))
		)
			throw new RangeError('eXact inspection page limit exceeded');
		if (value.page.cursor !== undefined && !boundedString(value.page.cursor, 256))
			throw new TypeError('Invalid eXact inspection cursor');
	}
	if (value.filter !== undefined) {
		if (!record(value.filter)) throw new TypeError('Invalid eXact inspection filter');
		if (
			value.filter.kinds !== undefined &&
			(!Array.isArray(value.filter.kinds) ||
				value.filter.kinds.length > (options.maxFilterKinds ?? 32) ||
				!value.filter.kinds.every((entry: unknown) => boundedString(entry, 128)))
		)
			throw new RangeError('eXact inspection filter is too large');
	}
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
