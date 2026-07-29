import { createVNode } from '@exactjs/core';
import { createExactNodeHandler } from '@exactjs/node-adapter';
import { composeExactExecutorContract, createExactHydrationConfig } from '@exactjs/server';
import {
	createExactServerRuntime,
	renderExactRequestToProgressiveHtmlResponse
} from '@exactjs/ssr';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ShippingCalculatorPage } from '../.exact/App.exact.server.js';
import { parseRateRequest } from './model.js';
import { configuredProviderIds, quoteProvider } from './providers/registry.js';

const exactContract = composeExactExecutorContract([ShippingCalculatorPage], {
	endpoint: '/__exact'
});

const exactRuntime = {
	...createExactServerRuntime({ contract: exactContract, patchStrategy: 'element' }),
	limits: {
		maxBatchOperations: 8,
		maxBatchConcurrency: 6,
		maxRequestBytes: 128 * 1024,
		maxResponseBytes: 2 * 1024 * 1024
	}
};
const exactHandler = createExactNodeHandler(exactRuntime);

/** Configures parcel lab server. */
export type ParcelLabServerOptions = {
	clientScript: string;
	stylesheet?: string;
	transformHtml?(html: string): Promise<string>;
};

/** Runs parcel lab request with the supplied execution context. */
export async function handleParcelLabRequest(
	request: IncomingMessage,
	response: ServerResponse,
	options: ParcelLabServerOptions
): Promise<void> {
	const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
	if (url.pathname === '/__exact') {
		exactHandler(request, response);
		return;
	}
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		response.statusCode = 405;
		response.end('Method Not Allowed');
		return;
	}

	const abort = new AbortController();
	request.once('aborted', () => abort.abort(new DOMException('Request aborted', 'AbortError')));
	response.once('close', () => {
		if (!response.writableEnded) abort.abort(new DOMException('Response closed', 'AbortError'));
	});

	const configured = configuredProviderIds();
	const hydration = createExactHydrationConfig(exactContract, {
		configuredProviders: configured
	});
	const rendered = await renderExactRequestToProgressiveHtmlResponse(
		{
			url,
			method: request.method ?? 'GET',
			headers: request.headers,
			signal: abort.signal,
			platformRequest: request
		},
		exactRuntime,
		() => createVNode(ShippingCalculatorPage, { url: url.toString() }),
		{
			rootId: 'app',
			maxTaskDurationMs: 1_200,
			...hydration
		}
	);
	const template = documentTemplate(options);
	const html = options.transformHtml ? await options.transformHtml(template) : template;
	const [before, after] = html.split('<!--exact-app-->');
	response.statusCode = rendered.status;
	for (const [name, value] of Object.entries(rendered.headers)) response.setHeader(name, value);
	response.setHeader('cache-control', 'no-store');
	if (request.method === 'HEAD') {
		await rendered.stream?.cancel('HEAD response');
		response.end();
		return;
	}
	response.write(before);
	if (rendered.stream) await pipeStream(rendered.stream, response, abort.signal);
	else response.write(rendered.body);
	response.end(after);
}

function documentTemplate(options: ParcelLabServerOptions): string {
	return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Compare domestic shipping rates, delivery windows, and optional services."><title>Parcel Lab — Shipping rate explorer</title>${options.stylesheet ? `<link rel="stylesheet" href="${options.stylesheet}">` : ''}</head><body><!--exact-app--><script type="module" src="${options.clientScript}"></script></body></html>`;
}

async function pipeStream(
	stream: ReadableStream<Uint8Array>,
	response: ServerResponse,
	signal: AbortSignal
): Promise<void> {
	const reader = stream.getReader();
	const abort = () => void reader.cancel(signal.reason);
	signal.addEventListener('abort', abort, { once: true });
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			if (!response.write(next.value))
				await new Promise<void>((resolve, reject) => {
					const closed = () => reject(new DOMException('Response closed', 'AbortError'));
					response.once('drain', resolve);
					response.once('close', closed);
				});
		}
	} finally {
		signal.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}
