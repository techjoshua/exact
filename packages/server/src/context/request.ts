import { deriveRuntimeConfiguration as deriveServerContext } from '@exactjs/core/framework/configuration';
import { type RequestResponseState } from '@exactjs/request';
import type {
	ExactContextRuntimeConfiguration,
	ExactContextRuntime,
	ExactRequestLike,
	ExactServerContext
} from '../types.js';
import { exactResponseBodyOf } from '../response/body.js';
import {
	applyResponseState,
	disposePreservingPrimary,
	isResponse,
	retainScopeForStream
} from './response.js';
import { ContextRuntime } from './runtime.js';

/** Provides the canonical context runtimes value. */
export const contextRuntimes = new WeakMap<ExactServerContext, ExactContextRuntime>();

/**
 * Owns application contexts and isolated request scopes for a custom server host.
 * Opening a scope initializes its request contexts. Cancellation preserves the signal's exact
 * reason, including null. Dispose the runtime to release application and active request resources.
 */
export function createExactContextRuntime(
	configuration: ExactContextRuntimeConfiguration = {}
): ExactContextRuntime {
	return new ContextRuntime(configuration);
}

/**
 * Opens a request-owned context view with local overrides and retained server configuration.
 * Dispose the returned scope after work completes. Configuration capture failure closes any
 * newly opened resources and preserves the original thrown value.
 */
export async function openExactRequestScope(
	request: ExactRequestLike,
	server: ExactServerContext,
	platformRequest: unknown = request
): Promise<{
	context: ExactServerContext;
	response: RequestResponseState;
	dispose(reason?: unknown): Promise<void>;
}> {
	if (server.requestContext && server.contexts) {
		return {
			context: server,
			response: server.responseState ?? { headers: new Headers(), committed: false },
			async dispose() {}
		};
	}
	let runtime = server.contextRuntime ?? contextRuntimes.get(server);
	if (!runtime) {
		runtime = createExactContextRuntime(server);
		contextRuntimes.set(server, runtime);
	}
	const opened = await runtime.open(request, platformRequest);
	try {
		return {
			context: deriveServerContext(server, () => ({
				contextRuntime: runtime,
				contexts: opened.context,
				requestContext: opened.request,
				responseState: opened.response,
				platformRequest,
				signal: opened.request.signal
			})),
			response: opened.response,
			dispose: opened.dispose
		};
	} catch (error) {
		await disposePreservingPrimary(opened.dispose, error);
		throw error;
	}
}

/**
 * Runs work in an isolated request scope and releases its resources after completion.
 * A returned stream retains that scope until completion or cancellation, preserving the signal's
 * exact abort reason. Ordinary buffered results release their scope before this promise resolves.
 */
export async function runWithExactRequestScope<T>(
	request: ExactRequestLike,
	server: ExactServerContext,
	work: (context: ExactServerContext) => T | Promise<T>,
	platformRequest: unknown = request
): Promise<T> {
	const opened = await openExactRequestScope(request, server, platformRequest);
	let value: T;
	let releaseAttempted = false;
	let retainedBody: ReturnType<typeof exactResponseBodyOf>;
	try {
		value = await work(opened.context);
	} catch (error) {
		await disposePreservingPrimary(opened.dispose, error);
		throw error;
	}
	try {
		if (isResponse(value) && exactResponseBodyOf(value)) {
			const body = exactResponseBodyOf(value)!;
			if (body.retainRequestScope) {
				body.retainRequestScope(opened.dispose, opened.context.signal);
				retainedBody = body;
				releaseAttempted = true;
			} else {
				releaseAttempted = true;
				await opened.dispose('eXact buffered response complete');
			}
		} else if (isResponse(value) && value.stream) {
			value = {
				...value,
				stream: retainScopeForStream(value.stream, opened.dispose, opened.context.signal)
			} as T;
		} else {
			releaseAttempted = true;
			await opened.dispose('eXact request complete');
		}
		if (isResponse(value)) applyResponseState(value, opened.response);
		return value;
	} catch (error) {
		if (retainedBody) await disposePreservingPrimary(retainedBody.cancel.bind(retainedBody), error);
		else if (!releaseAttempted) await disposePreservingPrimary(opened.dispose, error);
		throw error;
	}
}
