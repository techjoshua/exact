import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
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
const frameworkServers = await Promise.all([startFrameworkServer(4403, svelteKitHandler)]);
const nuxtServer = await startNuxtServer();
let closing = false;

/** Closes all listeners and force-releases keep-alive sockets owned by the browser harness. */
export async function close() {
	if (closing) return;
	closing = true;
	await Promise.all(participantServers.map((entry) => entry.close()));
	await Promise.all(frameworkServers.map((entry) => entry.close()));
	await nuxtServer.close();
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
	const { renderParticipant } = await import(pathToFileURL(serverEntry).href);
	const sockets = new Set();
	const server = createServer(async (request, response) => {
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
			const rendered = await renderParticipant(initialData, pathname);
			response.writeHead(200, {
				'cache-control': 'no-store',
				'content-type': 'text/html; charset=utf-8',
				'x-comparison-render': 'ssr'
			});
			response.end(documentHtml(participant.id, rendered, initialData, clientTags));
		} catch (caught) {
			response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
			response.end(caught instanceof Error ? (caught.stack ?? caught.message) : String(caught));
		}
	});
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

async function startNuxtServer() {
	const entry = fileURLToPath(
		new URL('../participants/nuxt/.output/server/index.mjs', import.meta.url)
	);
	const child = spawn(process.execPath, [entry], {
		env: { ...process.env, HOST: '127.0.0.1', PORT: '4404' },
		stdio: 'ignore',
		windowsHide: true
	});
	await waitUntilReady('http://127.0.0.1:4404/');
	return {
		async close() {
			if (child.exitCode !== null) return;
			child.kill();
			await Promise.race([
				new Promise((resolveExit) => child.once('exit', resolveExit)),
				new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000))
			]);
		}
	};
}

async function waitUntilReady(url) {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// The child listener is still starting.
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
	}
	throw new Error(`Participant server did not become ready: ${url}`);
}

function documentHtml(participantId, rendered, initialData, clientTags) {
	const serialized = JSON.stringify(initialData).replaceAll('<', '\\u003c');
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="framework-participant" content="${participantId}" />
		<title>Incident Operations</title>
		${clientTags}
	</head>
	<body>
		<div id="app" data-render-mode="ssr">${rendered}</div>
		${participantId === 'exact' ? '' : `<script id="comparison-data" type="application/json">${serialized}</script>`}
	</body>
</html>`;
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
