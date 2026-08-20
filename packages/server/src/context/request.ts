import { type RequestResponseState } from '@exactjs/request';
import type {
	ExactContextRuntimeConfiguration,
	ExactContextRuntime,
	ExactRequestLike,
	ExactServerContext
} from '../types.js';
import { exactResponseBodyOf } from '../response-body.js';
import {
	applyResponseState,
	disposePreservingPrimary,
	isResponse,
	retainScopeForStream
} from './response.js';
import { ContextRuntime } from './runtime.js';

/** Creates a request lifetime. */
export function createRequestLifetime(...signals: Array<AbortSignal | undefined>): {
	signal: AbortSignal;
	abort(reason?: unknown): void;
	dispose(): void;
} {
	const controller = new AbortController();
	const listeners = new Map<AbortSignal, () => void>();
	for (const signal of signals) {
		if (!signal) continue;
		const abort = () => controller.abort(signal.reason);
		if (signal.aborted) {
			abort();
			break;
		}
		listeners.set(signal, abort);
		signal.addEventListener('abort', abort, { once: true });
	}
	return {
		signal: controller.signal,
		abort(reason) {
			controller.abort(reason);
		},
		dispose() {
			for (const [signal, listener] of listeners) {
				signal.removeEventListener('abort', listener);
			}
			listeners.clear();
		}
	};
}

/** Provides the canonical context runtimes value. */
export const contextRuntimes = new WeakMap<ExactServerContext, ExactContextRuntime>();

/** Creates an exact context runtime. */
export function createExactContextRuntime(
	configuration: ExactContextRuntimeConfiguration = {}
): ExactContextRuntime {
	return new ContextRuntime(configuration);
}

/** Performs the open exact request scope domain operation. */
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
	return {
		context: {
			...server,
			contextRuntime: runtime,
			contexts: opened.context,
			requestContext: opened.request,
			responseState: opened.response,
			platformRequest,
			signal: opened.request.signal
		},
		response: opened.response,
		dispose: opened.dispose
	};
}

/** Runs with exact request scope with the supplied execution context. */
export async function runWithExactRequestScope<T>(
	request: ExactRequestLike,
	server: ExactServerContext,
	work: (context: ExactServerContext) => T | Promise<T>,
	platformRequest: unknown = request
): Promise<T> {
	const opened = await openExactRequestScope(request, server, platformRequest);
	let value: T;
	let releaseAttempted = false;
	try {
		value = await work(opened.context);
	} catch (error) {
		await disposePreservingPrimary(opened.dispose, error);
		throw error;
	}
	try {
		if (isResponse(value) && exactResponseBodyOf(value)) {
			releaseAttempted = true;
			await opened.dispose('eXact buffered response complete');
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
		if (!releaseAttempted) await disposePreservingPrimary(opened.dispose, error);
		throw error;
	}
}
