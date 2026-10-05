import { taskResourceSignal } from './resource-lifetime.js';

/** Event-listener options augmented with framework-owned cancellation. */
export type ManagedEventListenerOptions = EventListenerOptions & {
	once?: boolean;
	passive?: boolean;
	signal?: AbortSignal;
};

/** Returns whether an unknown value implements the AbortSignal contract. */
export function isAbortSignal(value: unknown): value is AbortSignal {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (value as AbortSignal).addEventListener === 'function' &&
		typeof (value as AbortSignal).aborted === 'boolean'
	);
}

/**
 * Combines two abort signals while preserving the reason from the first abort.
 */
export function combineAbortSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
	const nativeAny = (
		AbortSignal as typeof AbortSignal & {
			any?(signals: AbortSignal[]): AbortSignal;
		}
	).any;
	if (nativeAny) return nativeAny.call(AbortSignal, [left, right]);

	const controller = new AbortController();
	const abort = (event: Event) => {
		left.removeEventListener('abort', abort);
		right.removeEventListener('abort', abort);
		controller.abort((event.currentTarget as AbortSignal | null)?.reason);
	};
	if (left.aborted) controller.abort(left.reason);
	else if (right.aborted) controller.abort(right.reason);
	else {
		left.addEventListener('abort', abort, { once: true });
		right.addEventListener('abort', abort, { once: true });
	}
	return controller.signal;
}

/**
 * Combines author cancellation with a generation's resource lifetime. Enrolled
 * resources abort on settlement without cancelling a successful task outcome.
 * Outside a framework generation, the supplied owner retains its own lifetime.
 */
export function combineTaskSignal(owner: AbortSignal, existing?: AbortSignal): AbortSignal {
	const lifetime = taskResourceSignal(owner);
	if (!existing || existing === owner || existing === lifetime) return lifetime;
	return combineAbortSignals(existing, lifetime);
}

/** Attaches framework ownership without discarding author event options. */
export function withAbortSignal(
	options: boolean | ManagedEventListenerOptions | undefined,
	owner: AbortSignal
): ManagedEventListenerOptions {
	const normalized: ManagedEventListenerOptions =
		typeof options === 'boolean' ? { capture: options } : options ? { ...options } : {};
	return { ...normalized, signal: combineTaskSignal(owner, normalized.signal) };
}

/** Adds task cancellation to an arbitrary API options object. */
export function withTaskSignal<T extends object | undefined>(
	options: T,
	owner: AbortSignal
): T & { signal: AbortSignal } {
	const normalized = options ? { ...options } : {};
	const existing =
		'signal' in normalized && isAbortSignal(normalized.signal) ? normalized.signal : undefined;
	return {
		...normalized,
		signal: combineTaskSignal(owner, existing)
	} as T & { signal: AbortSignal };
}
