import { PerformanceObserver, monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeNodeResponse } from '@exactjs/node-adapter';
import { createExactProducedResponse } from '@exactjs/server';
import { startSsrBenchmarkHost } from './ssr-benchmark-host.mjs';
import { comparisonDocumentHtml, responseByteBreakdown } from './ssr-response-breakdown.mjs';
import { usesNativeBunServer } from './ssr-benchmark-transport.mjs';
import {
	benchmarkPayloadTarget,
	equalizeFetchResponsePayload,
	equalizeNodeResponsePayload,
	payloadRouteBytes,
	renderOnlyDiagnostic
} from './ssr-worker-diagnostics.mjs';

const exactDocumentPrefix =
	'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="framework-participant" content="exact"><title>Incident Operations</title></head><body><div id="app" data-render-mode="ssr">';
const exactDocumentSuffix = '</div></body></html>';
const exactDocumentEnvelopeBytes =
	Buffer.byteLength(exactDocumentPrefix) + Buffer.byteLength(exactDocumentSuffix);

const participantId = process.argv[2];
const requestedPort = Number(process.argv[3] ?? 0);
const runtimeId = process.argv[4];
const transport = process.argv[5];
const suiteRoot = resolve(import.meta.dirname, '..');
const serviceUrl = process.env.COMPARISON_SERVICE_URL ?? 'http://127.0.0.1:4310';
const protocolPrefix = 'EXACT_SSR_BENCHMARK:';
const statistics = {
	firstByteMs: [],
	totalMs: [],
	userCpuMs: [],
	systemCpuMs: [],
	dataLoadMs: [],
	dataFetchMs: [],
	dataDecodeMs: [],
	renderMs: [],
	envelopeMs: [],
	renderedBytes: [],
	responseBytes: [],
	participantWorkMs: []
};
const eventLoopDelay =
	typeof monitorEventLoopDelay === 'function'
		? monitorEventLoopDelay({ resolution: 1 })
		: undefined;
const garbageCollection = { count: 0, durationMs: 0 };
const garbageCollectionObserver = createGarbageCollectionObserver();
let shuttingDown = false;

if (!participantId || !runtimeId || !transport)
	throw new Error('SSR benchmark worker requires participant, runtime, and transport identities');
if (usesNativeBunServer(transport) && runtimeId !== 'bun')
	throw new Error(`Native Bun transport cannot run under ${runtimeId}`);

eventLoopDelay?.enable();

const participant = await createParticipantHandler(participantId);
const host = await startSsrBenchmarkHost({
	transport,
	port: requestedPort,
	handleNodeControl: handleNodeControlRequest,
	handleFetchControl: handleFetchControlRequest,
	handleFetchRequest: measureFetchRequest,
	handleNodeRequest(request, response) {
		equalizeNodeResponsePayload(request, response);
		measureNodeRequest(response);
		void measureNodeParticipantWork(response, () => participant.handle(request, response)).catch(
			(error) => failNodeResponse(response, error)
		);
	}
});
publish({ type: 'ready', participantId, pid: process.pid, port: host.port, transport });

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

