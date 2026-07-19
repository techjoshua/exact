import { performance } from 'node:perf_hooks';

/**
 * Attributes nested operations to exclusive buckets without double-counting
 * time spent in an instrumented child operation.
 */
export class ExclusiveTimer<Bucket extends string> {
	private readonly totals = new Map<Bucket, number>();
	private readonly stack: Array<{ bucket: Bucket; resumedAt: number }> = [];

	constructor(private readonly enabled: boolean) {}

	/** Runs an operation and adds only its exclusive elapsed time to `bucket`. */
	measure<T>(bucket: Bucket, operation: () => T): T {
		if (!this.enabled) return operation();
		const started = performance.now();
		const parent = this.stack.at(-1);
		if (parent) this.add(parent.bucket, started - parent.resumedAt);
		const frame = { bucket, resumedAt: started };
		this.stack.push(frame);
		try {
			return operation();
		} finally {
			const ended = performance.now();
			this.add(bucket, ended - frame.resumedAt);
			this.stack.pop();
			const resumed = this.stack.at(-1);
			if (resumed) resumed.resumedAt = ended;
		}
	}

	/** Returns the exclusive elapsed time accumulated for one bucket. */
	elapsed(bucket: Bucket): number {
		return this.totals.get(bucket) ?? 0;
	}

	private add(bucket: Bucket, elapsedMs: number): void {
		this.totals.set(bucket, (this.totals.get(bucket) ?? 0) + elapsedMs);
	}
}
