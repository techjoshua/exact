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
import { NativeIncidentPage, NativeIncidentWorkspace } from '../.exact/App.exact.server.js';
import { reset, subscribe } from './native-store.js';
import { createRequestLifetime } from './request-lifetime.js';

const exactContract = composeExactExecutorContract([NativeIncidentPage, NativeIncidentWorkspace], {
	endpoint: '/__exact'
});
const exactRuntime = createExactServerRuntime({
	contract: exactContract,
	patchStrategy: 'element'
});
const exactHandler = createExactNodeHandler(exactRuntime);

/** Static assets required by the native eXact production document. */
export type NativeServerAssets = {
	clientScript: string;
	stylesheet?: string;
};

/** Handles native eXact documents, generated operations, events, and benchmark resets. */
export async function handleNativeRequest(
	request: IncomingMessage,
	response: ServerResponse,
	assets: NativeServerAssets
): Promise<void> {
	const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
	if (url.pathname === '/__exact') {
		exactHandler(request, response);
		return;
	}
	if (url.pathname === '/events' && request.method === 'GET') {
		streamEvents(request, response);
		return;
	}
	if (url.pathname === '/__benchmark/reset' && request.method === 'POST') {
		reset();
		response.writeHead(204, { 'cache-control': 'no-store' });
		response.end();
		return;
	}
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
		response.end('Method Not Allowed');
		return;
	}

	const lifetime = createRequestLifetime(request, response);
	try {
		const hydration = createExactHydrationConfig(exactContract, {
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
			() => createVNode(NativeIncidentPage, { path: url.pathname }),
			{ rootId: 'app', maxTaskDurationMs: 1_200, ...hydration }
		);
		const [before, after] = documentTemplate(assets).split('<!--exact-app-->');
		response.statusCode = rendered.status;
		for (const [name, value] of Object.entries(rendered.headers)) response.setHeader(name, value);
		response.setHeader('cache-control', 'no-store');
		response.setHeader('x-comparison-render', 'ssr');
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

function streamEvents(request: IncomingMessage, response: ServerResponse): void {
	response.writeHead(200, {
		'cache-control': 'no-cache, no-transform',
		connection: 'keep-alive',
		'content-type': 'text/event-stream; charset=utf-8'
	});
	response.write(': connected\n\n');
	const release = subscribe((event) => {
		response.write(`event: ${event.type}\ndata: ${JSON.stringify(event.value)}\n\n`);
	});
	request.once('close', release);
}

function documentTemplate(assets: NativeServerAssets): string {
	return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="framework-participant" content="exact-native"><title>Incident Operations</title>${assets.stylesheet ? `<link rel="stylesheet" href="${assets.stylesheet}">` : ''}<script type="module" src="${assets.clientScript}"></script></head><body><!--exact-app--></body></html>`;
}
