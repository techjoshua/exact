import {
	createErrorContext,
	type Child,
	type ErrorContextValue,
	type ErrorReport
} from '@exactjs/core';
import { formatError } from '@exactjs/core/framework/error-format';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import { namespaceForTag } from '../namespace.js';
import type { RenderOptions, Root } from '../types.js';

/** Creates a dom error context. */
export function createDomErrorContext(
	options: RenderOptions,
	onReport?: (errors: readonly ErrorReport[]) => void
): ErrorContextValue {
	const base = createErrorContext();
	return {
		...base,
		report(error, reportOptions) {
			const report = base.report(error, reportOptions);
			options.onErrorReport?.(report);
			onReport?.(base.errors);
			return report;
		}
	};
}

/** Creates a root error view. */
export function createRootErrorView(errors: ErrorReport[]): Child {
	return createCompiledIntrinsicReceipt(
		'section',
		{ role: 'alert', className: 'exact-error-boundary' },
		createCompiledIntrinsicReceipt('h1', null, 'Application error'),
		...errors.map((error) =>
			createCompiledIntrinsicReceipt(
				'article',
				{ key: error.id, className: 'exact-error' },
				createCompiledIntrinsicReceipt('h2', null, error.component?.name ?? 'Application'),
				createCompiledIntrinsicReceipt(
					'p',
					null,
					`${error.source}${error.phase ? `:${error.phase}` : ''}`
				),
				createCompiledIntrinsicReceipt('pre', null, formatError(error.error))
			)
		)
	);
}

/** Creates a marker. */
export function createMarker(
	root: Root,
	label:
		| 'activity'
		| 'activity-end'
		| 'cell'
		| 'component'
		| 'compatibility-contribution'
		| 'dynamic'
		| 'enhancement'
		| 'enhancement-end'
		| 'fragment'
		| 'portal'
		| 'root'
		| 'suspense'
		| 'suspense-end'
		| 'target'
): Node {
	return root.debugMarkers ? document.createComment(`exact-${label}`) : document.createTextNode('');
}

/** Creates an element. */
export function createElement(
	tag: string,
	parent?: Node,
	props?: Record<string, unknown>
): Element {
	const parentElement = parent instanceof Element ? parent : undefined;
	const namespace = namespaceForTag(tag, parentElement);
	const element = namespace
		? document.createElementNS(namespace, tag)
		: document.createElement(tag);
	// annotation-xml's encoding determines the namespace of its children, so it
	// must exist before child elements are constructed.
	if (
		namespace === 'http://www.w3.org/1998/Math/MathML' &&
		tag === 'annotation-xml' &&
		typeof props?.encoding === 'string'
	)
		element.setAttribute('encoding', props.encoding);
	return element;
}
