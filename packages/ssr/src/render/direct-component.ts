import {
	Fragment,
	createVNode,
	normalizeRenderResult,
	unwrap,
	withComponentDomain,
	type Child,
	type ReactiveValue,
	type VNode
} from '@exactjs/core';
import type { DirectSsrComponentSnapshot, SsrContext } from '../types.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';

/** Minimal request-local receiver for compiler-proven synchronous server components. */
type DirectSsrComponentFrame = Readonly<{
	state: Record<string, unknown>;
	map: typeof directSsrMap;
}>;

/** Completed setup and render result awaiting successful descendant serialization. */
export type DirectSsrComponentResult = Readonly<{
	children: Child[];
	props: Record<string, unknown>;
	snapshot: DirectSsrComponentSnapshot;
}>;

/**
 * Executes a compiler-classified synchronous component without constructing durable client
 * ownership. The compiler excludes lifecycle, task, context, authored-list, and dynamic
 * capabilities from this lane; encountering a non-function result is therefore an artifact defect.
 */
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>
): DirectSsrComponentResult | undefined {
	const server = blueprint.contract.definition.server;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	const frame: DirectSsrComponentFrame = { state: {}, map: directSsrMap };
	const props = directSsrProps(rawProps);
	const render = inComponentDomain(context, () => server.render!.call(frame, props));
	if (typeof render !== 'function')
		throw new TypeError('Compiled synchronous server component did not return its render function');
	return {
		children: normalizeRenderResult(inComponentDomain(context, () => render())),
		props,
		snapshot: {
			componentId: blueprint.componentId,
			contract: blueprint.contract,
			state: frame.state
		}
	};
}

/** Materializes a compiler-generated keyed-list fallback without caches or retained registration. */
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

/** Resolves compiler-emitted expression props without allocating the general readonly proxy. */
function directSsrProps(rawProps: Record<string, unknown>): Record<string, unknown> {
	let resolved = rawProps;
	for (const key of Object.keys(rawProps)) {
		// Component children are an owned VNode graph, matching the general props passthrough rule.
		if (key === 'children') continue;
		const value = unwrap(rawProps[key]);
		if (Object.is(value, rawProps[key])) continue;
		if (resolved === rawProps) resolved = { ...rawProps };
		resolved[key] = value;
	}
	return resolved;
}

function inComponentDomain<T>(context: SsrContext, work: () => T): T {
	return context.componentDomain ? withComponentDomain(context.componentDomain, work) : work();
}
