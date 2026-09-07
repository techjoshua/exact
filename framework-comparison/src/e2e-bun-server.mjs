import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { startComparisonServer } from './server.mjs';
import { availableSsrRuntimes } from './ssr-run-environment.mjs';
import { startSsrWorker, stopSsrWorker } from './ssr-worker-controller.mjs';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';

const suiteRoot = resolve(import.meta.dirname, '..');
const workers = [];
const servers = [];
let service;
const lifecycle = installDevelopmentProcessLifecycle({
	label: 'Native Bun browser fixtures',
	close
});

/** Closes the browser-only frontends, native Bun workers, and controlled service. */
export async function close() {
	const ownedService = service;
	service = undefined;
	const results = await Promise.allSettled([
		...servers.splice(0).map(async (server) => {
			server.closeAllConnections();
			await new Promise((resolveClose) => server.close(resolveClose));
		}),
		...workers.splice(0).map(stopSsrWorker),
		ownedService?.close()
	]);
	lifecycle.dispose();
	const failures = results.filter((result) => result.status === 'rejected');
	if (failures.length)
		throw new AggregateError(
			failures.map((result) => result.reason),
			'Bun fixture cleanup failed'
		);
}

try {
	service = await startComparisonServer();
	for (const [index, id] of ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'].entries()) {
		const worker = await startSsrWorker({
			runtime: availableSsrRuntimes('bun')[0],
			participantId: id,
			transport: 'bun-fetch',
			workerPath: resolve(suiteRoot, 'src/ssr-benchmark-worker.mjs'),
			workingDirectory: suiteRoot,
			serviceUrl: service.url,
			environment: { COMPARISON_SSR_BOUNDED_TELEMETRY: '1' }
		});
		workers.push(worker);
		await startBrowserFrontend(id, 4401 + index, worker);
	}
} catch (error) {
	await close();
	throw error;
}

/** Adds browser assets to the renderer-only fixtures; all SSR requests reach native Bun. */
async function startBrowserFrontend(id, port, worker) {
	const browserDirectory = ['exact', 'react'].includes(id)
		? resolve(suiteRoot, 'participants', id, 'dist')
		: undefined;
	const index = browserDirectory
		? await readFile(resolve(browserDirectory, 'index.html'), 'utf8')
		: '';
	const tags =
		index
			.match(/(?:<script[^>]+src="[^"]+"[^>]*><\/script>|<link[^>]+href="[^"]+"[^>]*>)/g)
			?.join('\n') ?? '';
	const server = createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
			if (browserDirectory) {
				const candidate = resolve(browserDirectory, `.${pathname}`);
				if (
					candidate.startsWith(browserDirectory + sep) &&
					(await stat(candidate).then(
						(s) => s.isFile(),
						() => false
					))
				) {
					response.writeHead(200, {
						'content-type':
							extname(candidate) === '.js'
								? 'text/javascript'
								: extname(candidate) === '.css'
									? 'text/css'
									: 'application/octet-stream'
					});
					response.end(await readFile(candidate));
					return;
				}
			}
			const upstream = await fetch(new URL(request.url, worker.url), {
				redirect: 'manual',
				headers: { 'accept-encoding': 'identity' }
			});
			const headers = Object.fromEntries(
				[...upstream.headers].filter(
					([key]) => !['content-length', 'content-encoding', 'transfer-encoding'].includes(key)
				)
			);
			response.writeHead(upstream.status, headers);
			if (tags && upstream.headers.get('content-type')?.includes('text/html'))
				response.end((await upstream.text()).replace('</head>', `${tags}</head>`));
			else response.end(new Uint8Array(await upstream.arrayBuffer()));
		} catch (error) {
			if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' });
			response.end(String(error));
		}
	});
	servers.push(server);
	await new Promise((resolveListen, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolveListen);
	});
}
