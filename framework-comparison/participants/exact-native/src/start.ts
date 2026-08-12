import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleNativeRequest } from './server-app.js';

const distRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = path.join(distRoot, 'client');
const manifest = JSON.parse(
	await readFile(path.join(clientRoot, '.vite', 'manifest.json'), 'utf8')
) as Record<string, { file: string; css?: string[] }>;
const entry = manifest['src/client.ts'];
if (!entry) throw new Error('Native eXact client manifest has no src/client.ts entry');

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
	try {
		const pathname = new URL(request.url ?? '/', 'http://local').pathname;
		if (pathname.startsWith('/assets/')) {
			await serveAsset(pathname, response);
			return;
		}
		await handleNativeRequest(request, response, {
			clientScript: `/${entry.file}`,
			stylesheet: entry.css?.[0] ? `/${entry.css[0]}` : undefined
		});
	} catch (caught) {
		if (!response.headersSent) response.statusCode = 500;
		response.end('Native eXact participant could not handle this request');
		process.emitWarning(caught instanceof Error ? caught : new Error(String(caught)));
	}
}

async function serveAsset(pathname: string, response: ServerResponse): Promise<void> {
	const file = path.resolve(clientRoot, `.${pathname}`);
	if (!file.startsWith(`${clientRoot}${path.sep}`)) {
		response.writeHead(403).end();
		return;
	}
	const info = await stat(file);
	response.writeHead(200, {
		'cache-control': 'public, max-age=31536000, immutable',
		'content-length': info.size,
		'content-type': file.endsWith('.css')
			? 'text/css; charset=utf-8'
			: 'text/javascript; charset=utf-8'
	});
	createReadStream(file).pipe(response);
}

const server = createServer((request, response) => void handleRequest(request, response));
const port = Number(process.env.PORT || 4501);
server.listen(port, '127.0.0.1', () => {
	console.log(`Native eXact comparison running at http://127.0.0.1:${port}`);
});
