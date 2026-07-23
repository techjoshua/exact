import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const document = await readFile(resolve(root, 'dist/index.html'));
const port = Number(process.env.EXACT_DOCS_PORT ?? 4175);

const server = createServer((_request, response) => {
	response.writeHead(200, {
		'content-type': 'text/html; charset=utf-8',
		'cache-control': 'no-store'
	});
	response.end(document);
});

server.listen(port, '127.0.0.1', () => {
	console.log(`eXact documentation preview: http://127.0.0.1:${port}/`);
});
