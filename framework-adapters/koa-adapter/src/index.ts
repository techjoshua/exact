import {
	cleanupAdapterPreservingPrimary,
	createAdapterLifetime,
	handleExactRequest,
	withAdapterStreamCleanup,
	type ExactDisconnectSource,
	type ExactServerContext
} from '@exactjs/server';

/** Carries the context required by exact koa. */
export type ExactKoaContext = {
	method: string;
	url: string;
	headers?: Record<string, string | string[] | undefined>;
	request: {
		body?: unknown;
		rawBody?: string;
		signal?: AbortSignal;
	};
	req?: ExactDisconnectSource;
	res?: ExactDisconnectSource;
	status: number;
	body: unknown;
	set(name: string, value: string): void;
};

/** Defines the exact koa next type contract. */
export type ExactKoaNext = () => Promise<unknown>;

/** Creates a Koa middleware for an eXact endpoint. */
export function createExactKoaMiddleware(
	context: ExactServerContext
): (ctx: ExactKoaContext, next?: ExactKoaNext) => Promise<void> {
	return async (ctx, next) => {
		const lifetime = createAdapterLifetime(
			[
				...(ctx.req ? ([[ctx.req, 'aborted']] as const) : []),
				...(ctx.res ? ([[ctx.res, 'close']] as const) : [])
			],
			ctx.request.signal
		);
		let result: Awaited<ReturnType<typeof handleExactRequest>>;
		try {
			result = await handleExactRequest(
				{
					method: ctx.method,
					url: ctx.url,
					headers: ctx.headers,
					body: ctx.request.body,
					text: ctx.request.rawBody === undefined ? undefined : async () => ctx.request.rawBody!,
					signal: lifetime.signal,
					platformRequest: ctx
				},
				context
			);
		} catch (error) {
			cleanupAdapterPreservingPrimary(lifetime.cleanup, error);
			throw error;
		}
		if (result.status === 404 && next) {
			lifetime.cleanup();
			await next();
			return;
		}
		ctx.status = result.status;
		for (const [name, value] of Object.entries(result.headers)) ctx.set(name, value);
		ctx.body = result.stream
			? withAdapterStreamCleanup(result.stream, lifetime.cleanup)
			: (result.body ?? '');
		if (!result.stream) lifetime.cleanup();
	};
}

export { createExactKoaMiddleware as createKoaMiddleware };
