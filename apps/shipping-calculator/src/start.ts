import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleParcelLabRequest } from './server-app.js';

const distRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = path.join(distRoot, 'client');
const manifest = JSON.parse(
	await readFile(path.join(clientRoot, '.vite', 'manifest.json'), 'utf8')
) as Record<string, { file: string; css?: string[] }>;
const entry =
	manifest['src/client.ts'] ?? Object.values(manifest).find((item) => item.file.endsWith('.js'));
if (!entry) throw new Error('Parcel Lab client manifest has no entry');

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
	try {
		if (request.url?.startsWith('/assets/')) {
			const file = path.resolve(clientRoot, `.${new URL(request.url, 'http://local').pathname}`);
			if (!file.startsWith(`${clientRoot}${path.sep}`)) {
				response.statusCode = 403;
				response.end();
				return;
			}
			const info = await stat(file);
			response.statusCode = 200;
			response.setHeader('content-length', info.size);
			response.setHeader('cache-control', 'public, max-age=31536000, immutable');
			response.setHeader(
				'content-type',
				file.endsWith('.css')
					? 'text/css; charset=utf-8'
					: file.endsWith('.js')
						? 'text/javascript; charset=utf-8'
						: 'application/octet-stream'
			);
			createReadStream(file).pipe(response);
			return;
		}
		await handleParcelLabRequest(request, response, {
			clientScript: `/${entry.file}`,
			stylesheet: entry.css?.[0] ? `/${entry.css[0]}` : undefined
		});
	} catch (error) {
		if (!response.headersSent) response.statusCode = 500;
		response.end('Parcel Lab could not render this request');
		process.emitWarning(error instanceof Error ? error : new Error(String(error)));
	}
}

const server = createServer((request, response) => {
	void handleRequest(request, response);
});

const port = Number(process.env.PORT || 4175);
server.listen(port, '0.0.0.0', () => console.log(`Parcel Lab running at http://localhost:${port}`));
