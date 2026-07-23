import { handleExactRequest, type ExactServerContext } from '@exactjs/server';

/** Carries the context required by exact koa. */
export type ExactKoaContext = {
	method: string;
	url: string;
	headers?: Record<string, string | string[] | undefined>;
	request: {
		body?: unknown;
		rawBody?: string;
	};
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
		const result = await handleExactRequest(
			{
				method: ctx.method,
				url: ctx.url,
				headers: ctx.headers,
				body: ctx.request.body,
				text: ctx.request.rawBody === undefined ? undefined : async () => ctx.request.rawBody!,
				platformRequest: ctx
			},
			context
		);
		if (result.status === 404 && next) {
			await next();
			return;
		}
		ctx.status = result.status;
		for (const [name, value] of Object.entries(result.headers)) ctx.set(name, value);
		ctx.body = result.stream ?? result.body ?? '';
	};
}

export { createExactKoaMiddleware as createKoaMiddleware };
