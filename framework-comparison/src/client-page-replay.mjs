import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';

const documentPath = '/incidents/inc-100';
const mediaTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2'
};

/** Captures one complete production document and immutable asset bytes before timed browsing. */
export async function captureClientPage({ id, url, directory }) {
	const response = await fetch(`${url}${documentPath}`, {
		headers: { 'accept-encoding': 'identity' },
		redirect: 'error'
	});
	if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html'))
		throw new Error(`${id}: expected a successful SSR document`);
	const body = Buffer.from(await response.arrayBuffer());
	if (!body.includes(Buffer.from('Checkout authorization failures')))
		throw new Error(`${id}: captured document omitted the SSR scenario`);
	const headers = Object.fromEntries(response.headers);
	// Fetch decodes bodies; connection framing and capture-time dates cannot be replayed verbatim.
	for (const key of [
		'content-encoding',
		'content-length',
		'transfer-encoding',
		'connection',
		'keep-alive',
		'date'
	])
		delete headers[key];
	const resources = new Map();
	await visit(directory, '');
	resources.set(documentPath, { body, headers });
	const manifest = [...resources].map(([path, resource]) => ({
		path,
		bytes: resource.body.length,
		sha256: createHash('sha256').update(resource.body).digest('hex'),
		headers: resource.headers
	}));
	return { id, url, resources, manifest };

	async function visit(root, prefix) {
		for (const entry of await readdir(root, { withFileTypes: true })) {
			if (entry.name.startsWith('.') || /\.(?:map|gz|br)$/.test(entry.name)) continue;
			const path = `${prefix}/${entry.name}`;
			if (entry.isDirectory()) await visit(resolve(root, entry.name), path);
			else if (entry.isFile())
				resources.set(path, {
					body: await readFile(resolve(root, entry.name)),
					headers: { 'content-type': mediaTypes[extname(path)] ?? 'application/octet-stream' }
				});
		}
	}
}

/** Serves only frozen bytes over HTTP; missing resources never fall back to SSR or a live proxy. */
export async function startClientPageReplay(capture) {
	const misses = [];
	let documentRequests = 0;
	const server = createServer((request, response) => {
		const path = new URL(request.url, capture.url).pathname;
		const resource = capture.resources.get(path);
		if (!resource || !['GET', 'HEAD'].includes(request.method)) {
			misses.push(`${request.method} ${request.url}`);
			response.writeHead(404);
			response.end();
			return;
		}
		if (path === documentPath) documentRequests++;
		response.writeHead(200, {
			...resource.headers,
			'cache-control': 'no-store',
			'content-length': resource.body.length
		});
		response.end(request.method === 'HEAD' ? undefined : resource.body);
	});
	await new Promise((done, reject) => {
		server.once('error', reject);
		server.listen(Number(new URL(capture.url).port), '127.0.0.1', done);
	});
	return {
		url: `http://127.0.0.1:${server.address().port}`,
		/** Returns request accounting and refuses evidence with missing resources. */
		evidence() {
			if (misses.length) throw new Error(`${capture.id}: replay misses: ${misses.join(', ')}`);
			return { id: capture.id, documentRequests, resources: capture.manifest };
		},
		/** Releases listeners and persistent sockets even when a measurement fails. */
		async close() {
			server.closeAllConnections();
			await new Promise((done, reject) =>
				server.close((error) => (error ? reject(error) : done()))
			);
		}
	};
}
