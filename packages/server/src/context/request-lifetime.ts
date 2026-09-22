import { inheritRequestRenderScheduler } from '../framework/render-scheduling.js';

/** Creates a request lifetime. */
export function createRequestLifetime(...signals: Array<AbortSignal | undefined>): {
	signal: AbortSignal;
	abort(reason?: unknown): void;
	dispose(): void;
} {
	const controller = new AbortController();
	const listeners = new Map<AbortSignal, () => void>();
	for (const signal of signals) {
		if (!signal) continue;
		inheritRequestRenderScheduler(signal, controller.signal);
		const abort = () => controller.abort(signal.reason);
		if (signal.aborted) {
			abort();
			break;
		}
		listeners.set(signal, abort);
		signal.addEventListener('abort', abort, { once: true });
	}
	return {
		signal: controller.signal,
		abort(reason) {
			controller.abort(reason);
		},
		dispose() {
			for (const [signal, listener] of listeners) {
				signal.removeEventListener('abort', listener);
			}
			listeners.clear();
		}
	};
}
