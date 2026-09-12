import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { hashStableSsrResponse } from './artifact-integrity.mjs';
import { arrivalDemand, arrivalOffsetMs, validateSsrLoadPlan } from './ssr-load-plan.mjs';
import { createLoadHistogram, createLoadProcessMeter } from './ssr-load-statistics.mjs';
import { createLoadErrorLog } from './ssr-load-errors.mjs';

/**
 * Runs validated HTTP load with bounded in-flight work and per-second summaries.
 * Arrival scheduling never waits for responses: overdue or capacity-limited arrivals are counted
 * as missed, not queued or silently removed from offered demand. Abort closes every owned socket.
 */
export async function runSsrLoadPlan(input, { signal, onInterval = () => {} } = {}) {
	const plan = validateSsrLoadPlan(input),
		url = new URL(plan.url);
	const transport = url.protocol === 'https:' ? https : http;
	const agent = new transport.Agent({
		keepAlive: true,
		// A finite bound lets Node retire free sockets before the server's keep-alive hint expires.
		timeout: plan.timeoutMs,
		maxSockets: plan.maxInFlight,
		maxFreeSockets: plan.maxInFlight,
		scheduling: 'lifo'
	});
	const meter = createLoadProcessMeter();
	try {
		const first = await receiveResponse(url, transport, agent, plan, signal);
		if (
			first.error ||
			first.status !== 200 ||
			(plan.contains && !first.body.includes(Buffer.from(plan.contains)))
		)
			throw new Error(
				`Load preflight failed: ${first.error ?? `HTTP ${first.status} / content mismatch`}`,
				{ cause: first.failure }
			);
		const identity = { bytes: first.body.length, hash: hashStableSsrResponse(first.body) };
		if (
			plan.expectedIdentity &&
			(plan.expectedIdentity.bytes !== identity.bytes ||
				plan.expectedIdentity.hash !== identity.hash)
		)
			throw new Error('Load preflight artifact response identity mismatch');
		const results = [];
		for (const stage of plan.stages) {
			signal?.throwIfAborted();
			results.push(
				await runStage(stage, plan, identity, url, transport, agent, meter, signal, onInterval)
			);
		}
		return {
			kind: 'sustained-ssr-load-v1',
			complete: true,
			identity,
			plan,
			driver: { pid: process.pid, node: process.version, platform: process.platform },
			stages: results
		};
	} finally {
		agent.destroy();
		meter.close();
	}
}

