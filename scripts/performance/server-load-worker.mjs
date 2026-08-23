import { createServer } from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const fixture = requiredEnvironment('EXACT_SERVER_PERFORMANCE_FIXTURE');
const moduleStarted = performance.now();
const module = await import(`${pathToFileURL(fixture).href}?server=${process.pid}`);
const moduleEvaluationMs = performance.now() - moduleStarted;
if (typeof module.renderServerHttpRequest !== 'function')
	throw new TypeError('Server performance fixture must export renderServerHttpRequest');

let requestCount = 0;
let errorCount = 0;
let loopDelays = [];
let loopDelayCursor = 0;
let monitoring = false;
let baselineMemory = memoryUsage();
let peakMemory = { ...baselineMemory };
let expectedTick = performance.now() + 10;
const monitor = setInterval(() => {
	const now = performance.now();
	if (monitoring) {
		const delay = Math.max(0, now - expectedTick);
		if (loopDelays.length < 4_096) loopDelays.push(delay);
		else {
			loopDelays[loopDelayCursor] = delay;
			loopDelayCursor = (loopDelayCursor + 1) % loopDelays.length;
		}
		const memory = memoryUsage();
		peakMemory.heapUsed = Math.max(peakMemory.heapUsed, memory.heapUsed);
		peakMemory.rss = Math.max(peakMemory.rss, memory.rss);
	}
	expectedTick = now + 10;
}, 10);
monitor.unref();

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');
		if (url.pathname === '/__exact/reset') {
			await resetMeasurements();
			writeJson(response, { ok: true, moduleEvaluationMs, baselineMemory });
			return;
		}
		if (url.pathname === '/__exact/metrics') {
			monitoring = false;
			await settleGarbageCollection();
			const snapshot = {
				requestCount,
				errorCount,
				loopDelays,
				baselineMemory,
				peakMemory,
				currentMemory: memoryUsage()
			};
			monitoring = true;
			writeJson(response, snapshot);
			return;
		}
		if (url.pathname === '/__exact/shutdown') {
			writeJson(response, { ok: true });
			response.once('finish', () => server.close());
			return;
		}
		if (url.pathname !== '/render') {
			response.writeHead(404).end('Not found');
			return;
		}

		const id = Number(url.searchParams.get('id'));
		if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Request id must be positive');
		const started = performance.now();
		const html = await module.renderServerHttpRequest(id);
		const renderMs = performance.now() - started;
		requestCount++;
		response.setHeader('content-type', 'text/html; charset=utf-8');
		response.setHeader('x-exact-render-ms', renderMs.toFixed(6));
		response.setHeader('content-length', Buffer.byteLength(html));
		response.end(html);
	} catch (error) {
		errorCount++;
		response.statusCode = 500;
		response.end(error instanceof Error ? error.message : String(error));
	}
});

server.listen(0, '127.0.0.1', () => {
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('HTTP server did not bind a port');
	process.stdout.write(
		`EXACT_SERVER_READY=${JSON.stringify({ port: address.port, moduleEvaluationMs })}\n`
	);
});

server.once('close', () => {
	clearInterval(monitor);
});

async function resetMeasurements() {
	monitoring = false;
	await settleGarbageCollection();
	requestCount = 0;
	errorCount = 0;
	loopDelays = [];
	loopDelayCursor = 0;
	baselineMemory = memoryUsage();
	peakMemory = { ...baselineMemory };
	expectedTick = performance.now() + 10;
	monitoring = true;
}

async function settleGarbageCollection() {
	for (let pass = 0; pass < 3; pass++) {
		if (typeof globalThis.Bun?.gc === 'function') globalThis.Bun.gc(true);
		else globalThis.gc?.();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

function memoryUsage() {
	const value = process.memoryUsage();
	return { heapUsed: value.heapUsed, rss: value.rss };
}

function writeJson(response, value) {
	const body = JSON.stringify(value);
	response.setHeader('content-type', 'application/json');
	response.setHeader('content-length', Buffer.byteLength(body));
	response.end(body);
}

function requiredEnvironment(name) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}
