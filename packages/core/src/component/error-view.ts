import { createCompiledIntrinsicReceipt } from '../component-abi/intrinsic-receipt.js';
import type { Child, ErrorReport } from './contracts.js';
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
): Child {
	return createCompiledIntrinsicReceipt(
		'section',
		{ role: 'alert', className: 'exact-error-boundary' },
		createCompiledIntrinsicReceipt('h1', null, 'Application error'),
		...Array.from(errors, (error) =>
			createCompiledIntrinsicReceipt(
				'article',
				{ key: error.id, className: 'exact-error' },
				createCompiledIntrinsicReceipt(
					'h2',
					null,
					error.component?.name ?? options.componentFallback ?? 'Framework'
				),
				createCompiledIntrinsicReceipt(
					'p',
					null,
					`${error.source}${error.phase ? `:${error.phase}` : ''}`
				),
				createCompiledIntrinsicReceipt('pre', null, formatError(error.error))
			)
		),
		...(options.actions ?? [])
	);
}
