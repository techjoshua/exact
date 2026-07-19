import { watch } from '@exact/reactive';

import type { Child, ComponentInstance, RenderResult } from './contracts.js';

import { isPromiseLike } from './async-value.js';
import { observeLifecyclePromise } from './async.js';
import {
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult
} from './errors.js';

/** Renders a component instance inside a watcher and returns normalized child output. */
export function renderInstance(
	instance: ComponentInstance<any>,
	onInvalidate: () => void
): Child[] {
	let output: RenderResult = null;
	const start = performanceNow();

	instance.invalidate = onInvalidate;
	instance.renderStop?.();
	instance.renderStop = watch(
		() => {
			try {
				instance.beginRender();
				output = (instance.errorFallback ?? instance.renderFunction)();
			} catch (error) {
				if (isPromiseLike(error) && handleComponentSuspension(instance, error)) {
					output = null;
					return;
				}
				const fallback = handleComponentError(
					instance,
					createErrorReport(error, 'render', instance)
				);
				if (!fallback) {
					output = null;
					return;
				}
				instance.errorFallback = fallback;
				output = fallback();
			} finally {
				instance.endRender();
			}
		},
		onInvalidate,
		{ scope: instance.scope }
	);

	const duration = performanceNow() - start;
	for (const handler of instance.renderHandlers) {
		try {
			const result = handler({ duration });
			if (isPromiseLike(result))
				observeLifecyclePromise(instance, Promise.resolve(result), 'render');
		} catch (error) {
			handleComponentError(instance, createErrorReport(error, 'lifecycle', instance, 'render'));
		}
	}

	return normalizeRenderResult(output);
}

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
