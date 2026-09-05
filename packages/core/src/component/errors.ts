import type {
	AnyComponentInstance,
	ErrorContextValue,
	ErrorReport,
	ErrorReportOptions,
	ErrorSource,
	ReadinessRegistration,
	RenderFunction,
	SuspensionContextValue
} from './contracts.js';

import { ErrorContext, SuspensionContext } from './contexts.js';

import { batch, unwrap } from '@exactjs/reactive/framework/runtime';
import { reactiveObjects } from '@exactjs/reactive/framework/objects';
import { componentLogMethod, componentLogScope, isErrorReport, logFrameworkEvent } from './log.js';
import { createDefaultErrorView } from './error-view.js';

let nextErrorId = 1;

/** Creates the default reactive error context used by app and framework error boundaries. */
export function createErrorContext(errors: ErrorReport[] = []): ErrorContextValue {
	return createErrorContextWithLimit(errors);
}

function createErrorContextWithLimit(
	errors: ErrorReport[],
	maxReports?: number
): ErrorContextValue {
	const reactiveErrors = reactiveObjects(errors);

	return {
		errors: reactiveErrors,
		report(error, options) {
			const report = isErrorReport(error) ? error : createErrorReportFromOptions(error, options);
			batch(() => {
				reactiveErrors.push(report);
				if (maxReports !== undefined && reactiveErrors.length > maxReports)
					reactiveErrors.splice(0, reactiveErrors.length - maxReports);
			});
			return report;
		},
		clear(error) {
			const id = typeof error === 'string' ? error : error.id;
			const index = reactiveErrors.findIndex((item) => item.id === id);
			if (index >= 0) reactiveErrors.splice(index, 1);
		},
		clearAll() {
			reactiveErrors.splice(0, reactiveErrors.length);
		}
	};
}

/** Creates a structured error report for component or framework failures. */
export function createErrorReport(
	error: unknown,
	source: ErrorSource,
	component?: AnyComponentInstance,
	phase?: string
): ErrorReport {
	return {
		id: `e${nextErrorId++}`,
		error,
		source,
		component: component ? componentLogScope(component).component : undefined,
		phase
	};
}

function createErrorReportFromOptions(
	error: unknown,
	options: ErrorReportOptions = {}
): ErrorReport {
	return {
		id: `e${nextErrorId++}`,
		error,
		source: options.source ?? 'component',
		component: options.component,
		phase: options.phase
	};
}

/** Routes a component error to the nearest error context or installs the default fallback view. */
export function handleComponentError(
	instance: AnyComponentInstance | undefined,
	event: ErrorReport,
	errorOwner: AnyComponentInstance | null | undefined = instance
): RenderFunction | undefined {
	let cursor = instance;
	while (cursor) {
		if (cursor.contexts.has(ErrorContext.id)) {
			const context = unwrap(cursor.contexts.get(ErrorContext.id)) as ErrorContextValue;
			if (context.boundary === errorOwner) {
				cursor = cursor.parent;
				continue;
			}
			context.report(event);
			(context.boundary ?? cursor).invalidate?.();
			return undefined;
		}
		cursor = cursor.parent;
	}
	const ambient = instance?.ambientContexts?.get(ErrorContext.id);
	if (ambient) {
		const context = unwrap(ambient) as ErrorContextValue;
		if (context.boundary !== errorOwner) {
			context.report(event);
			if (instance)
				componentLogMethod(
					instance,
					'error'
				)?.(() => [
					'root error context handled failure',
					event.error,
					{ source: event.source, phase: event.phase, component: event.component }
				]);
			return undefined;
		}
	}

	const context = defaultErrorContext;
	context.report(event);
	const fallback = () => createDefaultErrorView(context.errors);
	if (instance) {
		instance.errorFallback = fallback;
		instance.invalidate?.();
		componentLogMethod(
			instance,
			'error'
		)?.(() => [
			'root error context handled failure',
			event.error,
			{
				source: event.source,
				phase: event.phase,
				component: event.component
			}
		]);
	} else {
		logFrameworkEvent('error', 'core', event.source, 'root error context handled failure', {
			phase: event.phase,
			component: event.component
		});
	}
	return fallback;
}

/** Routes a thrown promise to the nearest async rendering boundary. */
export function handleComponentSuspension(
	instance: AnyComponentInstance | undefined,
	promise: PromiseLike<unknown>
): boolean {
	return registerComponentSuspension(instance, promise) !== false;
}

/** Registers a thrown promise and exposes renderer-owned cancellation when the boundary supports it. */
export function registerComponentSuspension(
	instance: AnyComponentInstance | undefined,
	promise: PromiseLike<unknown>
): ReadinessRegistration | true | false {
	let cursor = instance;
	while (cursor) {
		if (cursor.contexts.has(SuspensionContext.id)) {
			const context = unwrap(cursor.contexts.get(SuspensionContext.id)) as SuspensionContextValue;
			return context.suspend(promise) ?? true;
		}
		cursor = cursor.parent;
	}
	return false;
}

/** Provides the canonical default error context value. */
export const defaultErrorContext = /* @__PURE__ */ createErrorContextWithLimit([], 100);