/** Owns stage admission, deadline accounting, response drain, and bounded interval storage. */
async function runStage(stage, plan, identity, url, transport, agent, meter, signal, onInterval) {
	const started = performance.now(),
		deadline = started + stage.durationMs;
	const active = new Set(),
		intervals = [],
		total = counters(),
		interval = counters();
	const histograms = distributions(),
		intervalHistograms = distributions();
	const errorDetails = createLoadErrorLog();
	let intervalErrors = createLoadErrorLog();
	let nextArrival = 0,
		lastIntervalAt = started,
		maxInFlight = 0,
		intervalMaxInFlight = 0;
	let validationMs = 0,
		intervalValidationMs = 0;
	meter.sample();
	const timer = setInterval(() => emit(false), 1000);
	try {
		if (stage.mode === 'concurrency') {
			await Promise.all(
				Array.from({ length: stage.concurrency }, async () => {
					while (performance.now() < deadline && !signal?.aborted) {
						increment('offered');
						await dispatch(performance.now());
					}
				})
			);
		} else {
			while (performance.now() < deadline && !signal?.aborted) {
				admitArrivals(performance.now());
				await pause(1, undefined, { signal });
			}
			// Scheduled demand survives a stalled driver even if it wakes after the stage deadline.
			const remaining = Math.ceil(arrivalDemand(stage, stage.durationMs)) - nextArrival;
			increment('offered', remaining);
			increment('missedDeadline', remaining);
		}
		await Promise.all([...active]);
		signal?.throwIfAborted();
		const elapsedMs = performance.now() - started;
		emit(true);
		return {
			...stage,
			startedAt: new Date(performance.timeOrigin + started).toISOString(),
			elapsedMs,
			admissionMs: stage.durationMs,
			drainMs: Math.max(0, elapsedMs - stage.durationMs),
			...total,
			errorDetails: errorDetails.snapshot(),
			maxInFlight,
			validationMs,
			offeredRps: (total.offered / stage.durationMs) * 1000,
			completedRps: (total.completed / elapsedMs) * 1000,
			validRps: (total.valid / elapsedMs) * 1000,
			completedDuringAdmissionRps: (total.completedDuringAdmission / stage.durationMs) * 1000,
			distributions: snapshots(histograms),
			intervals
		};
	} finally {
		clearInterval(timer);
		await Promise.allSettled([...active]);
	}

	/** Updates whole-stage and current-interval accounting together. */
	function increment(name, amount = 1) {
		total[name] += amount;
		interval[name] += amount;
	}

	/** Skips expired arrivals in bulk, then admits remaining due arrivals without a hidden queue. */
	function admitArrivals(now) {
		const elapsed = now - started;
		const due = Math.ceil(arrivalDemand(stage, elapsed));
		const expired = Math.min(due, Math.ceil(arrivalDemand(stage, elapsed - plan.maxLagMs)));
		if (expired > nextArrival) {
			const missed = expired - nextArrival;
			increment('offered', missed);
			increment('missedLag', missed);
			nextArrival = expired;
		}
		while (nextArrival < due) {
			const scheduledAt = started + arrivalOffsetMs(stage, nextArrival++);
			increment('offered');
			if (active.size >= plan.maxInFlight) increment('missedCapacity');
			else void dispatch(scheduledAt);
		}
	}

	/** Records completion before validation, while charging validation CPU to the independent driver. */
	function dispatch(scheduledAt) {
		increment('started');
		const issuedAt = performance.now();
		record('schedulingLagMs', issuedAt - scheduledAt);
		const pending = receiveResponse(url, transport, agent, plan, signal)
			.then((response) => {
				increment('completed');
				if (response.completedAt <= deadline) increment('completedDuringAdmission');
				record('responseMs', response.completedAt - issuedAt);
				record('scheduledResponseMs', response.completedAt - scheduledAt);
				if (response.ttfbMs !== null) record('ttfbMs', response.ttfbMs);
				if (response.error) {
					increment('errors');
					logFailure(response.error, response);
					if (response.error === 'LOAD_TIMEOUT') increment('timeouts');
					return;
				}
				const checking = performance.now();
				const valid =
					response.status === 200 &&
					response.body.length === identity.bytes &&
					hashStableSsrResponse(response.body) === identity.hash;
				const checkedMs = performance.now() - checking;
				validationMs += checkedMs;
				intervalValidationMs += checkedMs;
				increment(valid ? 'valid' : 'invalid');
				if (!valid) {
					increment('errors');
					logFailure(
						response.status !== 200
							? `HTTP_${response.status}`
							: response.body.length !== identity.bytes
								? 'LOAD_LENGTH_MISMATCH'
								: 'LOAD_HASH_MISMATCH',
						response
					);
				}
			})
			.finally(() => active.delete(pending));
		active.add(pending);
		maxInFlight = Math.max(maxInFlight, active.size);
		intervalMaxInFlight = Math.max(intervalMaxInFlight, active.size);
		return pending;
	}

	/** Records classified failures at both stage and interval boundaries, without response contents. */
	function logFailure(code, response) {
		const details = {
			code,
			at: new Date(performance.timeOrigin + response.completedAt).toISOString(),
			offsetMs: response.completedAt - started,
			status: response.status ?? null,
			...response.failure
		};
		errorDetails.record(details);
		intervalErrors.record(details);
	}

	/** Adds a timing to both fixed-size distributions. */
	function record(name, value) {
		histograms[name].record(value);
		intervalHistograms[name].record(value);
	}

	/** Emits actual interval duration, including delayed ticks and final drain rather than assuming 1s. */
	function emit(final) {
		const now = performance.now();
		const row = {
			stage: stage.name,
			final,
			offsetMs: now - started,
			elapsedMs: now - lastIntervalAt,
			...interval,
			errorDetails: intervalErrors.snapshot(),
			inFlight: active.size,
			maxInFlight: intervalMaxInFlight,
			validationMs: intervalValidationMs,
			distributions: snapshots(intervalHistograms),
			process: meter.sample()
		};
		intervals.push(row);
		onInterval(row);
		for (const key of Object.keys(interval)) interval[key] = 0;
		for (const histogram of Object.values(intervalHistograms)) histogram.reset();
		lastIntervalAt = now;
		intervalMaxInFlight = active.size;
		intervalValidationMs = 0;
		intervalErrors = createLoadErrorLog();
	}
}

