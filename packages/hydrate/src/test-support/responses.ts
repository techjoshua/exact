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
