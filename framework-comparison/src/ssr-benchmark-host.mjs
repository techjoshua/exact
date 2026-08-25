import { usesNativeBunServer } from './ssr-benchmark-transport.mjs';

/**
 * Starts the participant-declared HTTP host and owns its complete listener lifecycle.
 * Native Fetch and Node compatibility callbacks remain transport-specific by design.
 */
export async function startSsrBenchmarkHost(options) {
	return usesNativeBunServer(options.transport) ? startBunHost(options) : startNodeHost(options);
}

/** Starts Bun's native Fetch server without importing Node's HTTP compatibility module. */
function startBunHost(options) {
	if (!globalThis.Bun?.serve) throw new Error('bun-fetch transport requires Bun.serve');
	const server = globalThis.Bun.serve({
		hostname: '127.0.0.1',
		port: options.port,
		async fetch(request) {
			const pathname = new URL(request.url).pathname;
			return pathname.startsWith('/__exact-benchmark/')
				? options.handleFetchControl(pathname)
				: options.handleFetchRequest(request);
		}
	});
	return {
		port: Number(server.port ?? new URL(server.url).port),
		close: () => server.stop(),
		forceClose: () => server.stop(true)
	};
}

/** Starts the Node HTTP host used by Node and compatibility-only Bun participants. */
async function startNodeHost(options) {
	const { createServer } = await import('node:http');
	const sockets = new Set();
	const server = createServer((request, response) => {
		const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
		if (pathname.startsWith('/__exact-benchmark/'))
			void options.handleNodeControl(pathname, response);
		else options.handleNodeRequest(request, response);
	});
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
	});
	await new Promise((resolveListen, reject) => {
		server.once('error', reject);
		server.listen(options.port, '127.0.0.1', resolveListen);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('SSR worker has no TCP address');
	return {
		port: address.port,
		async close() {
			server.closeIdleConnections?.();
			await new Promise((resolveClose) => server.close(() => resolveClose()));
		},
		forceClose() {
			for (const socket of sockets) socket.destroy();
		}
	};
}
