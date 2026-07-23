import type {
	Child,
	ComponentInstance,
	ErrorContextValue,
	ErrorReport,
	ErrorReportOptions,
	ErrorSource,
	RenderFunction,
	RenderResult,
	SuspensionContextValue,
	VNode
} from './contracts.js';

import { ErrorContext, SuspensionContext } from './contexts.js';

import { reactive, unwrap } from '@exactjs/reactive';
import { createVNode, normalizeChildren } from '../vnode.js';
import { componentLogScope, formatError, isErrorReport, logFrameworkEvent } from './log.js';

let nextErrorId = 1;

/** Creates the default reactive error context used by app and framework error boundaries. */
export function createErrorContext(errors: ErrorReport[] = []): ErrorContextValue {
	const reactiveErrors = reactive(errors);

	return {
		errors: reactiveErrors,
		report(error, options) {
			const report = isErrorReport(error) ? error : createErrorReportFromOptions(error, options);
			reactiveErrors.push(report);
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

function createDefaultErrorView(errors: Iterable<ErrorReport>): VNode {
	return createVNode(
		'section',
		{ role: 'alert', className: 'exact-error-boundary' },
		createVNode('h1', null, 'Application error'),
		...Array.from(errors).map((error) =>
			createVNode(
				'article',
				{ key: error.id, className: 'exact-error' },
				createVNode('h2', null, error.component?.name ?? 'Framework'),
				createVNode('p', null, `${error.source}${error.phase ? `:${error.phase}` : ''}`),
				createVNode('pre', null, formatError(error.error))
			)
		)
	);
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
	event: ErrorReport
): RenderFunction | undefined {
	let cursor = instance;
	while (cursor) {
		if (cursor.contexts.has(ErrorContext.id)) {
			const context = unwrap(cursor.contexts.get(ErrorContext.id)) as ErrorContextValue;
			if (context.boundary === instance) {
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
export const defaultErrorContext = createErrorContext();
