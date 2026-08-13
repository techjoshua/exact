import { createVNode } from '@exactjs/core';
import {
	cancelNodeResponseBody,
	createExactNodeHandler,
	writeNodeResponseBody
} from '@exactjs/node-adapter';
import { composeExactExecutorContract, createExactHydrationConfig } from '@exactjs/server';
import {
	createExactServerRuntime,
	renderExactRequestToProgressiveHtmlResponse
} from '@exactjs/ssr';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CalculatorWorkspace, ShippingCalculatorPage } from '../.exact/App.exact.server.js';
import { configuredProviderIds } from './providers/registry.js';
import { createParcelRequestLifetime } from './request-lifetime.js';

const exactContract = composeExactExecutorContract([ShippingCalculatorPage, CalculatorWorkspace], {
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

	const lifetime = createParcelRequestLifetime(request, response);
	try {
		const configured = configuredProviderIds();
		const hydration = createExactHydrationConfig(exactContract, {
			state: { configuredProviders: configured },
			includeContinuations: false
		});
		const rendered = await renderExactRequestToProgressiveHtmlResponse(
			{
				url,
				method: request.method ?? 'GET',
				headers: request.headers,
				signal: lifetime.signal,
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
			await cancelNodeResponseBody(rendered, 'HEAD response');
			response.end();
			return;
		}
		response.write(before);
		await writeNodeResponseBody(response, rendered, lifetime.signal);
		response.end(after);
	} finally {
		lifetime.dispose();
	}
}

function documentTemplate(options: ParcelLabServerOptions): string {
	return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Compare domestic shipping rates, delivery windows, and optional services."><title>Parcel Lab — Shipping rate explorer</title>${options.stylesheet ? `<link rel="stylesheet" href="${options.stylesheet}">` : ''}</head><body><!--exact-app--><script type="module" src="${options.clientScript}"></script></body></html>`;
}
