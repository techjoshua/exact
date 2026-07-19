import type {
	ExactHydrationData,
	ExactHydrationEnvelope,
	ExactRouteDefinition,
	ExactRouterSnapshot,
	RouteLocation
} from './contracts.js';
import { createKey, normalizePath } from './locations.js';

/** Reports whether data work. */
export function hasDataWork(route: ExactRouteDefinition): boolean {
	return !!(route.loader || route.lazy || route.children?.some(hasDataWork));
}

/** Transforms route ids into its required representation. */
export function normalizeRouteIds<Route extends ExactRouteDefinition>(
	values: readonly Route[],
	parent = 'route'
): readonly Route[] {
	values.forEach((route, index) => {
		const id = route.id ?? `${parent}-${index}`;
		if (!route.id) Object.assign(route, { id });
		if (route.children) normalizeRouteIds(route.children as readonly Route[], id);
	});
	return values;
}

/** Reports whether own data work. */
export function hasOwnDataWork(route: ExactRouteDefinition): boolean {
	return !!(route.loader || route.lazy);
}

/** Performs the redirect result domain operation. */
export function redirectResult(value: unknown): { location: string; status: number } | undefined {
	if (!(value instanceof Response) || value.status < 300 || value.status >= 400) return undefined;
	const location = value.headers.get('Location');
	return location ? { location, status: value.status } : undefined;
}

/** Performs the location for url domain operation. */
export function locationForUrl(url: URL, init: RequestInit): RouteLocation {
	return Object.freeze({
		pathname: normalizePath(url.pathname),
		search: url.search,
		hash: url.hash,
		state: undefined,
		key: `${String(init.method ?? 'GET').toLowerCase()}-${createKey()}`
	});
}

/** Creates a redirect response for loaders and actions. */
export function redirect(location: string, status = 302): Response {
	return new Response(null, { status, headers: { Location: location } });
}

/** Projects a router snapshot into serializable client hydration data. */
export function hydrationDataFromSnapshot(
	snapshot: ExactRouterSnapshot,
	limits: { maxDepth?: number; maxNodes?: number; maxBytes?: number } = {}
): ExactHydrationData {
	const data = {
		loaderData: snapshot.loaderData,
		actionData: snapshot.actionData,
		errors: snapshot.errors
	};
	assertJsonTransferSafe(data, limits);
	return data;
}

/** Creates the versioned hydration envelope emitted by server rendering. */
export function hydrationEnvelopeFromSnapshot(
	snapshot: ExactRouterSnapshot,
	key = 'default',
	limits: { maxDepth?: number; maxNodes?: number; maxBytes?: number } = {}
): ExactHydrationEnvelope {
	if (!key) throw new Error('Router hydration key must be non-empty');
	const envelope: ExactHydrationEnvelope = {
		protocol: 1,
		key,
		location: `${snapshot.location.pathname}${snapshot.location.search}${snapshot.location.hash}`,
		matches: snapshot.matches.map((match) => match.id),
		data: hydrationDataFromSnapshot(snapshot, limits)
	};
	assertJsonTransferSafe(envelope, limits);
	return envelope;
}

function assertJsonTransferSafe(
	value: unknown,
	limits: { maxDepth?: number; maxNodes?: number; maxBytes?: number }
): void {
	const maxDepth = positiveLimit(limits.maxDepth, 100);
	const maxNodes = positiveLimit(limits.maxNodes, 100_000);
	const maxBytes = positiveLimit(limits.maxBytes, 16 * 1024 * 1024);
	const pending: Array<{ value: unknown; path: string; depth: number }> = [
		{ value, path: '$', depth: 0 }
	];
	const seen = new Set<object>();
	let nodes = 0;
	while (pending.length) {
		const current = pending.pop()!;
		if (++nodes > maxNodes || current.depth > maxDepth)
			throw new Error(`Route hydration data exceeded graph limits at ${current.path}`);
		const item = current.value;
		if (item === null || typeof item === 'string' || typeof item === 'boolean') continue;
		if (typeof item === 'number') {
			if (Number.isFinite(item)) continue;
			throw new Error(`Route hydration data is not JSON-safe at ${current.path}`);
		}
		if (typeof item !== 'object' || seen.has(item))
			throw new Error(`Route hydration data is not JSON-safe at ${current.path}`);
		seen.add(item);
		if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) {
			throw new Error(`Route hydration data is not JSON-safe at ${current.path}`);
		}
		for (const [key, child] of Object.entries(item)) {
			pending.push({ value: child, path: `${current.path}.${key}`, depth: current.depth + 1 });
		}
	}
	const serialized = JSON.stringify(value);
	if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
		throw new Error('Route hydration data exceeded byte limits');
	}
}

/** Performs the positive limit domain operation. */
export function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Performs the unwrap data result domain operation. */
export async function unwrapDataResult(value: unknown): Promise<unknown> {
	if (!(value instanceof Response)) return value;
	if (value.status === 204 || value.status === 205) return null;
	const contentType = value.headers.get('Content-Type') ?? '';
	return contentType.includes('application/json') ? value.json() : value.text();
}

/** Returns the highest-ranked route branch matching a pathname. */