/** Creates the production SSR request handler without starting a descendant process. */
async function createParticipantHandler(id) {
	if (usesNativeBunServer(transport)) {
		if (id !== 'exact')
			throw new Error(`Participant ${id} declares bun-fetch without a native benchmark entry`);
		const entry = process.env.COMPARISON_EXACT_SERVER_ENTRY
			? resolve(process.env.COMPARISON_EXACT_SERVER_ENTRY)
			: resolve(suiteRoot, 'participants', 'exact', 'dist-bun-server', 'bun-server-entry.js');
		const { renderParticipantBunResponse } = await import(pathToFileURL(entry).href);
		let diagnosticData;
		return {
			async handle(request) {
				return measureAsyncPhase('participantWorkMs', async () => {
					const url = new URL(request.url);
					const initialData = url.searchParams.has('__benchmarkPreloaded')
						? (diagnosticData ??= await loadInitialData())
						: await measureAsyncPhase('dataLoadMs', () =>
								loadInitialData(url.searchParams.has('__benchmarkServicePhases'))
							);
					const response = measureSyncPhase('renderMs', () =>
						renderParticipantBunResponse(initialData, url.pathname)
					);
					return equalizeFetchResponsePayload(response, benchmarkPayloadTarget(url));
				});
			},
			async close() {}
		};
	}
	if (id === 'exact' || id === 'react') {
		const selectedEntry = id === 'exact' ? process.env.COMPARISON_EXACT_SERVER_ENTRY : undefined;
		const entry = selectedEntry
			? resolve(selectedEntry)
			: resolve(suiteRoot, 'participants', id, 'dist-server', 'server-entry.js');
		const { renderParticipant, renderParticipantToSink } = await import(pathToFileURL(entry).href);
		let diagnosticData;
		return {
			async handle(request, response) {
				const url = new URL(request.url ?? '/', 'http://localhost');
				const initialData = url.searchParams.has('__benchmarkPreloaded')
					? (diagnosticData ??= await loadInitialData())
					: await measureAsyncPhase('dataLoadMs', () =>
							loadInitialData(url.searchParams.has('__benchmarkServicePhases'))
						);
				const produced =
					id === 'exact' &&
					renderParticipantToSink &&
					!url.searchParams.has('__benchmarkAcceptedResponse');
				if (produced) {
					const result = createExactProducedDocument(
						initialData,
						url.pathname,
						benchmarkPayloadTarget(url),
						renderParticipantToSink
					);
					await measureAsyncPhase('renderMs', () =>
						writeNodeResponse(response, result, request.signal)
					);
					return;
				}
				const rendered = await measureAsyncPhase('renderMs', () =>
					renderParticipant(initialData, url.pathname)
				);
				statistics.renderedBytes.push(Buffer.byteLength(rendered));
				const document = measureSyncPhase('envelopeMs', () =>
					documentHtml(id, rendered, initialData, benchmarkPayloadTarget(url))
				);
				statistics.responseBytes.push(Buffer.byteLength(document));
				response.writeHead(200, {
					'cache-control': 'no-store',
					'content-type': 'text/html; charset=utf-8'
				});
				response.end(document);
			},
			async renderOnly(iterations, diagnosticUrl) {
				diagnosticData ??= await loadInitialData();
				const samplesMs = [];
				let responseBytes = 0;
				const produced =
					id === 'exact' && renderParticipantToSink && !diagnosticUrl?.searchParams.has('accepted');
				for (let index = 0; index < iterations; index++) {
					const startedAt = performance.now();
					let document;
					if (produced) {
						let pending = '';
						responseBytes =
							renderParticipantToSink(
								diagnosticData,
								'/incidents/inc-101',
								(chunk) => {
									pending += chunk;
									if (pending.length >= 8 * 1024) pending = '';
								},
								Buffer.byteLength
							) + exactDocumentEnvelopeBytes;
						document = pending;
					} else {
						const rendered = await renderParticipant(diagnosticData, '/incidents/inc-101');
						document = documentHtml(id, rendered, diagnosticData);
						responseBytes = Buffer.byteLength(document);
					}
					samplesMs.push(performance.now() - startedAt);
				}
				return { samplesMs, responseBytes };
			},
			async responseBreakdown() {
				diagnosticData ??= await loadInitialData();
				const rendered = await renderParticipant(diagnosticData, '/incidents/inc-101');
				return responseByteBreakdown(id, rendered, diagnosticData);
			},
			async close() {}
		};
	}
	if (id === 'sveltekit') {
		const entry = resolve(suiteRoot, 'participants', 'sveltekit', 'build', 'handler.js');
		const { handler } = await import(pathToFileURL(entry).href);
		return {
			handle(request, response) {
				return handler(request, response);
			},
			async close() {}
		};
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
		const handler = nitro.t(application.h3App);
		return {
			handle(request, response) {
				return handler(request, response);
			},
			async close() {
				await application.hooks.callHook('close');
			}
		};
	}
	throw new Error(`Unknown SSR benchmark participant ${id}`);
}

/** Records one asynchronous participant phase without changing its failure behavior. */
async function measureAsyncPhase(name, work) {
	const startedAt = performance.now();
	try {
		return await work();
	} finally {
		statistics[name].push(performance.now() - startedAt);
	}
}

