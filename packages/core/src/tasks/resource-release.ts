import { disposeTaskResource, ownTaskResource } from './resources.js';
import type { TaskContext } from './contracts.js';
import type { TaskResourceDisposal } from '../component/contracts.js';

/** Release tracking exists only for compiler sites that also contain authored disposal or registration. */
const releases = new WeakMap<AbortSignal, Map<unknown, { active: boolean }>>();

/** Distributes optional method types before removing the receiver supplied by the bridge. */
type NativeReleaseMethod<M> = M extends unknown ? OmitThisParameter<M> : never;

/**
 * Owns a resource with fallback disposal until an authored release or ownership registration runs.
 * Preserves native identity and LIFO cleanup. Authored cleanup runs before fallback disposal,
 * including cancellation. Ordinary resources use ownTaskResource without this tracking storage.
 */
export function ownReleasableTaskResource<T>(
	context: TaskContext,
	resource: T,
	disposal?: TaskResourceDisposal
): T {
	const signal = context.signal;
	let owned = releases.get(signal);
	if (!owned) {
		owned = new Map();
		releases.set(signal, owned);
	}
	if (owned.has(resource)) return resource;
	const release = { active: true };
	owned.set(resource, release);
	const cleanup = () => {
		const value = resource;
		owned.delete(value);
		if (!owned.size) releases.delete(signal);
		if (!release.active) return;
		release.active = false;
		return disposeTaskResource(value, disposal, signal.reason);
	};
	try {
		context.cleanup(cleanup);
	} catch {
		// A producer can close while attached work still owns its resource scope.
		// The helper lifetime remains authoritative for late automatic ownership.
		ownTaskResource(signal, resource, cleanup);
	}
	return resource;
}

/**
 * Records a successfully evaluated authored release or ownership registration and returns its exact result.
 * The call expression runs before this helper, preserving argument evaluation, receiver and promise identity.
 * A throwing expression retains fallback ownership so failed registration cannot abandon the resource.
 */
export function releaseTaskResource<T>(signal: AbortSignal, resource: unknown, result: T): T {
	const release = releases.get(signal)?.get(resource);
	if (release) release.active = false;
	return result;
}

/**
 * Retains fallback ownership when an optional disposal call short-circuits. A
 * callable method keeps its resource receiver, arguments and exact return value.
 * Release is recorded after successful invocation, including an undefined result.
 */
export function taskResourceReleaseMethod<M>(
	signal: AbortSignal,
	resource: unknown,
	method: M
): NativeReleaseMethod<M> {
	if (typeof method !== 'function') return method as NativeReleaseMethod<M>;
	return function (...args: unknown[]) {
		return releaseTaskResource(signal, resource, Reflect.apply(method, resource, args));
	} as NativeReleaseMethod<M>;
}
