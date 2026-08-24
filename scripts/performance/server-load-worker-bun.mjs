import process from 'node:process';
import { pathToFileURL } from 'node:url';

if (!globalThis.Bun) throw new Error('The native Bun server worker requires the Bun runtime');

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

const server = Bun.serve({
	hostname: '127.0.0.1',
	port: 0,
	async fetch(request) {
		try {
			const url = new URL(request.url);
			if (url.pathname === '/__exact/reset') {
				await resetMeasurements();
				return jsonResponse({ ok: true, moduleEvaluationMs, baselineMemory });
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
				return jsonResponse(snapshot);
			}
			if (url.pathname === '/__exact/shutdown') {
				setTimeout(() => {
					clearInterval(monitor);
					void server.stop();
				}, 0);
				return jsonResponse({ ok: true });
			}
			if (url.pathname !== '/render') return new Response('Not found', { status: 404 });

			const id = Number(url.searchParams.get('id'));
			if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Request id must be positive');
			const started = performance.now();
			const html = await module.renderServerHttpRequest(id);
			const renderMs = performance.now() - started;
			requestCount++;
			return new Response(html, {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					'x-exact-render-ms': renderMs.toFixed(6)
				}
			});
		} catch (error) {
			errorCount++;
			return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
		}
	}
});

process.stdout.write(
	`EXACT_SERVER_READY=${JSON.stringify({ port: server.port, moduleEvaluationMs })}\n`
);

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
		Bun.gc(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

function memoryUsage() {
	const value = process.memoryUsage();
	return { heapUsed: value.heapUsed, rss: value.rss };
}

function jsonResponse(value) {
	return Response.json(value);
}

function requiredEnvironment(name) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}
