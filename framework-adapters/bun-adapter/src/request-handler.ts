import {
	bindRequestRenderScheduler,
	type RequestRenderScheduler
} from '@exactjs/server/framework/render-scheduling';
import { BunRequestGate } from './adaptive-gate.js';
import { createBunRenderScheduler } from './render-scheduler.js';

const admissionOwner = Symbol('exact.bun.admission');
type AdmittedRequest = Request & { [admissionOwner]?: true };

/** Native Bun host observation available to its Fetch callback. */
export interface BunRequestServer {
	readonly pendingRequests: number;
}

/** Automatic native Fetch admission controls. */
export interface BunSchedulingOptions {
	/** Trials scheduling under sustained load and retains observed benefits. Defaults to true. */
	adaptive?: boolean;
	/** Maximum starts released per scheduled callback. Defaults to 32. */
	maxBatchSize?: number;
}

/**
 * Wraps an entire Bun.serve Fetch dispatcher with automatic admission. Pass Bun's server argument
 * through wrappers and route all HTTP requests through this handler, rather than Bun's routes map:
 * request drain is derived from all observed starts and the host's native pendingRequests counter.
 * Each request still executes its own handler and owns its original Response. Calls without a
 * native server remain immediate. Sparse traffic creates no monitoring timer.
 */
export function createBunRequestHandler<S extends BunRequestServer = BunRequestServer>(
	handler: (request: Request, server?: S) => Response | Promise<Response>,
	options: BunSchedulingOptions = {}
): (request: Request, server?: S) => Response | Promise<Response> {
	const enqueue = createBunRenderScheduler(options);
	const gates = new WeakMap<S, { gate: BunRequestGate; checkpoint: RequestRenderScheduler }>();
	return (request, server) => {
		if (request.signal.aborted) return Promise.reject(request.signal.reason);
		const owned = request as AdmittedRequest;
		if (owned[admissionOwner]) return handler(request, server);
		// A top-level page dispatcher owns admission when it calls an endpoint handler.
		if (server) owned[admissionOwner] = true;
		if (server && options.adaptive !== false) {
			let entry = gates.get(server);
			if (!entry) {
				const gate = new BunRequestGate(() => server.pendingRequests);
				entry = {
					gate,
					checkpoint: (signal) => {
						signal?.throwIfAborted();
						return gate.shouldSchedule() ? enqueue(signal) : undefined;
					}
				};
				gates.set(server, entry);
			}
			const { gate, checkpoint } = entry;
			bindRequestRenderScheduler(request.signal, checkpoint);
			gate.observeRequest();
			if (gate.shouldSchedule())
				return enqueue(request.signal).then(() => {
					if (request.signal.aborted) throw request.signal.reason;
					return handler(request, server);
				});
		}
		return handler(request, server);
	};
}
