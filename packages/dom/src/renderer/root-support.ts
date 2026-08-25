import {
	createErrorContext,
	ErrorContext,
	type AnyComponentInstance,
	type Component,
	type ComponentFunction,
	type ErrorContextValue,
	type ErrorReport,
	type VNode
} from '@exactjs/core';
import { createExactCompiledDynamicBoundaryArtifact } from '@exactjs/core/framework/runtime-component-artifacts';
import { createDefaultErrorView } from '@exactjs/core/framework/error-view';
import { namespaceForTag } from '../namespace.js';
import type { RenderOptions, Root } from '../types.js';

/** Creates a root boundary. */
export function createRootBoundary(root: Root): ComponentFunction<{}, { version: number }> {
	return createExactCompiledDynamicBoundaryArtifact(
		function RootBoundary(this: Component<{}>, props: { version: number }) {
			(this as AnyComponentInstance).contexts.set(ErrorContext.id, root.errors);

			return () => {
				void props.version;
				return root.errors.errors.length ? createRootErrorView(root.errors.errors) : root.current;
			};
		},
		'@exactjs/dom:RootBoundary',
		'client'
	);
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
	return createDefaultErrorView(errors, { componentFallback: 'Application' });
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
