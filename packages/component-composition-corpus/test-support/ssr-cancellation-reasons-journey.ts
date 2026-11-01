type StreamRenderer = (
	operation: string,
	options?: { signal?: AbortSignal }
) => ReadableStream<Uint8Array>;
type SsrApi = {
	renderToStream: StreamRenderer;
	renderToProgressiveHtmlStream: StreamRenderer;
	renderToDocumentStream: StreamRenderer;
};

/** Checks exact cancellation reasons before and after native stream ownership begins. */
export async function verifySsrCancellationReasons(api: SsrApi): Promise<void> {
	for (const render of [
		api.renderToStream,
		api.renderToProgressiveHtmlStream,
		api.renderToDocumentStream
	]) {
		for (const reason of [null, false, 0, 'cancelled', new Error('cancelled')]) {
			for (const preAborted of [true, false]) {
				const controller = new AbortController();
				if (preAborted) controller.abort(reason);
				const reader = render('value', { signal: controller.signal }).getReader();
				if (!preAborted) controller.abort(reason);
				try {
					let caught: unknown = Symbol('not rejected');
					try {
						await reader.read();
					} catch (error) {
						caught = error;
					}
					if (caught !== reason) throw new Error('Native SSR stream lost cancellation reason');
				} finally {
					reader.releaseLock();
				}
			}
		}
		const reader = render('ready').getReader();
		try {
			while (!(await reader.read()).done) {
				/* consume successful control */
			}
		} finally {
			reader.releaseLock();
		}
	}
}
