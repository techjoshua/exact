import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';
import type { ExactResponseLike, ExactServerContext } from './types.js';

const excludedResponseHeaders = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'content-length',
	'content-encoding'
]);

/** Copies one upstream gateway response after bounding its complete JSON or NDJSON representation. */
export async function copyValidatedGatewayResponse(
	upstream: Response,
	context: ExactServerContext
): Promise<ExactResponseLike> {
	const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? '';
	const headers = responseHeaders(upstream.headers);
	if (contentType.startsWith('application/x-ndjson')) {
		if (!upstream.body) throw new Error('Missing upstream stream');
		return {
			status: upstream.status,
			headers,
			body: '',
			stream: validateNdjsonStream(upstream.body, {
				maxBytes: positiveLimit(context.limits?.maxStreamBytes, 16 * 1024 * 1024),
				maxEvents: positiveLimit(context.limits?.maxStreamEvents, 100_000)
			})
		};
	}
	if (!contentType.startsWith('application/json')) throw new Error('Invalid upstream content type');
	const body = await upstream.text();
	if (
		new TextEncoder().encode(body).byteLength >
		positiveLimit(context.limits?.maxResponseBytes, 16 * 1024 * 1024)
	)
		throw new Error('Upstream response too large');
	JSON.parse(body);
	return { status: upstream.status, headers, body };
}

function validateNdjsonStream(
	source: ReadableStream<Uint8Array>,
	limits: { maxBytes: number; maxEvents: number }
): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let buffer = '';
	let bytes = 0;
	let events = 0;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const next = await reader.read();
				if (next.done) {
					buffer += decoder.decode();
					validateLines(true);
					controller.close();
					reader.releaseLock();
					return;
				}
				bytes += next.value.byteLength;
				if (bytes > limits.maxBytes) throw new Error('Upstream stream too large');
				buffer += decoder.decode(next.value, { stream: true });
				validateLines(false);
				controller.enqueue(next.value);
			} catch (error) {
				await reader.cancel(error).catch(() => undefined);
				controller.error(error);
			}
		},
		async cancel(reason) {
			await reader.cancel(reason);
		}
	});

	function validateLines(final: boolean): void {
		let newline: number;
		while ((newline = buffer.indexOf('\n')) >= 0) {
			validateLine(buffer.slice(0, newline).replace(/\r$/, ''));
			buffer = buffer.slice(newline + 1);
		}
		if (final && buffer.trim()) validateLine(buffer.replace(/\r$/, ''));
	}

	function validateLine(line: string): void {
		if (!line.trim()) return;
		if (++events > limits.maxEvents) throw new Error('Upstream stream has too many events');
		JSON.parse(line);
	}
}

function responseHeaders(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};
	headers.forEach((value, name) => {
		if (!excludedResponseHeaders.has(name.toLowerCase())) result[name] = value;
	});
	return result;
}
