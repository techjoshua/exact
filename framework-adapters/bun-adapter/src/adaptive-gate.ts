import { performance } from 'node:perf_hooks';
import { BunEventLoopObserver } from './event-loop-observer.js';

type Phase = 'baseline' | 'settle' | 'trial' | 'after' | 'enabled';
type Sample = { lag: number; rate: number; count: number; arrivals: number; utilization: number };

/**
 * Bun-owned admission controller. Lag triggers a trial; native request drain and lag
 * relative to surrounding immediate windows decide whether to retain it. Native departures include
 * disconnects, not just successful responses. Handler duration is
 * deliberately not treated as client latency because it excludes native response transmission.
 * Demand-limited trials may retain lower lag when native departures keep up with arrivals
 * and the event-loop thread has CPU headroom. Unsupported thread counters keep capacity-based
 * selection. A responsive selected policy tolerates isolated unhealthy samples before reassessment.
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
	private cpu: NodeJS.CpuUsage | undefined;
	private hadHeadroom = false;
	private unhealthySamples = 0;

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

	/** Starts a window while retaining native bodies that have not drained yet. */
	private resetWindow(now: number): void {
		this.cpu = readThreadCpu();
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
			this.hadHeadroom = false;
			this.unhealthySamples = 0;
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
		const cpu = readThreadCpu();
		const sample: Sample = {
			lag: this.delay!.percentile(95) / 1e6,
			rate: (departures * 1000) / (now - this.started),
			count: departures,
			arrivals: this.arrivals - this.windowArrivals,
			utilization:
				cpu && this.cpu
					? (cpu.user + cpu.system - this.cpu.user - this.cpu.system) / (elapsed * 1000)
					: Infinity
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
			// Busy trials must beat both controls. With CPU headroom and native departures
			// keeping up, a lower-lag trial can instead demonstrate demand-limited capacity.
			const rate = Math.max(this.baseline!.rate, sample.rate);
			const lag = Math.min(this.baseline!.lag, sample.lag);
			this.enabled =
				this.trial!.count >= 100 &&
				sample.count >= 100 &&
				(this.trial!.rate > rate || hasHeadroom(this.trial!)) &&
				this.trial!.lag < lag;
			if (this.enabled) {
				this.hadHeadroom = false;
				this.unhealthySamples = 0;
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
			// Lower offered demand cannot prove a loss of capacity. Keep a responsive policy
			// while native departures keep up and the event-loop thread has spare CPU.
			if (hasHeadroom(sample)) {
				this.hadHeadroom = true;
				this.unhealthySamples = 0;
				this.resetWindow(now);
				return;
			}
			// Recent headroom tolerates two transient windows. Sustained busy work consumes
			// this grace even before the deadline, preserving prompt saturated reassessment.
			// Deferring a probe never resets its deadline.
			if (this.hadHeadroom && ++this.unhealthySamples >= 3) this.hadHeadroom = false;
			if (
				!this.hadHeadroom &&
				(now >= this.until || sample.rate <= this.controlRate || sample.lag >= this.controlLag)
			)
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

	/** Drops the selected policy and its transient grace without resetting trial backoff. */
	private restartBaseline(now: number): void {
		this.hadHeadroom = false;
		this.unhealthySamples = 0;
		this.enabled = false;
		this.phase = 'baseline';
		this.cooldown = now;
		this.highSamples = 0;
		this.resetWindow(now);
	}
}

/**
 * Reads CPU microseconds for the event-loop thread only. Bun versions without a usable counter
 * retain capacity-based decisions; an unavailable or zeroed event-loop utilization API is not
 * evidence of spare capacity. No per-request probes or response-body interception are needed.
 */
function readThreadCpu(): NodeJS.CpuUsage | undefined {
	try {
		return process.threadCpuUsage?.();
	} catch {
		return undefined;
	}
}

/**
 * Bun's independent two-millisecond timer includes dispatch time. A sub-five-millisecond p95
 * together with 20% thread CPU headroom and native departures keeping pace identifies a responsive
 * demand-limited window. Departures include disconnects and do not assert response success.
 */
function hasHeadroom(sample: Sample): boolean {
	return (
		sample.lag < 5 &&
		sample.utilization > 0 &&
		sample.utilization < 0.8 &&
		sample.count >= sample.arrivals * 0.99
	);
}
