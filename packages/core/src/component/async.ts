import type { ComponentInstance, ErrorSource } from './contracts.js';

import { observeTaskPromise } from '../tasks/observers.js';
import { isPromiseLike } from './async-value.js';
import { createErrorReport, handleComponentError } from './errors.js';
import { isTaskCancellation } from '../tasks/cancellation.js';

/** Performs the observe lifecycle promise domain operation. */
export function observeLifecyclePromise(
	instance: ComponentInstance<any>,
	promise: PromiseLike<unknown>,
	phase: string
): void {
	const observed = Promise.resolve(promise).catch((error) => {
		handleComponentError(instance, createErrorReport(error, 'lifecycle', instance, phase));
	});
	observeTaskPromise(observed, instance);
}

/** Observes asynchronous component work so renderers and test harnesses can await it and route failures. */
export function observeComponentAsync(
	instance: ComponentInstance<any> | undefined,
	value: unknown,
	source: ErrorSource,
	phase: string
): void {
	if (!isPromiseLike(value)) return;
	const observed = Promise.resolve(value).catch((error) => {
		if (isTaskCancellation(error)) return;
		handleComponentError(instance, createErrorReport(error, source, instance, phase));
	});
	if (instance) observeTaskPromise(observed, instance);
	else void observed;
}

/** Tracks promise settlement as renderer-owned work without converting rejection into a component error. */
export function trackComponentAsync(
	instance: ComponentInstance<any>,
	value: PromiseLike<unknown>
): void {
	const settlement = Promise.resolve(value).then(
		() => undefined,
		() => undefined
	);
	observeTaskPromise(settlement, instance);
}
