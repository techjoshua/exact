import { createHistogram, monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createGarbageCollectionMeter } from './garbage-collection-meter.mjs';

/** Constant-space phase totals; length=0 preserves the existing worker reset contract. */
export class SsrPhaseTotals {
	length = 0;
	sum = 0;
	min = Infinity;
	max = 0;

	/** Records a sample without retaining request objects or timing arrays. */
	push(value) {
		if (this.length === 0) {
			this.sum = 0;
			this.min = Infinity;
			this.max = 0;
		}
		this.length++;
		this.sum += value;
		this.min = Math.min(this.min, value);
		this.max = Math.max(this.max, value);
	}

	/** Returns cumulative totals; consumers difference count and sum for interval means. */
	snapshot() {
		return {
			count: this.length,
			sum: this.length ? this.sum : 0,
			min: this.length ? this.min : null,
			max: this.length ? this.max : null
		};
	}
}

/** Records millisecond distributions in a bounded native histogram with microsecond resolution. */
export function createLoadHistogram() {
	const histogram = createHistogram({ lowest: 1, highest: 3_600_000_000, figures: 3 });
	return {
		record(ms) {
			histogram.record(Math.max(1, Math.min(3_600_000_000, Math.round(ms * 1000))));
		},
		snapshot() {
			return histogram.count
				? {
						count: histogram.count,
						mean: histogram.mean / 1000,
						p50: histogram.percentile(50) / 1000,
						p95: histogram.percentile(95) / 1000,
						p99: histogram.percentile(99) / 1000,
						max: histogram.max / 1000
					}
				: { count: 0, mean: null, p50: null, p95: null, p99: null, max: null };
		},
		reset() {
			histogram.reset();
		}
	};
}

/** Owns interval CPU, GC, and event-loop monitoring; callers must close it on every exit. */
export function createLoadProcessMeter() {
	let previousCpu = process.cpuUsage(),
		previousTime = performance.now(),
		previousLoop = performance.eventLoopUtilization();
	const garbageCollection = createGarbageCollectionMeter();
	const delay = monitorEventLoopDelay({ resolution: 10 });
	delay.enable();
	return {
		sample() {
			const gc = garbageCollection.snapshot();
			const now = performance.now(),
				cpu = process.cpuUsage(),
				loop = performance.eventLoopUtilization();
			const elapsedMs = now - previousTime,
				cpuMs = (cpu.user + cpu.system - previousCpu.user - previousCpu.system) / 1000;
			const result = {
				pid: process.pid,
				elapsedMs,
				cpuMs,
				cpuPercentOfOneCore: (cpuMs / elapsedMs) * 100,
				eventLoopUtilization: performance.eventLoopUtilization(loop, previousLoop).utilization,
				eventLoopP99Ms: delay.count ? delay.percentile(99) / 1e6 : null,
				gcAvailable: gc.available,
				gcCount: gc.count,
				gcMs: gc.durationMs,
				memory: process.memoryUsage()
			};
			previousCpu = cpu;
			previousTime = now;
			previousLoop = loop;
			garbageCollection.reset();
			delay.reset();
			return result;
		},
		close() {
			delay.disable();
			garbageCollection.close();
		}
	};
}
