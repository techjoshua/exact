import {
	type AnyComponentInstance,
	createErrorReport,
	handleComponentError,
	type RenderFunction
} from '@exactjs/core';
import { registerSsrConstructionErrorHandler } from './construction-error-capability.js';

/**
 * Routes a failed child construction through its parent without treating the parent as the source.
 */
export function handleSsrConstructionError(
	parent: AnyComponentInstance | undefined,
	error: unknown,
	componentName: string
): RenderFunction | undefined {
	return handleComponentError(
		parent,
		createErrorReport(error, 'construct', parent, componentName),
		null
	);
}

registerSsrConstructionErrorHandler(handleSsrConstructionError);
