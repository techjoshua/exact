import {
	createErrorContext,
	createVNode,
	ErrorContext,
	markExactComponent,
	type Component,
	type ComponentFunction,
	type ErrorContextValue,
	type ErrorReport,
	type VNode
} from '@exactjs/core';
import { formatError } from '../debug.js';
import { namespaceForTag } from '../namespace.js';
import type { RenderOptions, Root } from '../types.js';

/** Creates a root boundary. */
export function createRootBoundary(root: Root): ComponentFunction<{}, { version: number }> {
	return markExactComponent(function RootBoundary(this: Component<{}>, props: { version: number }) {
		this.setContext(ErrorContext, root.errors);

		return () => {
			void props.version;
			return root.errors.errors.length ? createRootErrorView(root.errors.errors) : root.current;
		};
	}, '@exactjs/dom:RootBoundary');
}

/** Creates a dom error context. */
export function createDomErrorContext(options: RenderOptions): ErrorContextValue {
	const base = createErrorContext();
	if (!options.onErrorReport) return base;
	return {
		...base,
		report(error, reportOptions) {
			const report = base.report(error, reportOptions);
			options.onErrorReport?.(report);
			return report;
		}
	};
}

/** Creates a root error view. */
export function createRootErrorView(errors: ErrorReport[]): VNode {
	const reports: ErrorReport[] = [];
	for (let index = 0; index < errors.length; index++) {
		reports.push(errors[index]!);
	}
	return createVNode(
		'section',
		{ role: 'alert', className: 'exact-error-boundary' },
		createVNode('h1', null, 'Application error'),
		...reports.map((error) =>
			createVNode(
				'article',
				{ key: error.id, className: 'exact-error' },
				createVNode('h2', null, error.component?.name ?? 'Application'),
				createVNode('p', null, `${error.source}${error.phase ? `:${error.phase}` : ''}`),
				createVNode('pre', null, formatError(error.error))
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
		| 'dynamic'
		| 'enhancement'
		| 'enhancement-end'
		| 'fragment'
		| 'portal'
		| 'suspense'
		| 'suspense-end'
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
