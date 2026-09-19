import { createNodeHandler } from '@exactjs/node-adapter';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ssrRenderMode } from './ssr-render-mode.mjs';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startComparisonServer } from './server.mjs';

const participants = [
	{ id: 'exact', directory: new URL('../participants/exact/dist/', import.meta.url), port: 4401 },
	{ id: 'react', directory: new URL('../participants/react/dist/', import.meta.url), port: 4402 }
];
const service = await startComparisonServer();
const participantServers = await Promise.all(
	participants.map((participant) => startParticipantServer(participant, service.service.store))
);
const { handler: svelteKitHandler } = await import('../participants/sveltekit/build/handler.js');
const { middleware: tanStackStartHandler } = await import(
	'../participants/tanstack-start/.output/server/index.mjs'
);
const { listener: nuxtHandler } = await import('../participants/nuxt/.output/server/index.mjs');
const frameworkServers = await Promise.all([
	startFrameworkServer(4403, svelteKitHandler),
	startFrameworkServer(4404, nuxtHandler),
	startFrameworkServer(4405, tanStackStartHandler)
]);
let closing = false;

/** Closes all listeners and force-releases keep-alive sockets owned by the browser harness. */
export async function close() {
	if (closing) return;
	closing = true;
	await Promise.all(participantServers.map((entry) => entry.close()));
	await Promise.all(frameworkServers.map((entry) => entry.close()));
	await service.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

async function shutdown() {
	await close();
	process.exit(0);
}

async function startParticipantServer(participant, store) {
	const directory = resolve(fileURLToPath(participant.directory));
	const indexHtml = await readFile(resolve(directory, 'index.html'), 'utf8');
	const clientTags =
		indexHtml
			.match(/(?:<script[^>]+src="[^"]+"[^>]*><\/script>|<link[^>]+href="[^"]+"[^>]*>)/g)
			?.join('\n') ?? '';
	const serverEntry = resolve(directory, '../dist-server/server-entry.js');
	const { renderParticipant, renderParticipantStream } = await import(
		pathToFileURL(serverEntry).href
	);
	const sockets = new Set();
	const handle = async (request, response, signal) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
			const candidate = resolve(directory, `.${pathname}`);
			if (candidate.startsWith(`${directory}${sep}`) && (await isFile(candidate))) {
				response.writeHead(200, { 'content-type': contentType(candidate) });
				createReadStream(candidate).pipe(response);
				return;
			}

			const snapshot = store.snapshot();
			const initialData = {
				incidents: snapshot.incidents,
				users: snapshot.users,
				sessionUserId: snapshot.sessionUserId
			};
			const streaming = ssrRenderMode() === 'stream';
			const rendered = await (streaming
				? renderParticipantStream(initialData, pathname, { clientTags }, signal)
				: renderParticipant(initialData, pathname, { clientTags }));
			response.writeHead(200, {
				'cache-control': 'no-store',
				'content-type': 'text/html; charset=utf-8',
				'x-comparison-render': 'ssr'
			});
			if (streaming) await pipeline(Readable.fromWeb(rendered), response);
			else response.end(rendered);
		} catch (caught) {
			response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
			response.end(caught instanceof Error ? (caught.stack ?? caught.message) : String(caught));
		}
	};
	const server = createServer(participant.id === 'exact' ? createNodeHandler(handle) : handle);
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
	});
	await new Promise((resolveListen, reject) => {
		server.once('error', reject);
		server.listen(participant.port, '127.0.0.1', resolveListen);
	});
	return {
		async close() {
			for (const socket of sockets) socket.destroy();
			await new Promise((resolveClose, reject) =>
				server.close((caught) => (caught ? reject(caught) : resolveClose()))
			);
		}
	};
}

async function startFrameworkServer(port, handler) {
	const sockets = new Set();
	const server = createServer((request, response) => {
		response.setHeader('x-comparison-render', 'ssr');
		handler(request, response);
	});
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
	});
	await new Promise((resolveListen, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolveListen);
	});
	return {
		async close() {
			for (const socket of sockets) socket.destroy();
			await new Promise((resolveClose, reject) =>
				server.close((caught) => (caught ? reject(caught) : resolveClose()))
			);
		}
	};
}

async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

function contentType(path) {
	switch (extname(path)) {
		case '.css':
			return 'text/css; charset=utf-8';
		case '.js':
			return 'text/javascript; charset=utf-8';
		case '.svg':
			return 'image/svg+xml';
		default:
			return 'application/octet-stream';
	}
}
