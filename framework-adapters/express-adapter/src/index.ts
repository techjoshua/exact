import { handleExactRequest, type ExactServerContext } from '@exact/server';

export type ExactExpressRequest = {
	method: string;
	originalUrl?: string;
	url?: string;
	headers?: Record<string, string | string[] | undefined>;
	body?: unknown;
	text?(): Promise<string>;
};

export type ExactExpressResponse = {
	status(code: number): ExactExpressResponse;
	setHeader(name: string, value: string): void;
	write?(chunk: Uint8Array): void;
	end?(): void;
	send(body: unknown): void;
	destroy?(error: unknown): void;
};

export type ExactExpressNext = (error?: unknown) => void;

/** Creates an Express middleware for an eXact endpoint. */
export function createExactExpressMiddleware(
	context: ExactServerContext
): (request: ExactExpressRequest, response: ExactExpressResponse, next?: ExactExpressNext) => void {
	return (request, response, next) => {
		void handleExactRequest(
			{
				method: request.method,
				url: request.originalUrl ?? request.url,
				headers: request.headers,
				body: request.body,
				text: typeof request.text === 'function' ? () => request.text!() : undefined,
				platformRequest: request
			},
			context
		).then(
			(result) => {
				response.status(result.status);
				for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
				if (result.stream && response.write && response.end) {
					void pipeReadableStream(
						result.stream,
						(chunk) => response.write!(chunk),
						() => response.end!(),
						(error) => response.destroy?.(error)
					);
				} else {
					response.send(result.stream ?? result.body ?? '');
				}
			},
			(error) => {
				if (next) next(error);
				else throw error;
			}
		);
	};
}

async function pipeReadableStream(
	stream: ReadableStream<Uint8Array>,
	write: (chunk: Uint8Array) => void,
	end: () => void,
	fail: (error: unknown) => void
): Promise<void> {
	const reader = stream.getReader();
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			write(next.value);
		}
		end();
	} catch (error) {
		fail(error);
	}
}

export { createExactExpressMiddleware as createExpressHandler };
