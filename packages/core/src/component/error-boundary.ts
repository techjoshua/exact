import type {
	Child,
	Component,
	ComponentInstance,
	ErrorReport,
	RenderFunction,
	RenderResult
} from './contracts.js';

import { createVNode } from '../vnode.js';
import { ErrorContext } from './contexts.js';
import { createErrorContext } from './errors.js';
import { formatError } from './log.js';

/** Values supplied to a custom {@link ErrorBoundary} fallback. */
export type ErrorBoundaryFallbackProps = {
	/** Every error captured since the boundary was last reset. */
	readonly errors: readonly ErrorReport[];
	/** The most recently captured error. */
	readonly error: ErrorReport;
	/** Clears captured errors and remounts the boundary's children. */
	reset(): void;
};

/** Configures the framework-provided error boundary component. */
export type ErrorBoundaryProps = {
	children?: Child | Child[];
	/**
	 * Replacement content shown after a descendant fails. A function receives the captured reports
	 * and a reset operation; a child value is rendered as-is.
	 */
	fallback?: Child | ((props: ErrorBoundaryFallbackProps) => RenderResult);
};

/**
 * Captures descendant component, render, event, lifecycle, reactive, and task errors.
 *
 * Clearing the boundary removes the failed subtree and mounts it again. Errors thrown by the
 * fallback itself are deliberately routed to the next enclosing boundary.
 */
export function ErrorBoundary(this: Component<{}>, props: ErrorBoundaryProps): RenderFunction {
	const errors = createErrorContext();
	errors.boundary = this as ComponentInstance<{}>;
	this.setContext(ErrorContext, errors);

	const reset = () => errors.clearAll();

	return () => {
		const error = errors.errors.at(-1);
		if (!error) return props.children ?? null;

		if (typeof props.fallback === 'function')
			return props.fallback({ errors: errors.errors, error, reset });
		if (props.fallback !== undefined) return props.fallback;

		return createDefaultBoundaryView(errors.errors, reset);
	};
}

function createDefaultBoundaryView(errors: readonly ErrorReport[], reset: () => void): Child {
	return createVNode(
		'section',
		{ role: 'alert', className: 'exact-error-boundary' },
		createVNode('h1', null, 'Application error'),
		...errors.map((error) =>
			createVNode(
				'article',
				{ key: error.id, className: 'exact-error' },
				createVNode('h2', null, error.component?.name ?? 'Framework'),
				createVNode('p', null, `${error.source}${error.phase ? `:${error.phase}` : ''}`),
				createVNode('pre', null, formatError(error.error))
			)
		),
		createVNode('button', { type: 'button', onClick: reset }, 'Try again')
	);
}
