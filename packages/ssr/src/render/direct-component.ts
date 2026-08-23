import { normalizeRenderResult, withComponentDomain, type Child } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';

/** Minimal request-local receiver for compiler-proven synchronous server components. */
type DirectSsrComponentFrame = Readonly<{
	state: Record<string, unknown>;
}>;

/**
 * Executes a compiler-classified synchronous component without constructing durable client
 * ownership. The compiler excludes lifecycle, task, context, collection, resumption, and dynamic
 * capabilities from this lane; encountering a non-function result is therefore an artifact defect.
 */
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	props: Record<string, unknown>
): Child[] | undefined {
	const server = blueprint.contract.definition.server;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	const frame: DirectSsrComponentFrame = { state: {} };
	const render = inComponentDomain(context, () => server.render!.call(frame, props));
	if (typeof render !== 'function')
		throw new TypeError('Compiled synchronous server component did not return its render function');
	return normalizeRenderResult(inComponentDomain(context, () => render()));
}

function inComponentDomain<T>(context: SsrContext, work: () => T): T {
	return context.componentDomain ? withComponentDomain(context.componentDomain, work) : work();
}
