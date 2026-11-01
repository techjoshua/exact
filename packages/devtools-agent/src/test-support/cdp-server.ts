import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer } from 'ws';

/** Owns a loopback discovery service and real WebSockets for transport contract tests. */
export async function startCdpServer({
	pendingDiscovery = false,
	holdDiscoveryHeaders = false
} = {}) {
	const sockets = new Set<Socket>();
	const paths: string[] = [];
	const methods: string[] = [];
	let entered!: () => void;
	const pendingRequest = new Promise<void>((resolve) => {
		entered = resolve;
	});
	let discovered!: () => void;
	const discoveryStarted = new Promise<void>((resolve) => {
		discovered = resolve;
	});
	const webSockets = new WebSocketServer({ noServer: true });
	const server = createServer((request, response) => {
		if (request.url === '/entered') {
			void discoveryStarted.then(() => response.end('ready'));
			return;
		}
		if (request.url === '/pending') {
			void pendingRequest.then(() => response.end('ready'));
			return;
		}
		discovered();
		if (holdDiscoveryHeaders) return;
		response.setHeader('content-type', 'application/json');
		if (pendingDiscovery) {
			response.write('[');
			return;
		}
		response.end(
			JSON.stringify(
				['first', 'second'].map((id) => ({
					id,
					type: 'page',
					title: 'page 😀',
					webSocketDebuggerUrl: socketUrl + '/' + id
				}))
			)
		);
	});
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
	});
	server.on('upgrade', (request, socket, head) =>
		webSockets.handleUpgrade(request, socket, head, (peer) => {
			paths.push(request.url ?? '');
			peer.on('message', (data) => {
				const message = JSON.parse(String(data)) as { id: number; method: string };
				methods.push(message.method);
				if (message.method === 'pending') entered();
				else if (message.method === 'close') peer.close();
				else if (message.method === 'oversized')
					peer.send(JSON.stringify({ id: message.id, result: '😀'.repeat(20) }));
				else if (message.method === 'failure')
					peer.send(JSON.stringify({ id: message.id, error: { message: 'rejected by target' } }));
				else {
					if (message.method === 'protocol')
						for (const frame of [
							'invalid',
							'null',
							'[]',
							'{}',
							JSON.stringify({ id: -1, result: null })
						])
							peer.send(frame);
					if (message.method === 'event')
						peer.send(JSON.stringify({ method: 'changed', params: { value: 1 } }));
					peer.send(JSON.stringify({ id: message.id, result: { value: 'ready' } }));
				}
			});
		})
	);
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Missing CDP test address');
	const origin = 'http://127.0.0.1:' + address.port;
	const socketUrl = 'ws://127.0.0.1:' + address.port;
	return {
		origin,
		socketUrl,
		paths,
		methods,
		pendingRequest,
		discoveryStarted,
		async close() {
			for (const peer of webSockets.clients) peer.terminate();
			for (const socket of sockets) socket.destroy();
			await Promise.all([
				new Promise<void>((resolve) => webSockets.close(() => resolve())),
				new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve()))
				)
			]);
		}
	};
}
