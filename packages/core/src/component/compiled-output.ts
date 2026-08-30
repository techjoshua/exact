import { withEffectScope } from '@exactjs/reactive/framework/runtime';
import { normalizeRenderResult } from '../render-children.js';
import { isPromiseLike } from './async-value.js';
import { observeLifecyclePromise } from './async.js';
import type { AnyComponentInstance, Child, RenderResult } from './contracts.js';
import { withComponentDomain } from './domain.js';
import { createErrorReport, handleComponentError, handleComponentSuspension } from './errors.js';
import { compiledComponentLifecycleABI } from './compiled-abi.js';
import { componentRenderHandlers } from './lifecycle-handlers.js';

/** Executes one compiler-owned output operation without installing component-wide invalidation. */
export function executeCompiledComponentOutput(instance: AnyComponentInstance): Child[] {
	let output: RenderResult = null;
	const start = performanceNow();
	instance.invalidate = undefined;
	instance.beginRender();
	try {
		const render = instance.errorFallback ?? instance.renderFunction;
		output = withEffectScope(instance.scope, () => withComponentDomain(instance.domain, render));
	} catch (error) {
		if (isPromiseLike(error) && handleComponentSuspension(instance, error)) output = null;
		else {
			const fallback = handleComponentError(instance, createErrorReport(error, 'render', instance));
			if (fallback) {
				instance.errorFallback = fallback;
				output = withEffectScope(instance.scope, () =>
					withComponentDomain(instance.domain, fallback)
				);
			}
		}
	} finally {
		instance.endRender();
	}
	if (instance.runtimeABI & compiledComponentLifecycleABI) {
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
	}
	return normalizeRenderResult(output);
}

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
