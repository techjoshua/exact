import {
	Fragment,
	createVNode,
	withComponentDomain,
	type AnyComponentFunction,
	type AnyComponentInstance,
	type ContextToken,
	type Reactive,
	type ReactiveValue,
	type VNode
} from '@exactjs/core';
import type { ComponentContextOwner } from '@exactjs/core/framework/server-component-contexts';
import type { ComponentLogOwner } from '@exactjs/core/runtime/logging';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { SsrContext } from '../types.js';

/** Minimal request-local receiver for compiler-proven server components. */
export type DirectSsrComponentFrame = Readonly<{
	state: Record<string, unknown>;
	map: typeof directSsrMap;
}>;

/** Context-bearing direct frame linked only into artifacts that use the component context API. */
export type DirectSsrContextFrame = DirectSsrComponentFrame &
	ComponentContextOwner &
	Readonly<{
		type: AnyComponentFunction;
		id: string;
		mounted: false;
		contextTokens: Map<symbol, ContextToken<unknown>>;
		hasContext(token: ContextToken<unknown>): boolean;
		getContext<T>(token: ContextToken<T>): Reactive<T>;
		setContext<T>(token: ContextToken<T>, value: T): void;
	}>;

/** Logging-bearing direct frame without durable state, effects, contexts, or lifecycle storage. */
export type DirectSsrLoggingFrame = DirectSsrComponentFrame & ComponentLogOwner;

/** Optional lifecycle lane linked only from artifacts that register server-visible callbacks. */
export type DirectSsrLifecycleCapability = Readonly<{
	rendered(frame: DirectSsrComponentFrame, duration: number): void;
	dispose(frame: DirectSsrComponentFrame, reason: string): void | Promise<void>;
}>;

/** Artifact-linked constructor for one target-specialized direct server frame. */
export type DirectSsrComponentFrameConstructor = (
	context: SsrContext,
	type: AnyComponentFunction,
	componentId: string,
	parent: AnyComponentInstance | undefined
) => DirectSsrComponentFrame;

/** Creates the request-local receiver shared by synchronous and scheduled direct lanes. */
export function createDirectSsrComponentFrame(): DirectSsrComponentFrame {
	return { state: {}, map: directSsrMap };
}

/** Adapts a compiler-linked context frame to the renderer's logical ownership boundary. */
export function directSsrContextOwner(frame: DirectSsrComponentFrame): AnyComponentInstance {
	return frame as unknown as AnyComponentInstance;
}

/** Resolves compiler-emitted expression props without allocating the general readonly proxy. */
export function directSsrProps(rawProps: Record<string, unknown>): Record<string, unknown> {
	let resolved = rawProps;
	for (const key of Object.keys(rawProps)) {
		if (key === 'children') continue;
		const value = unwrap(rawProps[key]);
		if (Object.is(value, rawProps[key])) continue;
		if (resolved === rawProps) resolved = { ...rawProps };
		resolved[key] = value;
	}
	return resolved;
}

/** Executes component work in the request's error and inspection domain when present. */
export function inComponentDomain<T>(context: SsrContext, work: () => T): T {
	return context.componentDomain ? withComponentDomain(context.componentDomain, work) : work();
}

/** Materializes a compiler-generated keyed-list fallback without retained registration. */
function directSsrMap<T>(
	collection: Iterable<T> | ReactiveValue<Iterable<T>>,
	key: (item: T) => string,
	render: (item: T) => VNode,
	id?: string
): VNode {
	return createVNode(Fragment, {
		key: id,
		list: { collection: unwrap(collection) as Iterable<T>, key, render }
	});
}
