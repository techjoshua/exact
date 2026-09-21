import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

type Phase = 'baseline' | 'settle' | 'trial' | 'after' | 'enabled';
type Sample = { lag: number; rate: number; count: number; admissions: number; utilization: number };

/**
 * Node-owned admission controller. Lag triggers a trial; completed-response capacity and lag
 * relative to surrounding immediate windows decide whether to retain it. Demand-limited trials
 * can instead prove that they complete admitted work with low lag and event-loop headroom. Handler duration is
 * deliberately not treated as client latency because it excludes time before Node dispatch.
 * A selected policy stays active while lag is low and the event loop has spare capacity;
 * lower offered demand is not evidence that the policy lost completion capacity.
 * Sparse traffic creates no histogram or timer. Idle monitoring disables and releases its timer.
 */
export class AdaptiveRequestGate {
	private delay: ReturnType<typeof monitorEventLoopDelay> | undefined;
	private timer: ReturnType<typeof setInterval> | undefined;
	private lastRequest = -Infinity;
	private recentRequests = 0;
	private requests = 0;
	private completions = 0;
	private admissions = 0;
	private unhealthySamples = 0;
	private hadHeadroom = false;
	private epoch = 0;
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
	private utilization: ReturnType<typeof performance.eventLoopUtilization> | undefined;

	/** Begins one request; a returned epoch permits completion accounting for this window only. */
	observeRequest(): number | undefined {
		if (this.timer) {
			this.requests++;
			this.admissions++;
			return this.epoch;
		}
		const now = performance.now();
		this.recentRequests = now - this.lastRequest > 250 ? 1 : this.recentRequests + 1;
		this.lastRequest = now;
		if (this.recentRequests < 4) return;
		this.delay ??= monitorEventLoopDelay({ resolution: 2 });
		this.delay.enable();
		this.resetWindow(now);
		this.timer = setInterval(() => this.sample(), 250);
		this.timer.unref();
		return this.epoch;
	}

	/** Records successful response completion only in the observation window that admitted it. */
	observeCompletion(epoch: number): void {
		if (this.timer && epoch === this.epoch) this.completions++;
	}

	/** Whether the current request should enter the bounded render-start queue. */
	shouldSchedule(): boolean {
		return this.enabled;
	}

	private resetWindow(now: number): void {
		this.epoch++;
		this.started = now;
		this.completions = 0;
		this.admissions = 0;
		this.delay!.reset();
		this.utilization = performance.eventLoopUtilization();
	}

	/** Reassesses capacity with immediate controls on both sides of a scheduled trial. */
	private sample(): void {
		const now = performance.now();
		const requests = this.requests;
		this.requests = 0;
		if (requests < 4) {
			this.enabled = false;
			this.phase = 'baseline';
			this.unhealthySamples = 0;
			this.hadHeadroom = false;
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
		const control = this.phase === 'baseline' || this.phase === 'after';
		// Immediate controls can fill the host's request queue. End them promptly once enough
		// responses establish a sample; lower-volume controls retain the longer collection window.
		if (elapsed < (control ? 250 : 750)) return;
		if (control && this.completions < 100 && elapsed < 750) return;
		const sample: Sample = {
			lag: this.delay!.percentile(95) / 1e6,
			rate: (this.completions * 1000) / (now - this.started),
			count: this.completions,
			admissions: this.admissions,
			utilization: performance.eventLoopUtilization(this.utilization).utilization
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
			// Busy trials must beat both controls. A low-lag trial with spare capacity can
			// instead prove it finishes virtually all admitted requests within its own window;
			// transient control-window bursts are not sustainable offered demand.
			const rate = Math.max(this.baseline!.rate, sample.rate);
			const lag = Math.min(this.baseline!.lag, sample.lag);
			this.enabled =
				this.trial!.count >= 100 &&
				sample.count >= 100 &&
				(this.trial!.rate > rate ||
					(this.trial!.lag < 3 &&
						this.trial!.utilization < 0.8 &&
						this.trial!.count >= this.trial!.admissions * 0.99)) &&
				this.trial!.lag < lag;
			if (this.enabled) {
				this.unhealthySamples = 0;
				this.hadHeadroom = false;
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
			// A demand-limited window cannot demonstrate peak capacity. Keep a responsive policy
			// with at least 20% event-loop headroom instead of forcing disruptive immediate trials.
			// The expired deadline remains pending, so busy or lagging work resumes reassessment.
			if (sample.lag < 3 && sample.utilization < 0.8) {
				this.hadHeadroom = true;
				this.unhealthySamples = 0;
				this.resetWindow(now);
				return;
			}
			// Protect recent low-load operation from a transient busy window. Sustained busy
			// work loses that grace period even before a recheck is due, preserving prompt
			// reassessment of saturated workloads when their benefit disappears or expires.
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

	private restartBaseline(now: number): void {
		this.unhealthySamples = 0;
		this.hadHeadroom = false;
		this.enabled = false;
		this.phase = 'baseline';
		this.cooldown = now;
		this.highSamples = 0;
		this.resetWindow(now);
	}
}
