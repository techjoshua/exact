import type {
	Plugin,
	Request,
	ResponseObject,
	ResponseToolkit,
	RouteOptions,
	RouteOptionsPayload
} from '@hapi/hapi';
import { handleExactRequest, type ExactServerContext } from '@exactjs/server';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

const defaultMaxRequestBytes = 4 * 1024 * 1024;

/** The Hapi request accepted by an eXact endpoint handler. */
export type ExactHapiRequest = Request;

/** The Hapi response toolkit accepted by an eXact endpoint handler. */
export type ExactHapiToolkit = ResponseToolkit;

/** The Hapi response returned by an eXact endpoint handler. */
export type ExactHapiResponse = ResponseObject;

/** Configures the Hapi route registered by the eXact plugin. */
export type ExactHapiPluginOptions = {
	runtime: ExactServerContext;
	/**
	 * Hapi route options such as auth, CORS, tags, validation, and timeouts.
	 * The plugin owns the handler and buffered payload parsing contract.
	 */
	routeOptions?: Omit<RouteOptions, 'handler' | 'payload'>;
	/**
	 * Additional Hapi payload settings. eXact always uses parsed, buffered payloads,
	 * so `output` and `parse` are intentionally controlled by the adapter.
	 */
	payload?: Omit<RouteOptionsPayload, 'output' | 'parse'>;
};

/**
 * Registers the eXact endpoint declared by `runtime.manifest.endpoint`.
 *
 * The plugin may be registered more than once when a Hapi server hosts distinct
 * eXact runtimes with distinct manifest endpoints.
 */
export const exactHapiPlugin: Plugin<ExactHapiPluginOptions> = {
	name: '@exactjs/hapi-adapter',
	version: '0.1.0',
	multiple: true,
	requirements: {
		hapi: '>=21 <22'
	},
	register(server, options) {
		const endpoint = options.runtime.manifest.endpoint ?? '/__exact';
		if (!endpoint.startsWith('/')) {
			throw new Error(
				`eXact Hapi endpoint must be an absolute path, received ${JSON.stringify(endpoint)}`
			);
		}
		server.route({
			method: 'POST',
			path: endpoint,
			options: {
				...options.routeOptions,
				payload: {
					output: 'data',
					parse: true,
					allow: 'application/json',
					maxBytes: exactMaxRequestBytes(options.runtime),
					...options.payload
				}
			},
			handler: createExactHapiHandler(options.runtime)
		});
	}
};

/** Creates a Hapi route handler for an eXact endpoint. */
export function createExactHapiHandler(
	context: ExactServerContext
): (request: Request, h: ResponseToolkit) => Promise<ResponseObject> {
	return async (request, h) => {
		const disconnect = createHapiDisconnect(request);
		try {
			const result = await handleExactRequest(
				{
					method: request.method,
					url: request.url.href,
					headers: request.headers as Record<string, string | string[] | undefined>,
					body: request.payload,
					signal: disconnect.signal,
					platformRequest: request
				},
				context
			);
			const body = result.stream
				? createHapiResponseStream(result.stream, disconnect)
				: (result.body ?? '');
			const response = h.response(body).code(result.status);
			for (const [name, value] of Object.entries(result.headers)) response.header(name, value);
			if (!result.stream) disconnect.cleanup();
			return response;
		} catch (error) {
			disconnect.cleanup();
			throw error;
		}
	};
}

type HapiDisconnect = {
	signal: AbortSignal;
	cleanup(): void;
};

function createHapiDisconnect(request: Request): HapiDisconnect {
	const controller = new AbortController();
	const disconnect = () =>
		controller.abort(new DOMException('Hapi client disconnected', 'AbortError'));
	request.events.once('disconnect', disconnect);
	request.raw.req.once('aborted', disconnect);
	request.raw.res.once('close', disconnect);
	let cleaned = false;
	return {
		signal: controller.signal,
		cleanup() {
			if (cleaned) return;
			cleaned = true;
			request.events.off('disconnect', disconnect);
			request.raw.req.off('aborted', disconnect);
			request.raw.res.off('close', disconnect);
		}
	};
}

function createHapiResponseStream(
	stream: ReadableStream<Uint8Array>,
	disconnect: HapiDisconnect
): Readable {
	const readable = Readable.fromWeb(stream as NodeReadableStream<Uint8Array>, {
		signal: disconnect.signal
	});
	let cleaned = false;
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		disconnect.cleanup();
		readable.off('end', cleanup);
		readable.off('error', cleanup);
		readable.off('close', cleanup);
	};
	readable.once('end', cleanup);
	readable.once('error', cleanup);
	readable.once('close', cleanup);
	return readable;
}

function exactMaxRequestBytes(context: ExactServerContext): number {
	const configured = context.limits?.maxRequestBytes;
	return configured && Number.isFinite(configured) && configured > 0
		? configured
		: defaultMaxRequestBytes;
}

export { createExactHapiHandler as createHapiHandler };
export { exactHapiPlugin as hapiPlugin };
