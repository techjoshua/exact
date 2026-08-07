import { createVNode } from '../vnode.js';
import type { Child, ErrorReport, VNode } from './contracts.js';
import { formatError } from './log.js';

/** Options for the framework's shared default error-report presentation. */
export type DefaultErrorViewOptions = {
	readonly componentFallback?: string;
	readonly actions?: readonly Child[];
};

/** Creates the common framework error report list with caller-owned optional actions. */
export function createDefaultErrorView(
	errors: Iterable<ErrorReport>,
	options: DefaultErrorViewOptions = {}
): VNode {
	return createVNode(
		'section',
		{ role: 'alert', className: 'exact-error-boundary' },
		createVNode('h1', null, 'Application error'),
		...Array.from(errors, (error) =>
			createVNode(
				'article',
				{ key: error.id, className: 'exact-error' },
				createVNode('h2', null, error.component?.name ?? options.componentFallback ?? 'Framework'),
				createVNode('p', null, `${error.source}${error.phase ? `:${error.phase}` : ''}`),
				createVNode('pre', null, formatError(error.error))
			)
		),
		...(options.actions ?? [])
	);
}
