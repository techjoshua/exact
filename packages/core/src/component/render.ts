import { watch, withEffectScope } from '@exactjs/reactive/framework/runtime';

import type { AnyComponentInstance, Child, RenderResult } from './contracts.js';

import { isPromiseLike } from './async-value.js';
import { observeLifecyclePromise } from './async.js';
import { createErrorReport, handleComponentError, handleComponentSuspension } from './errors.js';
import { normalizeRenderResult } from '../render-children.js';
import { componentDomainInspection, withComponentDomain } from './domain.js';
import { componentRenderHandlers } from './lifecycle-handlers.js';
import {
	compiledComponentLifecycleABI,
	compiledComponentRangeOutputABI,
	compiledComponentRenderABI
} from './compiled-abi.js';

/** Renders once for a compiler-owned program or retains the general watched fallback. */
export function renderInstance(instance: AnyComponentInstance, onInvalidate: () => void): Child[] {
	return normalizeRenderResult(
		executePreparedComponentOutput(instance, onInvalidate) as RenderResult
	);
}

/** Executes one durable instance while preserving compiler-owned server output. */
export function renderInstanceOutput(
	instance: AnyComponentInstance,
	onInvalidate: () => void
): unknown {
	return executePreparedComponentOutput(instance, onInvalidate);
}

/** Executes already-constructed component output for a target ABI owner. */
export function executePreparedComponentOutput(
	instance: AnyComponentInstance,
	onInvalidate: () => void
): unknown {
	let output: RenderResult | unknown = null;
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
	const render = () => {
		try {
			instance.beginRender();
			const render = instance.errorFallback ?? instance.renderFunction;
			output = withEffectScope(instance.scope, () => withComponentDomain(instance.domain, render));
		} catch (error) {
			if (isPromiseLike(error) && handleComponentSuspension(instance, error)) {
				output = null;
				return;
			}
			const fallback = handleComponentError(instance, createErrorReport(error, 'render', instance));
			if (!fallback) {
				output = null;
				return;
			}
			instance.errorFallback = fallback;
			output = withEffectScope(instance.scope, () =>
				withComponentDomain(instance.domain, fallback)
			);
		} finally {
			instance.endRender();
		}
	};
	if (instance.runtimeABI & compiledComponentRangeOutputABI) {
		instance.renderStop = watch(render, observedInvalidate, { scope: instance.scope });
	} else if (instance.runtimeABI & compiledComponentRenderABI) {
		render();
	} else {
		instance.renderStop = watch(render, observedInvalidate, { scope: instance.scope });
	}

	const duration = performanceNow() - start;
	const handlers =
		instance.runtimeABI & compiledComponentLifecycleABI ? componentRenderHandlers(instance) : [];
	for (const handler of handlers) {
		try {
			const result = handler({ duration });
			if (isPromiseLike(result))
				observeLifecyclePromise(instance, Promise.resolve(result), 'render');
		} catch (error) {
			handleComponentError(instance, createErrorReport(error, 'lifecycle', instance, 'render'));
		}
	}

	return output;
}

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
