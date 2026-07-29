import {
	createErrorReport,
	handleComponentError,
	type ComponentInstance,
	type RenderFunction
} from '@exactjs/core';

/**
 * Routes a failed child construction through its parent without treating the parent as the source.
 */
export function handleSsrConstructionError(
	parent: ComponentInstance<any> | undefined,
	error: unknown,
	componentName: string
): RenderFunction | undefined {
	return handleComponentError(
		parent,
		createErrorReport(error, 'construct', parent, componentName),
		null
	);
}
