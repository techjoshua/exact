export {
	adaptReactType as adaptReactComponent,
	exactComponentForReactInstance,
	isUnmountedReactClassInstance,
	ReactCacheContext,
	reactCompatibilityTarget,
	ReactRootContext,
	recordReactResourceHint,
	toExactNode,
	type ReactCacheScope,
	type ReactRootRuntime
} from './internals.js';
import type { Component } from '@exact/core';
import { adaptReactType, toExactNode } from './internals.js';
import type { ReactComponentType, ReactNode } from './types.js';

export function ReactHost(
	this: Component<Record<string, unknown>>,
	props: {
		component: ReactComponentType<any>;
		componentProps?: Record<string, unknown>;
		children?: ReactNode;
	}
) {
	const Adapted = adaptReactType(props.component);
	return () => ({
		type: Adapted,
		props: {
			...(props.componentProps ?? {}),
			...(props.children === undefined ? {} : { children: props.children })
		},
		children: []
	});
}

export function exactNode(node: ReactNode) {
	return toExactNode(node);
}
