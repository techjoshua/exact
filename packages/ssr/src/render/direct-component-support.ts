import {
	type AnyComponentFunction,
	type AnyComponentInstance,
	type ContextToken,
	type Reactive,
	type ReactiveValue,
	type Child
} from '@exactjs/core';
import {
	callWithComponentDomain,
	withComponentDomain
} from '@exactjs/core/framework/component-domains';
import {
	createCompiledFragmentReceipt,
	createCompiledKeyedChildReceipt
} from '@exactjs/core/runtime/component-operations';
import type { DirectServerContextOwner } from '@exactjs/core/framework/server-component-contexts';
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
	DirectServerContextOwner &
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

/** Executes component work in the request's error and inspection domain when present. */
export function inComponentDomain<T>(context: SsrContext, work: () => T): T {
	return context.componentDomain ? withComponentDomain(context.componentDomain, work) : work();
}

/** Calls one synchronous component function without allocating a domain adapter closure. */
export function callInComponentDomain<Receiver, Argument, Result>(
	context: SsrContext,
	work: (this: Receiver, argument: Argument) => Result,
	receiver: Receiver,
	argument: Argument
): Result {
	return context.componentDomain
		? callWithComponentDomain(context.componentDomain, work, receiver, argument)
		: work.call(receiver, argument);
}

/** Materializes a compiler-generated keyed-list fallback without retained registration. */
function directSsrMap<T>(
	collection: Iterable<T> | ReactiveValue<Iterable<T>>,
	key: (item: T) => string,
	render: (item: T) => Child,
	id?: string
): object {
	return createCompiledFragmentReceipt(
		{ key: id },
		...[...(unwrap(collection) as Iterable<T>)].map((item) =>
			createCompiledKeyedChildReceipt(render(item), key(item))
		)
	);
}
