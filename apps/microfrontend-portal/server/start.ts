import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExactNodeHandler } from '@exactjs/node-adapter';
import { resolveExactBuildKey } from '@exactjs/microfrontends/build';
import { createSampleRuntimes } from './runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const buildKey = resolveExactBuildKey({ cwd: path.resolve(root, '../..') });
const runtimes = createSampleRuntimes({ buildKey });
const pageExact = createExactNodeHandler(runtimes.page);
const billingExact = createExactNodeHandler(runtimes.billing);
const brandingExact = createExactNodeHandler(runtimes.branding);

const page = createServer((request, response) => {
	const url = new URL(request.url ?? '/', 'http://localhost');
	if (url.pathname === '/__exact') {
		pageExact(request, response);
		return;
	}
	void serveStatic(url.pathname, response);
});
const billing = createServer((request, response) => exactOnly(request, response, billingExact));
const branding = createServer((request, response) => exactOnly(request, response, brandingExact));

page.listen(4300, '0.0.0.0', () => console.log('Microfrontend portal: http://localhost:4300'));
billing.listen(4401, '127.0.0.1');
branding.listen(4402, '127.0.0.1');

async function serveStatic(pathname: string, response: import('node:http').ServerResponse) {
	const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
	const file = path.resolve(publicRoot, relative);
	if (file !== publicRoot && !file.startsWith(`${publicRoot}${path.sep}`)) {
		response.statusCode = 403;
		response.end('Forbidden');
		return;
	}
	try {
		const metadata = await stat(file);
		if (!metadata.isFile()) throw new Error('not a file');
		response.statusCode = 200;
		response.setHeader('content-type', contentType(file));
		createReadStream(file).pipe(response);
	} catch {
		response.statusCode = 404;
		response.end('Not Found');
	}
}

function exactOnly(
	request: import('node:http').IncomingMessage,
	response: import('node:http').ServerResponse,
	handler: ReturnType<typeof createExactNodeHandler>
) {
	if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/__exact') {
		response.statusCode = 404;
		response.end('Not Found');
		return;
	}
	handler(request, response);
}

function contentType(file: string): string {
	if (file.endsWith('.html')) return 'text/html; charset=utf-8';
	if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
	if (file.endsWith('.css')) return 'text/css; charset=utf-8';
	if (file.endsWith('.svg')) return 'image/svg+xml';
	if (file.endsWith('.json')) return 'application/json; charset=utf-8';
	return 'application/octet-stream';
}