/** Returns a response or classified failure with an absolute deadline and bounded body allocation. */
function receiveResponse(url, transport, agent, plan, signal) {
	return new Promise((resolve) => {
		const started = performance.now();
		let settled = false,
			timeout,
			failureCode;
		const outgoing = transport.request(
			url,
			{ agent, signal, headers: { connection: 'keep-alive' } },
			(response) => {
				const ttfbMs = performance.now() - started,
					chunks = [];
				let bytes = 0;
				response.on('data', (chunk) => {
					if (settled || failureCode) return;
					bytes += chunk.length;
					if (bytes > plan.maxResponseBytes) {
						failureCode = 'LOAD_BODY_LIMIT';
						// Classify locally: a complete response may already have returned its socket to
						// the agent, so attaching an error to request.destroy can escape request listeners.
						response.destroy();
						outgoing.destroy();
						finish({ error: failureCode, ttfbMs });
					} else chunks.push(chunk);
				});
				response.once('end', () =>
					finish({ status: response.statusCode, body: Buffer.concat(chunks), ttfbMs })
				);
				response.on('error', (error) =>
					finish({
						error: error.code ?? error.name,
						message: error.message,
						phase: 'response',
						ttfbMs
					})
				);
			}
		);
		timeout = setTimeout(() => {
			failureCode = 'LOAD_TIMEOUT';
			outgoing.destroy(
				Object.assign(new Error('Load request deadline exceeded'), { code: failureCode })
			);
		}, plan.timeoutMs);
		outgoing.on('error', (error) =>
			finish({
				error: error.code ?? error.name,
				message: error.message,
				phase: 'request',
				ttfbMs: null
			})
		);
		outgoing.end();
		/** Settles exactly once across response, timeout, cancellation, and socket errors. */
		function finish(result) {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve({
				...result,
				...(failureCode || result.error
					? {
							failure: {
								phase: result.phase ?? 'response',
								message: String(result.message ?? failureCode ?? result.error).slice(0, 512),
								reusedSocket: outgoing.reusedSocket,
								localPort: outgoing.socket?.localPort ?? null,
								remotePort: outgoing.socket?.remotePort ?? null,
								requestDurationMs: performance.now() - started
							}
						}
					: {}),
				...(failureCode ? { error: failureCode } : {}),
				completedAt: performance.now()
			});
		}
	});
}

/** Initializes explicit demand, completion, validation, and overload counters. */
function counters() {
	return {
		offered: 0,
		started: 0,
		completed: 0,
		completedDuringAdmission: 0,
		valid: 0,
		invalid: 0,
		errors: 0,
		timeouts: 0,
		missedLag: 0,
		missedCapacity: 0,
		missedDeadline: 0
	};
}

/** Creates bounded latency distributions owned by a stage or interval. */
function distributions() {
	return Object.fromEntries(
		['responseMs', 'scheduledResponseMs', 'ttfbMs', 'schedulingLagMs'].map((name) => [
			name,
			createLoadHistogram()
		])
	);
}

/** Materializes report values without retaining histogram implementations. */
function snapshots(values) {
	return Object.fromEntries(
		Object.entries(values).map(([name, histogram]) => [name, histogram.snapshot()])
	);
}
