import type { ServerResponse } from 'node:http';
import type { ExactServerContext } from '@exactjs/server';
import { reportNodeError } from '../error-reporting.js';

/** Reports an uncaught handler failure and terminates the response without exposing its details. */
export function writeNodeError(
	response: ServerResponse,
	error: unknown,
	logger?: ExactServerContext['logger']
): void {
	reportNodeError(error, 'request', logger);
	if (response.destroyed || response.writableEnded) return;
	if (response.headersSent) {
		response.destroy(
			error instanceof Error ? error : new Error('eXact request failed', { cause: error })
		);
		return;
	}
	for (const name of response.getHeaderNames()) response.removeHeader(name);
	response.statusCode = 500;
	response.setHeader('content-type', 'application/json; charset=utf-8');
	response.end(JSON.stringify({ error: 'internal_error' }));
}
