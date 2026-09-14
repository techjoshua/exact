import {
	bindRequestRenderScheduler,
	type RequestRenderScheduler
} from '@exactjs/server/framework/render-scheduling';
import type { ServerResponse } from 'node:http';
import { AdaptiveRequestGate } from './adaptive-gate.js';
import { createNodeRenderScheduler } from '../render-scheduler.js';

const admissionOwner = Symbol('exact.node.admission');
type AdmittedResponse = ServerResponse & { [admissionOwner]?: RequestRenderScheduler | false };

/** Node HTTP controls. Node compatibility hosting on Bun defaults to immediate starts. */
export interface NodeSchedulingOptions {
	/** Enables automatic trials and reassessment. Defaults to true on Node and false on Bun. */
	adaptive?: boolean;
	/** Maximum queued starts released by one callback. Defaults to 32. */
	maxBatchSize?: number;
}

/**
 * Creates one host-owned admission policy. Completion listeners exist only while monitoring is
 * active and remove themselves on finish or cancellation. No response or rendering work is shared.
 */
export function createNodeRequestAdmission(
	options: NodeSchedulingOptions = {}
): (response: ServerResponse, signal: AbortSignal) => void | Promise<void> {
	const enqueue = createNodeRenderScheduler({ maxBatchSize: options.maxBatchSize });
	const gate =
		(options.adaptive ?? !('bun' in process.versions)) ? new AdaptiveRequestGate() : undefined;
	const checkpoint: RequestRenderScheduler = (signal) => {
		signal?.throwIfAborted();
		return gate?.shouldSchedule() ? enqueue(signal) : undefined;
	};
	return (response, signal) => {
		if (signal.aborted) return Promise.reject(signal.reason);
		// An outer page host may dispatch to an eXact endpoint handler. Its request policy wins.
		const owned = response as AdmittedResponse;
		const existing = owned[admissionOwner];
		if (existing !== undefined) {
			if (existing) bindRequestRenderScheduler(signal, existing);
			return;
		}
		owned[admissionOwner] = gate ? checkpoint : false;
		if (!gate) return;
		bindRequestRenderScheduler(signal, checkpoint);
		const epoch = gate.observeRequest();
		if (epoch !== undefined) {
			const completed = () => {
				response.off('finish', completed);
				response.off('close', completed);
				if (response.writableFinished) gate.observeCompletion(epoch);
			};
			response.once('finish', completed);
			response.once('close', completed);
		}
		return gate.shouldSchedule() ? enqueue(signal) : undefined;
	};
}
