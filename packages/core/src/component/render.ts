import { watch } from '@exactjs/reactive';

import type { Child, ComponentInstance, RenderResult } from './contracts.js';

import { isPromiseLike } from './async-value.js';
import { observeLifecyclePromise } from './async.js';
import {
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult
} from './errors.js';
import { componentDomainInspection, withComponentDomain } from './domain.js';
import { componentRenderHandlers } from './lifecycle-handlers.js';

/** Renders a component instance inside a watcher and returns normalized child output. */
export function renderInstance(
	instance: ComponentInstance<any>,
	onInvalidate: () => void
): Child[] {
	let output: RenderResult = null;
	const start = performanceNow();
	const observedInvalidate = (): void => {
		componentDomainInspection(instance.domain)?.publish({
			kind: 'render.invalidate',
			component: instance
		});
		onInvalidate();
	};

	instance.invalidate = observedInvalidate;
	instance.renderStop?.();
	instance.renderStop = watch(
		() => {
			try {
				instance.beginRender();
				const render = instance.errorFallback ?? instance.renderFunction;
				output = withComponentDomain(instance.domain, render);
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
				output = withComponentDomain(instance.domain, fallback);
			} finally {
				instance.endRender();
			}
		},
		observedInvalidate,
		{ scope: instance.scope }
	);

	const duration = performanceNow() - start;
	for (const handler of componentRenderHandlers(instance)) {
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
