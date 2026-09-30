/** One completed host observation window, with rate in responses/s and lag in milliseconds. */
export interface StreamingPolicySample {
	rate: number;
	lag: number;
	count: number;
	utilization: number;
}

type Phase = 'idle' | 'settle-candidate' | 'candidate' | 'settle-control' | 'control';

/**
 * Compares budgeted and fully batched streaming within the admission controller's existing
 * observation windows. Controls bracket each candidate to reject gains caused by changing load.
 * This selector owns no timers or requests. Interrupted trials restore the selected policy.
 */
export class StreamingPolicySelection {
	private selected = false;
	private candidate = false;
	private phase: Phase = 'idle';
	private nextTrial = 0;
	private before: StreamingPolicySample | undefined;
	private trial: StreamingPolicySample | undefined;

	/** Whether enabled streaming checkpoints currently enter the queue without a work budget. */
	get batched(): boolean {
		return this.phase === 'settle-candidate' || this.phase === 'candidate'
			? this.candidate
			: this.selected;
	}

	/** Restores the incumbent after an interruption, retaining its next comparison deadline. */
	cancel(): void {
		this.phase = 'idle';
		this.before = this.trial = undefined;
	}

	/** Sparse or idle traffic starts a new workload with the default budgeted policy. */
	reset(): void {
		this.cancel();
		this.selected = false;
		this.nextTrial = 0;
	}

	/**
	 * Consumes a completed window. True reserves the next window for this comparison, so the
	 * outer controller must retain admission and renew its completion epoch. Each policy change
	 * discards one settling window. Insufficient traffic cancels rather than selecting a winner.
	 */
	observe(now: number, sample: StreamingPolicySample, streaming: boolean): boolean {
		if (!streaming || sample.count < 100) {
			this.cancel();
			return false;
		}
		if (this.phase === 'idle') {
			if (now < this.nextTrial || (sample.lag < 3 && sample.utilization < 0.8)) return false;
			this.before = sample;
			this.candidate = !this.selected;
			this.phase = 'settle-candidate';
			this.nextTrial = now + 30_000;
			return true;
		}
		if (this.phase === 'settle-candidate') this.phase = 'candidate';
		else if (this.phase === 'candidate') {
			this.trial = sample;
			this.phase = 'settle-control';
		} else if (this.phase === 'settle-control') this.phase = 'control';
		else {
			// Require a material capacity improvement over both controls without a large lag cost.
			const rate = Math.max(this.before!.rate, sample.rate);
			const lag = Math.max(3, Math.min(this.before!.lag, sample.lag) * 1.25);
			if (this.trial!.rate > rate * 1.03 && this.trial!.lag <= lag) this.selected = this.candidate;
			this.cancel();
			// The comparison's final control must not be judged as a selected-policy window.
		}
		return true;
	}
}
