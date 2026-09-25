import {
	cleanupAdapterPreservingPrimary,
	consumeExactResponseBody,
	createAdapterLifetime,
	handleExactRequest,
	withAdapterStreamCleanup,
	type ExactDisconnectSource,
	type ExactServerContext
} from '@exactjs/server';

/** Defines the exact fastify request type contract. */
export type ExactFastifyRequest = {
	method: string;
	url: string;
	headers?: Record<string, string | string[] | undefined>;
	body?: unknown;
	raw?: ExactDisconnectSource;
	signal?: AbortSignal;
};

/** Defines the exact fastify reply type contract. */
export type ExactFastifyReply = {
	code(status: number): ExactFastifyReply;
	header(name: string, value: string | string[]): ExactFastifyReply;
	send(body: unknown): unknown;
	raw?: ExactDisconnectSource;
};

/** Creates a Fastify route handler for an eXact endpoint. */
export function createExactFastifyHandler(
	context: ExactServerContext
): (request: ExactFastifyRequest, reply: ExactFastifyReply) => Promise<unknown> {
	return async (request, reply) => {
		const lifetime = createAdapterLifetime(
			[
				...(request.raw ? ([[request.raw, 'aborted']] as const) : []),
				...(reply.raw ? ([[reply.raw, 'close']] as const) : [])
			],
			// Fastify's prototype signal observes request-body close, which is not the end
			// of a streamed response. Preserve explicitly supplied own signals only.
			Object.hasOwn(request, 'signal') ? request.signal : undefined
		);
		let result: Awaited<ReturnType<typeof handleExactRequest>>;
		try {
			result = await handleExactRequest(
				{
					method: request.method,
					url: request.url,
					headers: request.headers,
					body: request.body,
					signal: lifetime.signal,
					platformRequest: request
				},
				context
			);
		} catch (error) {
			cleanupAdapterPreservingPrimary(lifetime.cleanup, error);
			throw error;
		}
		reply.code(result.status);
		for (const [name, value] of Object.entries(result.headers)) reply.header(name, value);
		if (result.setCookies?.length) reply.header('set-cookie', [...result.setCookies]);
		const selected = consumeExactResponseBody(result);
		const body =
			selected === null || typeof selected === 'string'
				? selected
				: withAdapterStreamCleanup(selected, lifetime.cleanup);
		try {
			return reply.send(body);
		} finally {
			if (selected === null || typeof selected === 'string') lifetime.cleanup();
		}
	};
}

export { createExactFastifyHandler as createFastifyHandler };
