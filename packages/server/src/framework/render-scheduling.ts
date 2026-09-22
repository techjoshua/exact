/** Host-owned conditional admission for CPU work after request data becomes ready. */
export interface RequestRenderScheduler {
	/** Admits CPU work while retaining the request's cancellation lifetime. */
	(signal?: AbortSignal): void | Promise<void>;
	/** Optional progressive-rendering policy; the callable itself remains the default policy. */
	streaming?: RequestRenderScheduler;
}

// Bundled renderers and external adapters must share policy identity in the same realm.
// Entries are weak and contain no component state or per-continuation allocation.
const schedulerRegistry = Symbol.for('@exactjs/server/request-render-schedulers');
type SchedulerGlobal = typeof globalThis & {
	[schedulerRegistry]?: WeakMap<AbortSignal, RequestRenderScheduler>;
};
const schedulers = ((globalThis as SchedulerGlobal)[schedulerRegistry] ??= new WeakMap<
	AbortSignal,
	RequestRenderScheduler
>());

/** Associates a host policy without retaining its request or mutating the platform signal. */
export function bindRequestRenderScheduler(
	signal: AbortSignal,
	schedule: RequestRenderScheduler
): void {
	schedulers.set(signal, schedule);
}

/** Returns the adapter policy associated with this request's cancellation lifetime. */
export function requestRenderScheduler(signal?: AbortSignal): RequestRenderScheduler | undefined {
	return signal ? schedulers.get(signal) : undefined;
}

/** Preserves the first host policy when a framework scope derives a cancellation signal. */
export function inheritRequestRenderScheduler(
	source: AbortSignal | undefined,
	target: AbortSignal
): void {
	const schedule = requestRenderScheduler(source);
	if (schedule && !schedulers.has(target)) schedulers.set(target, schedule);
}
