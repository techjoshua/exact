import { createHistogram, performance } from 'node:perf_hooks';

/**
 * Independently owned loop-interval sampler. Bun's monitorEventLoopDelay instances share native
 * observation lifetime: disabling one can stop unrelated monitors. Recording our own timer
 * intervals avoids that coupling. Values include the requested two-millisecond interval, matching
 * the admission controller's delay thresholds. Neither response bodies nor requests are retained.
 */
export class BunEventLoopObserver {
	private readonly histogram = createHistogram();
	private timer: ReturnType<typeof setInterval> | undefined;
	private previous = 0;

	/** Starts this observer's unreferenced timer once. */
	enable(): void {
		if (this.timer) return;
		this.previous = performance.now();
		this.timer = setInterval(() => {
			const now = performance.now();
			this.histogram.record(Math.max(1, Math.round((now - this.previous) * 1e6)));
			this.previous = now;
		}, 2);
		this.timer.unref();
	}

	/** Stops only this observer's timer; unrelated native monitors remain active. */
	disable(): void {
		clearInterval(this.timer);
		this.timer = undefined;
	}

	/** Begins a fresh sample window without changing timer ownership. */
	reset(): void {
		this.histogram.reset();
	}

	/** Returns a percentile of observed loop intervals in nanoseconds. */
	percentile(value: number): number {
		return this.histogram.percentile(value);
	}
}
