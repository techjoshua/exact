import {
	DomainInputError,
	DomainNotFoundError,
	IncidentConflictError,
	IncidentStore
} from './incident-store.mjs';

/** Creates an isolated Fetch-compatible service and its explicit lifecycle controls. */
export function createComparisonService(fixture, options = {}) {
	const store = new IncidentStore(fixture, options);
	const delayMs = options.analysisDelayMs ?? 25;
	const timers = new Set();
	const eventStreams = new Set();
	let injectedFailure = null;

	const schedule = (callback, delay) => {
		const timer = setTimeout(() => {
			timers.delete(timer);
			callback();
		}, delay);
		timer.unref?.();
		timers.add(timer);
	};

	const scheduleAnalysis = (job) => {
		schedule(() => store.advanceJob(job.id, 'running'), delayMs);
		schedule(
			() => store.advanceJob(job.id, 'completed', { finding: 'Correlated upstream failures' }),
			delayMs * 2
		);
	};

	return {
		store,
		/** Handles one controlled-track request without depending on a Node server adapter. */
		async fetch(request) {
			try {
				const url = new URL(request.url);
				const segments = url.pathname.split('/').filter(Boolean);
				if (request.method === 'OPTIONS') return preflight();
				if (
					injectedFailure?.remaining > 0 &&
					request.method === injectedFailure.method &&
					url.pathname === injectedFailure.path
				) {
					injectedFailure.remaining -= 1;
					return error(injectedFailure.status, 'injected_failure', 'Injected benchmark failure');
				}

				if (request.method === 'GET' && url.pathname === '/health')
					return json({ status: 'ready' });
				if (request.method === 'POST' && url.pathname === '/__benchmark/reset') {
					if (request.headers.get('x-benchmark-control') !== 'fixture-reset')
						return error(403, 'forbidden', 'benchmark reset requires the control header');
					const body = await readJson(request);
					for (const timer of timers) clearTimeout(timer);
					timers.clear();
					if (body.disconnectEvents === true) {
						for (const stream of eventStreams) {
							stream.unsubscribe();
							stream.controller.close();
						}
						eventStreams.clear();
					}
					injectedFailure = body.failure
						? {
								method: body.failure.method ?? 'GET',
								path: body.failure.path,
								status: body.failure.status ?? 503,
								remaining: body.failure.count ?? 1
							}
						: null;
					store.reset({ empty: body.empty === true });
					return json({ status: 'reset' });
				}
				if (request.method === 'GET' && url.pathname === '/api/session') {
					const snapshot = store.snapshot();
					return json({ sessionUserId: snapshot.sessionUserId, users: snapshot.users });
				}
				if (request.method === 'GET' && url.pathname === '/api/incidents')
					return json({ incidents: store.listIncidents() });
				if (request.method === 'GET' && url.pathname === '/api/events')
					return eventStream(store, eventStreams);
				if (segments[0] === 'api' && segments[1] === 'incidents' && segments[2]) {
					const incidentId = segments[2];
					if (request.method === 'GET' && segments.length === 3) {
						const incident = store.getIncident(incidentId);
						return incident ? json({ incident }) : error(404, 'not_found', 'incident not found');
					}
					if (request.method === 'POST' && segments[3] === 'claim') {
						const body = await readJson(request);
						return json({
							incident: store.claimIncident(incidentId, body.actorId, body.expectedVersion)
						});
					}
					if (request.method === 'POST' && segments[3] === 'comments') {
						const body = await readJson(request);
						return json(
							store.addComment(incidentId, body.actorId, body.body, body.clientMutationId),
							201
						);
					}
					if (request.method === 'POST' && segments[3] === 'analysis') {
						const job = store.startAnalysis(incidentId);
						scheduleAnalysis(job);
						return json({ job }, 202);
					}
				}
				if (request.method === 'GET' && segments[0] === 'api' && segments[1] === 'jobs') {
					const job = store.getJob(segments[2]);
					return job ? json({ job }) : error(404, 'not_found', 'job not found');
				}
				return error(404, 'not_found', 'route not found');
			} catch (caught) {
				if (caught instanceof IncidentConflictError)
					return error(409, 'version_conflict', caught.message, caught.current);
				if (caught instanceof DomainNotFoundError) return error(404, 'not_found', caught.message);
				if (caught instanceof DomainInputError || caught instanceof SyntaxError)
					return error(400, 'invalid_input', caught.message);
				throw caught;
			}
		},
		/** Releases pending task timers owned by this service instance. */
		dispose() {
			for (const timer of timers) clearTimeout(timer);
			timers.clear();
		}
	};
}

function eventStream(store, streams) {
	const encoder = new TextEncoder();
	let unsubscribe;
	let activeStream;
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(': connected\n\n'));
			unsubscribe = store.subscribe((event) => {
				controller.enqueue(
					encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.value)}\n\n`)
				);
			});
			activeStream = { controller, unsubscribe };
			streams.add(activeStream);
		},
		cancel() {
			if (activeStream) streams.delete(activeStream);
			unsubscribe?.();
		}
	});
	return new Response(stream, {
		headers: {
			'access-control-allow-origin': '*',
			'cache-control': 'no-cache',
			'content-type': 'text/event-stream',
			connection: 'keep-alive'
		}
	});
}

async function readJson(request) {
	if (!request.headers.get('content-type')?.includes('application/json'))
		throw new DomainInputError('request must use application/json');
	return await request.json();
}

function json(value, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			'access-control-allow-origin': '*',
			'content-type': 'application/json; charset=utf-8'
		}
	});
}

function preflight() {
	return new Response(null, {
		status: 204,
		headers: {
			'access-control-allow-headers': 'content-type,x-benchmark-control',
			'access-control-allow-methods': 'GET,POST,OPTIONS',
			'access-control-allow-origin': '*',
			'access-control-max-age': '600'
		}
	});
}

function error(status, code, message, current) {
	return json({ error: { code, message, ...(current ? { current } : {}) } }, status);
}
