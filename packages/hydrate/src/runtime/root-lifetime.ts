/** Links root cancellation to its external owner and releases that listener on disposal. */
export function createHydrationLifetime(owner?: AbortSignal) {
	const controller = new AbortController();
	const abort = () => controller.abort(owner?.reason);
	if (owner?.aborted) abort();
	else owner?.addEventListener('abort', abort, { once: true });
	return {
		signal: controller.signal,
		dispose() {
			owner?.removeEventListener('abort', abort);
			controller.abort(new DOMException('eXact hydration root disposed', 'AbortError'));
		}
	};
}
