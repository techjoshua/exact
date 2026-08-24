import { createServer } from 'node:http';
import { PerformanceObserver, monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const participantId = process.argv[2];
const requestedPort = Number(process.argv[3] ?? 0);
const suiteRoot = resolve(import.meta.dirname, '..');
const serviceUrl = process.env.COMPARISON_SERVICE_URL ?? 'http://127.0.0.1:4310';
const protocolPrefix = 'EXACT_SSR_BENCHMARK:';
const statistics = { firstByteMs: [], totalMs: [], userCpuMs: [], systemCpuMs: [] };
const eventLoopDelay =
	typeof monitorEventLoopDelay === 'function'
		? monitorEventLoopDelay({ resolution: 1 })
		: undefined;
const garbageCollection = { count: 0, durationMs: 0 };
const garbageCollectionObserver = createGarbageCollectionObserver();
const sockets = new Set();
let shuttingDown = false;

if (!participantId) throw new Error('SSR benchmark worker requires a participant id');

eventLoopDelay?.enable();

const participant = await createParticipantHandler(participantId);
const server = createServer((request, response) => {
	const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
	if (pathname.startsWith('/__exact-benchmark/')) {
		void handleControlRequest(pathname, response);
		return;
	}
	measureRequest(response);
	try {
		const result = participant.handle(request, response);
		if (result && typeof result.then === 'function')
			void result.catch((error) => failResponse(response, error));
	} catch (error) {
		failResponse(response, error);
	}
});

server.on('connection', (socket) => {
	sockets.add(socket);
	socket.once('close', () => sockets.delete(socket));
});

await new Promise((resolveListen, reject) => {
	server.once('error', reject);
	server.listen(requestedPort, '127.0.0.1', resolveListen);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('SSR worker has no TCP address');
publish({ type: 'ready', participantId, pid: process.pid, port: address.port });

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

/** Creates the production SSR request handler without starting a descendant process. */
async function createParticipantHandler(id) {
	if (id === 'exact' || id === 'react') {
		const entry = resolve(suiteRoot, 'participants', id, 'dist-server', 'server-entry.js');
		const { renderParticipant } = await import(pathToFileURL(entry).href);
		return {
			async handle(request, response) {
				const initialData = await loadInitialData();
				const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
				const rendered = await renderParticipant(initialData, pathname);
				response.writeHead(200, {
					'cache-control': 'no-store',
					'content-type': 'text/html; charset=utf-8'
				});
				response.end(documentHtml(id, rendered, initialData));
			},
			async close() {}
		};
	}
	if (id === 'sveltekit') {
		const entry = resolve(suiteRoot, 'participants', 'sveltekit', 'build', 'handler.js');
		const { handler } = await import(pathToFileURL(entry).href);
		return { handle: handler, async close() {} };
	}
	if (id === 'nuxt') {
		const entry = resolve(
			suiteRoot,
			'participants',
			'nuxt',
			'.output',
			'server',
			'chunks',
			'_',
			'nitro.mjs'
		);
		const nitro = await import(pathToFileURL(entry).href);
		const application = nitro.b();
		return {
			handle: nitro.t(application.h3App),
			async close() {
				await application.hooks.callHook('close');
			}
		};
	}
	throw new Error(`Unknown SSR benchmark participant ${id}`);
}

/** Loads the same controlled-service data used by the framework-owned server routes. */
async function loadInitialData() {
	const [sessionResponse, incidentsResponse] = await Promise.all([
		fetch(`${serviceUrl}/api/session`),
		fetch(`${serviceUrl}/api/incidents`)
	]);
	if (!sessionResponse.ok || !incidentsResponse.ok)
		throw new Error(
			`Controlled service failed: session=${sessionResponse.status} incidents=${incidentsResponse.status}`
		);
	return { ...(await sessionResponse.json()), ...(await incidentsResponse.json()) };
}

/** Instruments first-byte and completion phases without changing framework response behavior. */
function measureRequest(response) {
	const startedAt = performance.now();
	const cpuStarted = process.cpuUsage();
	let firstByteAt;
	const markFirstByte = () => (firstByteAt ??= performance.now());
	const writeHead = response.writeHead;
	const write = response.write;
	const end = response.end;
	const flushHeaders = response.flushHeaders;
	response.writeHead = function (...arguments_) {
		markFirstByte();
		return writeHead.apply(this, arguments_);
	};
	response.write = function (...arguments_) {
		markFirstByte();
		return write.apply(this, arguments_);
	};
	response.end = function (...arguments_) {
		markFirstByte();
		return end.apply(this, arguments_);
	};
	if (typeof flushHeaders === 'function')
		response.flushHeaders = function (...arguments_) {
			markFirstByte();
			return flushHeaders.apply(this, arguments_);
		};
	response.once('finish', () => {
		const completedAt = performance.now();
		const cpu = process.cpuUsage(cpuStarted);
		statistics.firstByteMs.push((firstByteAt ?? completedAt) - startedAt);
		statistics.totalMs.push(completedAt - startedAt);
		statistics.userCpuMs.push(cpu.user / 1_000);
		statistics.systemCpuMs.push(cpu.system / 1_000);
	});
}

/** Serves process telemetry and deterministic lifecycle control outside measured request lanes. */
async function handleControlRequest(pathname, response) {
	if (pathname === '/__exact-benchmark/reset') {
		statistics.firstByteMs.length = 0;
		statistics.totalMs.length = 0;
		statistics.userCpuMs.length = 0;
		statistics.systemCpuMs.length = 0;
		eventLoopDelay?.reset();
		garbageCollection.count = 0;
		garbageCollection.durationMs = 0;
		writeJson(response, { ok: true });
		return;
	}
	if (pathname === '/__exact-benchmark/snapshot') {
		await collectGarbage();
		writeJson(response, telemetry());
		return;
	}
	if (pathname === '/__exact-benchmark/telemetry') {
		writeJson(response, telemetry());
		return;
	}
	if (pathname === '/__exact-benchmark/shutdown') {
		writeJson(response, { ok: true });
		response.once('finish', () => void shutdown('control'));
		return;
	}
	response.writeHead(404, { 'content-type': 'application/json' });
	response.end('{"error":"unknown benchmark control"}');
}

/** Reads cumulative process counters without injecting collection work into a measured lane. */
function telemetry() {
	return {
		pid: process.pid,
		cpu: process.cpuUsage(),
		memory: process.memoryUsage(),
		eventLoopDelayMs: eventLoopDelay
			? {
					p50: nanosecondsToMilliseconds(eventLoopDelay.percentile(50)),
					p75: nanosecondsToMilliseconds(eventLoopDelay.percentile(75)),
					p95: nanosecondsToMilliseconds(eventLoopDelay.percentile(95)),
					p99: nanosecondsToMilliseconds(eventLoopDelay.percentile(99)),
					max: nanosecondsToMilliseconds(eventLoopDelay.max)
				}
			: null,
		garbageCollection: { ...garbageCollection },
		statistics: {
			firstByteMs: [...statistics.firstByteMs],
			totalMs: [...statistics.totalMs],
			userCpuMs: [...statistics.userCpuMs],
			systemCpuMs: [...statistics.systemCpuMs]
		}
	};
}

/** Forces a full collection when the runtime exposes one, then yields for finalizers. */
async function collectGarbage() {
	if (typeof globalThis.gc === 'function') {
		globalThis.gc();
		globalThis.gc();
	} else if (globalThis.Bun && typeof globalThis.Bun.gc === 'function') {
		globalThis.Bun.gc(true);
	}
	await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
}

/** Closes framework resources and every listener owned by this worker before exiting. */
async function shutdown(reason) {
	if (shuttingDown) return;
	shuttingDown = true;
	eventLoopDelay?.disable();
	garbageCollectionObserver?.disconnect();
	const forcedExit = setTimeout(() => {
		for (const socket of sockets) socket.destroy();
		process.exitCode = 1;
	}, 2_000);
	forcedExit.unref?.();
	try {
		await participant.close();
		server.closeIdleConnections?.();
		await new Promise((resolveClose) => server.close(() => resolveClose()));
		publish({ type: 'closed', participantId, reason });
		clearTimeout(forcedExit);
		process.exit(0);
	} catch (error) {
		publish({ type: 'close-error', participantId, error: errorMessage(error) });
		for (const socket of sockets) socket.destroy();
		process.exit(1);
	}
}

/** Observes runtime collections without forcing collection inside measured request lanes. */
function createGarbageCollectionObserver() {
	if (typeof PerformanceObserver !== 'function') return undefined;
	try {
		const observer = new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) {
				garbageCollection.count += 1;
				garbageCollection.durationMs += entry.duration;
			}
		});
		observer.observe({ entryTypes: ['gc'] });
		return observer;
	} catch {
		return undefined;
	}
}

/** Converts the event-loop histogram's nanosecond values to milliseconds. */
function nanosecondsToMilliseconds(value) {
	return Number.isFinite(value) ? value / 1_000_000 : null;
}

function failResponse(response, error) {
	if (!response.headersSent)
		response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
	response.end(errorMessage(error));
}

function writeJson(response, value) {
	response.writeHead(200, {
		'cache-control': 'no-store',
		'content-type': 'application/json; charset=utf-8'
	});
	response.end(JSON.stringify(value));
}

function documentHtml(id, rendered, initialData) {
	const serialized = JSON.stringify(initialData).replaceAll('<', '\\u003c');
	return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="framework-participant" content="${id}"><title>Incident Operations</title></head><body><div id="app" data-render-mode="ssr">${rendered}</div><script id="comparison-data" type="application/json">${serialized}</script></body></html>`;
}

function publish(message) {
	process.stdout.write(`${protocolPrefix}${JSON.stringify(message)}\n`);
}

function errorMessage(error) {
	return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
