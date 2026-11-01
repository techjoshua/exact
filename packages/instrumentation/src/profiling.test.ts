import { describe, expect, it } from 'vitest';
import {
	createProfileCollector,
	publishExactProfile,
	summarizeProfile,
	type ExactProfileEvent
} from './index.js';

describe('@exactjs/instrumentation', () => {
	it('returns independent snapshot arrays and clears without global state', () => {
		const collector = createProfileCollector<ExactProfileEvent<'compiler', 'transform'>>();
		collector.sink(
			Object.freeze({
				subsystem: 'compiler',
				phase: 'transform',
				elapsedMs: 2,
				counts: Object.freeze({ modules: 1 })
			})
		);

		const snapshot = collector.snapshot();
		Object.assign(snapshot, { length: 0 });
		expect(collector.snapshot()).toHaveLength(1);
		const retained = collector.snapshot();
		collector.clear();

		expect(retained).toEqual([
			expect.objectContaining({ subsystem: 'compiler', phase: 'transform' })
		]);
		Object.assign(retained, { 0: { subsystem: 'compiler', phase: 'transform', elapsedMs: 99 } });
		expect(retained[0]!.elapsedMs).toBe(99);
		expect(collector.snapshot()).toEqual([]);
	});

	it('summarizes subsystem phases by cumulative elapsed time', () => {
		const events: ExactProfileEvent[] = [
			{ subsystem: 'dom', phase: 'render', elapsedMs: 2 },
			{ subsystem: 'dom', phase: 'render', elapsedMs: 3 },
			{ subsystem: 'ssr', phase: 'render', elapsedMs: 1 }
		];

		expect(summarizeProfile(events)).toEqual([
			{ subsystem: 'dom', phase: 'render', elapsedMs: 5, events: 2 },
			{ subsystem: 'ssr', phase: 'render', elapsedMs: 1, events: 1 }
		]);
	});

	it('leaves summary observations writable through ordinary JavaScript aliases', () => {
		const events = [{ subsystem: 'ssr', phase: 'render', elapsedMs: 2 }];
		const summary = summarizeProfile(events);
		Object.assign(summary[0]!, { elapsedMs: 9 });
		Object.assign(summary, { length: 0 });
		expect(summarizeProfile(events)).toEqual([
			{ subsystem: 'ssr', phase: 'render', elapsedMs: 2, events: 1 }
		]);
	});

	it('contains sink failures because profiling is observational', () => {
		expect(() =>
			publishExactProfile(
				() => {
					throw new Error('profiler failed');
				},
				{ subsystem: 'dom', phase: 'render', elapsedMs: 1 }
			)
		).not.toThrow();
	});
});
