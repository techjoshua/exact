import { handleExactRequest, type ExactResponseLike, type ExactServerContext } from '@exact/server';

export type ExactServerlessEvent = {
	httpMethod?: string;
	method?: string;
	path?: string;
	rawPath?: string;
	rawQueryString?: string;
	headers?: Record<string, string | undefined>;
	body?: string | null;
	isBase64Encoded?: boolean;
};

export type ExactServerlessResult = {
	statusCode: number;
	headers: Record<string, string>;
	body: string;
	isBase64Encoded: false;
};

/** Creates an AWS Lambda/API Gateway style eXact serverless handler. */
export function createExactServerlessHandler(
	context: ExactServerContext
): (event: ExactServerlessEvent) => Promise<ExactServerlessResult> {
	return async (event) => {
		const result = await handleExactRequest(
			{
				method: event.httpMethod ?? event.method ?? 'GET',
				url: eventUrl(event),
				headers: event.headers,
				text: async () => eventBody(event),
				platformRequest: event
			},
			context
		);
		return responseToServerlessResult(result);
	};
}

/** Converts an eXact response into a string-body serverless result. */
export async function responseToServerlessResult(
	result: ExactResponseLike
): Promise<ExactServerlessResult> {
	return {
		statusCode: result.status,
		headers: result.headers,
		body: result.stream ? await streamToText(result.stream) : (result.body ?? ''),
		isBase64Encoded: false
	};
}

function eventUrl(event: ExactServerlessEvent): string | undefined {
	const path = event.rawPath ?? event.path;
	if (!path) return undefined;
	return event.rawQueryString ? `${path}?${event.rawQueryString}` : path;
}

function eventBody(event: ExactServerlessEvent): string {
	const body = event.body ?? '';
	return event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let output = '';
	while (true) {
		const next = await reader.read();
		if (next.done) break;
		output += decoder.decode(next.value, { stream: true });
	}
	return output + decoder.decode();
}

export { createExactServerlessHandler as createLambdaHandler };
