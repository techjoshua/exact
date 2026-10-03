import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';

/** Owns loopback HTTP dispatch and shutdown for the installed-package acceptance journey. */
export async function startInstalledIslandsHttp(application, clientCode) {
	const requests = [];
	const errors = [];
	const server = createServer(async (incoming, outgoing) => {
		const abort = new AbortController();
		outgoing.once('close', () => {
			if (!outgoing.writableFinished) abort.abort();
		});
		try {
			const url = new URL(incoming.url, 'http://' + incoming.headers.host);
			requests.push({ method: incoming.method, path: url.pathname });
			let response;
			if (url.pathname === '/client.mjs' && clientCode) {
				response = new Response(clientCode, { headers: { 'content-type': 'text/javascript' } });
			} else if (url.pathname === '/' && incoming.method === 'GET') {
				const rendered = await application.renderPage();
				response = new Response(rendered.htmlWithHydration, {
					headers: { 'content-type': 'text/html' }
				});
			} else {
				const chunks = [];
				for await (const chunk of incoming) chunks.push(chunk);
				const method = incoming.method;
				response = await application.handleExact(
					new Request(url, {
						method,
						headers: incoming.headers,
						body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
						signal: abort.signal
					})
				);
			}
			outgoing.writeHead(response.status, Object.fromEntries(response.headers));
			if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
			else outgoing.end();
		} catch (error) {
			errors.push(error);
			outgoing.destroy(error);
		}
	});
	const close = async () => {
		const closed = new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
		server.closeAllConnections();
		await closed;
	};
	const lifecycle = installDevelopmentProcessLifecycle({ label: 'installed-islands HTTP', close });
	try {
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		return {
			origin: 'http://127.0.0.1:' + server.address().port,
			requests,
			errors,
			async dispose() {
				lifecycle.dispose();
				await close();
			}
		};
	} catch (error) {
		lifecycle.dispose();
		if (server.listening) await close();
		throw error;
	}
}
