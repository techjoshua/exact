type RequestAbortSource = {
	once(event: 'aborted', listener: () => void): unknown;
	removeListener(event: 'aborted', listener: () => void): unknown;
};
type ResponseCloseSource = {
	readonly writableEnded: boolean;
	once(event: 'close', listener: () => void): unknown;
	removeListener(event: 'close', listener: () => void): unknown;
};

/** Owns request/response disconnect listeners and releases them on every terminal path. */
export function createParcelRequestLifetime(
	request: RequestAbortSource,
	response: ResponseCloseSource
): { readonly signal: AbortSignal; dispose(reason?: unknown): void } {
	const controller = new AbortController();
	let disposed = false;
	const requestAborted = () => controller.abort(new DOMException('Request aborted', 'AbortError'));
	const responseClosed = () => {
		if (!response.writableEnded)
			controller.abort(new DOMException('Response closed', 'AbortError'));
	};
	request.once('aborted', requestAborted);
	response.once('close', responseClosed);
	return {
		signal: controller.signal,
		dispose(reason = 'Parcel Lab request complete') {
			if (disposed) return;
			disposed = true;
			request.removeListener('aborted', requestAborted);
			response.removeListener('close', responseClosed);
			controller.abort(reason);
		}
	};
}
