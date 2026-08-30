import type {
	Child,
	Component,
	ComponentInstance,
	ErrorReport,
	RenderFunction,
	RenderResult
} from './contracts.js';

import { createCompiledIntrinsicReceipt } from '../component-abi/intrinsic-receipt.js';
import { ErrorContext } from './contexts.js';
import { createErrorContext } from './errors.js';
import { createDefaultErrorView } from './error-view.js';

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

	return () => renderErrorBoundary(errors.errors, props, reset);
}

function renderErrorBoundary(
	errors: readonly ErrorReport[],
	props: ErrorBoundaryProps,
	reset: () => void
): RenderResult {
	const error = errors.at(-1);
	if (!error) return props.children ?? null;
	if (typeof props.fallback === 'function') return props.fallback({ errors, error, reset });
	if (props.fallback !== undefined) return props.fallback;
	return createDefaultBoundaryView(errors, reset);
}

function createDefaultBoundaryView(errors: readonly ErrorReport[], reset: () => void): Child {
	return createDefaultErrorView(errors, {
		actions: [
			createCompiledIntrinsicReceipt('button', { type: 'button', onClick: reset }, 'Try again')
		]
	});
}
