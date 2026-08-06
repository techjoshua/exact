import type {
	Child,
	ComponentInstance,
	ErrorContextValue,
	ErrorReport,
	ErrorReportOptions,
	ErrorSource,
	RenderFunction,
	RenderResult,
	SuspensionContextValue
} from './contracts.js';

import { ErrorContext, SuspensionContext } from './contexts.js';

import { batch, reactive, unwrap } from '@exactjs/reactive';
import { normalizeChildren } from '../vnode.js';
import { componentLogScope, isErrorReport, logFrameworkEvent } from './log.js';
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
	const reactiveErrors = reactive(errors);

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
	component?: ComponentInstance<any>,
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
	instance: ComponentInstance<any> | undefined,
	event: ErrorReport,
	errorOwner: ComponentInstance<any> | null | undefined = instance
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
			cursor.invalidate?.();
			return undefined;
		}
		cursor = cursor.parent;
	}

	const context = defaultErrorContext;
	context.report(event);
	const fallback = () => createDefaultErrorView(context.errors);
	if (instance) {
		instance.errorFallback = fallback;
		instance.invalidate?.();
		instance.log.error('root error context handled failure', event.error, {
			source: event.source,
			phase: event.phase,
			component: event.component
		});
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
	instance: ComponentInstance<any> | undefined,
	promise: PromiseLike<unknown>
): boolean {
	let cursor = instance;
	while (cursor) {
		if (cursor.contexts.has(SuspensionContext.id)) {
			const context = unwrap(cursor.contexts.get(SuspensionContext.id)) as SuspensionContextValue;
			context.suspend(promise);
			return true;
		}
		cursor = cursor.parent;
	}
	return false;
}

/** Normalizes any component render result into a flat child array. */
export function normalizeRenderResult(result: RenderResult): Child[] {
	return Array.isArray(result) ? normalizeChildren(result) : normalizeChildren([result]);
}

/** Provides the canonical default error context value. */
export const defaultErrorContext = createErrorContextWithLimit([], 100);
