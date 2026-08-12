import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { createComparisonService } from './service.mjs';
import { validateFixture } from './contract.mjs';

/** Starts the controlled comparison service and resolves after its TCP listener is ready. */
export async function startComparisonServer(options = {}) {
	const fixturePath = new URL('../fixtures/baseline.json', import.meta.url);
	const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
	validateFixture(fixture);
	const service = createComparisonService(fixture, options);
	const host = options.host ?? '127.0.0.1';
	const port = options.port ?? Number(process.env.PORT ?? 4310);
	const sockets = new Set();
	const server = createServer(async (incoming, outgoing) => {
		try {
			const body = await readIncomingBody(incoming);
			const request = new Request(`http://${host}:${port}${incoming.url}`, {
				method: incoming.method,
				headers: incoming.headers,
				...(body.length > 0 ? { body } : {})
			});
			const response = await service.fetch(request);
			outgoing.writeHead(response.status, Object.fromEntries(response.headers));
			if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
			else outgoing.end();
		} catch (caught) {
			outgoing.writeHead(500, { 'content-type': 'application/json' });
			outgoing.end(JSON.stringify({ error: { code: 'internal_error', message: caught.message } }));
		}
	});
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, host, resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string')
		throw new Error('comparison server has no TCP address');
	const url = `http://${host}:${address.port}`;
	return {
		server,
		service,
		url,
		/** Stops accepting traffic and releases service-owned asynchronous work. */
		async close() {
			service.dispose();
			for (const socket of sockets) socket.destroy();
			await new Promise((resolve, reject) =>
				server.close((caught) => (caught ? reject(caught) : resolve()))
			);
		}
	};
}

async function readIncomingBody(request) {
	const chunks = [];
	for await (const chunk of request) chunks.push(chunk);
	return Buffer.concat(chunks);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	const running = await startComparisonServer();
	console.log(`Framework comparison service listening at ${running.url}`);
}
