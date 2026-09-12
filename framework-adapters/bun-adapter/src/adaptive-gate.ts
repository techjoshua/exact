import { performance } from 'node:perf_hooks';
import { BunEventLoopObserver } from './event-loop-observer.js';

type Phase = 'baseline' | 'settle' | 'trial' | 'after' | 'enabled';
type Sample = { lag: number; rate: number; count: number };

/**
 * Bun-owned admission controller. Lag triggers a trial; native request drain and lag
 * relative to surrounding immediate windows decide whether to retain it. Native departures include
 * disconnects, not just successful responses. Handler duration is
 * deliberately not treated as client latency because it excludes native response transmission.
 * Sparse traffic creates no histogram or timer. Idle monitoring disables and releases its timer.
 */
export class BunRequestGate {
	private delay: BunEventLoopObserver | undefined;
	private timer: ReturnType<typeof setInterval> | undefined;
	private lastRequest = -Infinity;
	private recentRequests = 0;
	private requests = 0;
	private arrivals = 0;
	private windowArrivals = 0;
	private windowPending = 0;
	private started = 0;
	private enabled = false;
	private highSamples = 0;
	private phase: Phase = 'baseline';
	private nextPhase: 'trial' | 'after' = 'trial';
	private until = 0;
	private cooldown = 0;
	private backoff = 2000;
	private baseline: Sample | undefined;
	private trial: Sample | undefined;
	private controlRate = 0;
	private controlLag = 0;

	/** Reads the host-wide native in-flight counter without intercepting response bodies. */
	constructor(private readonly pendingRequests: () => number) {}

	/** Observes every Fetch dispatch owned by this host. */
	observeRequest(): void {
		this.arrivals++;
		if (this.timer) {
			this.requests++;
			return;
		}
		const now = performance.now();
		this.recentRequests = now - this.lastRequest > 250 ? 1 : this.recentRequests + 1;
		this.lastRequest = now;
		if (this.recentRequests < 4) return;
		this.delay ??= new BunEventLoopObserver();
		this.delay.enable();
		this.resetWindow(now);
		this.timer = setInterval(() => this.sample(), 250);
		this.timer.unref();
		return;
	}

	/** Whether the current request should enter the bounded render-start queue. */
	shouldSchedule(): boolean {
		return this.enabled;
	}

	private resetWindow(now: number): void {
		this.started = now;
		this.windowArrivals = this.arrivals;
		this.windowPending = this.pendingRequests();
		this.delay!.reset();
	}

	/** Reassesses capacity with immediate controls on both sides of a scheduled trial. */
	private sample(): void {
		const now = performance.now();
		const requests = this.requests;
		this.requests = 0;
		if (requests < 4) {
			this.enabled = false;
			this.phase = 'baseline';
			this.nextPhase = 'trial';
			this.highSamples = 0;
			this.backoff = 2000;
			this.cooldown = 0;
			this.baseline = this.trial = undefined;
			if (!requests) {
				clearInterval(this.timer);
				this.timer = undefined;
				this.delay!.disable();
				this.recentRequests = 0;
				this.lastRequest = -Infinity;
			} else this.resetWindow(now);
			return;
		}
		if (this.phase === 'settle') {
			if (now >= this.until) {
				this.phase = this.nextPhase;
				this.resetWindow(now);
			}
			return;
		}
		if (this.phase === 'enabled' && now >= this.until) {
			this.restartBaseline(now);
			return;
		}
		const elapsed = now - this.started;
		const departures = Math.max(
			0,
			this.arrivals - this.windowArrivals + this.windowPending - this.pendingRequests()
		);
		const control = this.phase === 'baseline' || this.phase === 'after';
		// Immediate controls can fill the host's request queue. End them promptly once enough
		// departures establish a sample; lower-volume controls retain the longer collection window.
		if (elapsed < (control ? 250 : 750)) return;
		if (control && departures < 100 && elapsed < 750) return;
		const sample: Sample = {
			lag: this.delay!.percentile(95) / 1e6,
			rate: (departures * 1000) / (now - this.started),
			count: departures
		};
		if (this.phase === 'trial') {
			this.trial = sample;
			this.enabled = false;
			this.phase = 'settle';
			this.nextPhase = 'after';
			this.until = now + 250;
			this.resetWindow(now);
			return;
		}
		if (this.phase === 'after') {
			// A changing workload can make the mean control look artificially weak.
			// Require evidence against both controls before retaining the trial.
			const rate = Math.max(this.baseline!.rate, sample.rate);
			const lag = Math.min(this.baseline!.lag, sample.lag);
			this.enabled =
				this.trial!.count >= 100 &&
				sample.count >= 100 &&
				this.trial!.rate > rate &&
				this.trial!.lag < lag;
			if (this.enabled) {
				this.controlRate = rate;
				this.controlLag = lag;
				this.phase = 'enabled';
				// Keep routine probes from repeatedly interrupting a healthy policy. Observation
				// windows still reject lost capacity or lag benefits before this deadline.
				this.until = now + 30_000;
				this.backoff = 2000;
			} else {
				this.phase = 'baseline';
				this.cooldown = now + this.backoff;
				this.backoff = Math.min(30_000, this.backoff * 2);
			}
			this.resetWindow(now);
			return;
		}
		if (this.phase === 'enabled') {
			// Recheck sooner when the observed benefit disappears, including a changed document mix.
			if (sample.rate <= this.controlRate || sample.lag >= this.controlLag)
				this.restartBaseline(now);
			else this.resetWindow(now);
			return;
		}
		this.highSamples = sample.lag > 3 ? this.highSamples + 1 : 0;
		if (now >= this.cooldown && this.highSamples >= 2 && sample.count >= 100) {
			this.baseline = sample;
			this.enabled = true;
			this.phase = 'settle';
			this.nextPhase = 'trial';
			this.until = now + 250;
			this.highSamples = 0;
		}
		this.resetWindow(now);
	}

	private restartBaseline(now: number): void {
		this.enabled = false;
		this.phase = 'baseline';
		this.cooldown = now;
		this.highSamples = 0;
		this.resetWindow(now);
	}
}