/** Records one synchronous participant phase without introducing a promise boundary. */
function measureSyncPhase(name, work) {
	const startedAt = performance.now();
	try {
		return work();
	} finally {
		statistics[name].push(performance.now() - startedAt);
	}
}

/** Loads the same controlled-service data used by the framework-owned server routes. */
async function loadInitialData(profileServicePhases = false) {
	const fetchData = () =>
		Promise.all([fetch(`${serviceUrl}/api/session`), fetch(`${serviceUrl}/api/incidents`)]);
	const [sessionResponse, incidentsResponse] = profileServicePhases
		? await measureAsyncPhase('dataFetchMs', fetchData)
		: await fetchData();
	if (!sessionResponse.ok || !incidentsResponse.ok)
		throw new Error(
			`Controlled service failed: session=${sessionResponse.status} incidents=${incidentsResponse.status}`
		);
	const decodeData = () => Promise.all([sessionResponse.json(), incidentsResponse.json()]);
	const [session, incidents] = profileServicePhases
		? await measureAsyncPhase('dataDecodeMs', decodeData)
		: await decodeData();
	return { ...session, ...incidents };
}

/** Instruments Node response first-byte and socket-completion phases. */
function measureNodeRequest(response) {
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

/** Measures a Node participant from handler entry through the response finish event. */
async function measureNodeParticipantWork(response, work) {
	const startedAt = performance.now();
	const finished = responseFinished(response);
	try {
		await work();
		await finished;
	} finally {
		statistics.participantWorkMs.push(performance.now() - startedAt);
	}
}

function responseFinished(response) {
	if (response.writableFinished) return Promise.resolve();
	return new Promise((resolveFinished) => {
		const settle = () => {
			response.removeListener('finish', settle);
			response.removeListener('close', settle);
			resolveFinished();
		};
		response.once('finish', settle);
		response.once('close', settle);
	});
}

/** Measures native Fetch handler work through creation of its immutable Response. */
async function measureFetchRequest(request) {
	const startedAt = performance.now();
	const cpuStarted = process.cpuUsage();
	try {
		const response = await participant.handle(request);
		recordRequestStatistics(startedAt, cpuStarted);
		return response;
	} catch (error) {
		recordRequestStatistics(startedAt, cpuStarted);
		return new Response(errorMessage(error), {
			status: 500,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}
}

/** Records one handler completion against the worker-local timing and CPU counters. */
function recordRequestStatistics(startedAt, cpuStarted) {
	const completedAt = performance.now();
	const cpu = process.cpuUsage(cpuStarted);
	statistics.firstByteMs.push(completedAt - startedAt);
	statistics.totalMs.push(completedAt - startedAt);
	statistics.userCpuMs.push(cpu.user / 1_000);
	statistics.systemCpuMs.push(cpu.system / 1_000);
}

/** Serves process telemetry and deterministic lifecycle control through Node HTTP. */
async function handleNodeControlRequest(request, response) {
	const url = new URL(request.url ?? '/', 'http://localhost');
	const { pathname } = url;
	if (pathname === '/__exact-benchmark/reset') {
		resetTelemetry();
		await primeBunEventLoopHistogram();
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
	if (pathname === '/__exact-benchmark/render-only') {
		writeJson(response, await renderOnlyDiagnostic(participant, url));
		return;
	}
	if (pathname === '/__exact-benchmark/response-breakdown') {
		writeJson(
			response,
			participant.responseBreakdown
				? await participant.responseBreakdown()
				: { supported: false, reason: 'participant-renderer-not-exposed' }
		);
		return;
	}
	const payloadBytes = payloadRouteBytes(pathname);
	if (payloadBytes !== undefined) {
		response.writeHead(200, { 'content-type': 'application/octet-stream' });
		response.end('x'.repeat(payloadBytes));
		return;
	}
	response.writeHead(404, { 'content-type': 'application/json' });
	response.end('{"error":"unknown benchmark control"}');
}

/** Serves process telemetry and deterministic lifecycle control through native Fetch responses. */
async function handleFetchControlRequest(request) {
	const url = new URL(request.url);
	const { pathname } = url;
	if (pathname === '/__exact-benchmark/reset') {
		resetTelemetry();
		await primeBunEventLoopHistogram();
		return jsonFetchResponse({ ok: true });
	}
	if (pathname === '/__exact-benchmark/snapshot') {
		await collectGarbage();
		return jsonFetchResponse(telemetry());
	}
	if (pathname === '/__exact-benchmark/telemetry') return jsonFetchResponse(telemetry());
	if (pathname === '/__exact-benchmark/shutdown') {
		setTimeout(() => void shutdown('control'), 0);
		return jsonFetchResponse({ ok: true });
	}
	if (pathname === '/__exact-benchmark/render-only')
		return jsonFetchResponse(await renderOnlyDiagnostic(participant, url));
	if (pathname === '/__exact-benchmark/response-breakdown')
		return jsonFetchResponse(
			participant.responseBreakdown
				? await participant.responseBreakdown()
				: { supported: false, reason: 'participant-renderer-not-exposed' }
		);
	const payloadBytes = payloadRouteBytes(pathname);
	if (payloadBytes !== undefined) return new Response('x'.repeat(payloadBytes));
	return new Response('{"error":"unknown benchmark control"}', {
		status: 404,
		headers: { 'content-type': 'application/json' }
	});
}

/** Waits for Bun's coarse event-loop monitor to observe the reset lane before requests begin. */
async function primeBunEventLoopHistogram() {
	if (!eventLoopDelay || !globalThis.Bun) return;
	const deadline = performance.now() + 100;
	do {
		await new Promise((resolveTurn) => setTimeout(resolveTurn, 10));
	} while (eventLoopDelay.count === 0 && performance.now() < deadline);
	if (eventLoopDelay.count === 0)
		throw new Error('Bun event-loop monitor did not observe the reset measurement lane');
}

/** Clears request-lane telemetry without affecting application or host ownership. */
function resetTelemetry() {
	for (const values of Object.values(statistics)) values.length = 0;
	eventLoopDelay?.reset();
	garbageCollection.count = 0;
	garbageCollection.durationMs = 0;
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
					count: eventLoopDelay.count,
					max: nanosecondsToMilliseconds(eventLoopDelay.max)
				}
			: null,
		garbageCollection: { ...garbageCollection },
		statistics: {
			...Object.fromEntries(Object.entries(statistics).map(([name, values]) => [name, [...values]]))
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
		void host.forceClose();
		process.exitCode = 1;
	}, 2_000);
	forcedExit.unref?.();
	try {
		await participant.close();
		await host.close();
		publish({ type: 'closed', participantId, reason });
		clearTimeout(forcedExit);
		process.exit(0);
	} catch (error) {
		publish({ type: 'close-error', participantId, error: errorMessage(error) });
		await host.forceClose();
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

function failNodeResponse(response, error) {
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

function jsonFetchResponse(value) {
	return Response.json(value, {
		headers: { 'cache-control': 'no-store' }
	});
}

function documentHtml(id, rendered, initialData, payloadTarget) {
	return comparisonDocumentHtml(id, rendered, initialData, payloadTarget);
}

function createExactProducedDocument(initialData, path, payloadTarget, renderParticipantToSink) {
	return createExactProducedResponse(
		200,
		{
			'cache-control': 'no-store',
			'content-type': 'text/html; charset=utf-8'
		},
		(write, environment) => {
			write(exactDocumentPrefix);
			const renderedBytes = renderParticipantToSink(
				initialData,
				path,
				write,
				environment?.encodedByteLength
			);
			const baseBytes = exactDocumentEnvelopeBytes + renderedBytes;
			const padding =
				payloadTarget === undefined ? '' : ' '.repeat(Math.max(0, payloadTarget - baseBytes));
			statistics.renderedBytes.push(renderedBytes);
			statistics.responseBytes.push(baseBytes + Buffer.byteLength(padding));
			write(`${exactDocumentSuffix}${padding}`);
		}
	);
}

function publish(message) {
	process.stdout.write(`${protocolPrefix}${JSON.stringify(message)}\n`);
}

function errorMessage(error) {
	return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
