/** Logger stub for tests that intentionally suppress expected framework diagnostics. */
export const noopLogger = {
	isEnabled: () => false,
	log() {}
};

/** Creates an NDJSON response body from protocol events. */
export function ndjsonResponse(events: readonly unknown[]): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			for (const event of events) {
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			}
			controller.close();
		}
	});
}

/** Creates an explicit browser continuation contract for transport-focused tests. */
export function testContinuation(
	id: string,
	options: {
		reads?: readonly ExactContinuationStatePathContract[];
		writes?: readonly ExactContinuationStatePathContract[];
		boundaries?: readonly string[];
		publicContexts?: readonly string[];
		contextWrites?: readonly string[];
		dependencies?: ExactComponentContinuationContract['dependencies'];
		readiness?: ExactComponentContinuationContract['readiness'];
	} = {}
): ExactComponentContinuationContract {
	return {
		id,
		componentId: `test:${id}`,
		readiness: options.readiness ?? 'nonblocking',
		dependencies: options.dependencies ?? [],
		stateReads: options.reads ?? ([{ path: '*', kind: 'read', confidence: 'exact' }] as const),
		stateWrites: options.writes ?? ([{ path: '*', kind: 'write', confidence: 'exact' }] as const),
		publicContexts: options.publicContexts ?? [],
		serverContexts: [],
		contextWrites: options.contextWrites ?? [],
		boundaries: options.boundaries ?? []
	};
}
import type {
	ExactComponentContinuationContract,
	ExactContinuationStatePathContract
} from '@exactjs/core';
