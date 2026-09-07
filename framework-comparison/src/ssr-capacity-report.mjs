import assert from 'node:assert/strict';

/**
 * Summarizes complete two-driver captures for public capacity charts without mixing load modes.
 * Validates admission/completion accounting and response identity, then aggregates valid responses
 * over the union of simultaneous driver stage spans. Percentiles remain explicit ranges, not pools.
 * Only explicitly admitted arrival stages may contain request errors; their counts remain visible.
 */
export function summarizeSsrCapacityCapture(capture, { allowArrivalErrors = false } = {}) {
	assert.equal(capture.complete, true, 'Cannot publish an incomplete capacity capture');
	const groups = new Map();
	const identities = new Map();
	for (const block of capture.blocks) {
		assert.ok(['exact', 'react'].includes(block.id), 'Only current eXact and React are admitted');
		assert.equal(block.telemetryErrors.length, 0, 'Telemetry capture must be complete');
		assert.equal(block.results.length, 2, 'Capacity publication requires two drivers');
		assert.equal(new Set(block.results.map((result) => result.driver.pid)).size, 2);
		for (const result of block.results) {
			assert.equal(result.complete, true);
			if (identities.has(block.id)) assert.deepEqual(result.identity, identities.get(block.id));
			else identities.set(block.id, result.identity);
		}
		for (let index = 0; index < block.results[0].stages.length; index++) {
			const stages = block.results.map((result) => result.stages[index]);
			const first = stages[0];
			if (first.discard) continue;
			for (const stage of stages) {
				assert.equal(stage.name, first.name);
				assert.equal(stage.mode, first.mode);
				assert.equal(stage.durationMs, first.durationMs);
				assert.equal(stage.discard, first.discard);
				assert.equal(
					stage.offered,
					stage.started + stage.missedLag + stage.missedCapacity + stage.missedDeadline
				);
				assert.equal(stage.started, stage.completed);
				assert.equal(stage.completed, stage.valid + stage.errors);
				assert.ok(Number.isSafeInteger(stage.errors) && stage.errors >= 0);
				if (!allowArrivalErrors || stage.mode !== 'arrival')
					assert.equal(stage.errors, 0, 'Concurrency captures require zero request errors');
				assert.ok(stage.elapsedMs > 0 && Number.isFinite(stage.elapsedMs));
			}
			const concurrency =
				first.mode === 'concurrency'
					? stages.reduce((sum, stage) => sum + stage.concurrency, 0)
					: null;
			const rate =
				first.mode === 'arrival' ? stages.reduce((sum, stage) => sum + stage.rate, 0) : null;
			const key = `${block.id}:${first.mode}:${concurrency ?? rate}`;
			let group = groups.get(key);
			if (!group) {
				group = {
					name: block.id === 'exact' ? 'eXact' : 'React',
					concurrency,
					rate,
					valid: 0,
					completed: 0,
					requestErrors: 0,
					elapsedMs: 0,
					offered: 0,
					capacityMisses: 0,
					lagMisses: 0,
					deadlineMisses: 0,
					p99: [],
					populations: new Set()
				};
				groups.set(key, group);
			}
			assert.ok(!group.populations.has(block.population), 'Duplicate population/stage');
			group.populations.add(block.population);
			const start = Math.min(...stages.map((stage) => Date.parse(stage.startedAt)));
			const end = Math.max(...stages.map((stage) => Date.parse(stage.startedAt) + stage.elapsedMs));
			assert.ok(Number.isFinite(end - start) && end > start);
			group.elapsedMs += end - start;
			for (const stage of stages) {
				group.valid += stage.valid;
				group.completed += stage.completed;
				group.requestErrors += stage.errors;
				group.offered += stage.offered;
				group.capacityMisses += stage.missedCapacity;
				group.lagMisses += stage.missedLag;
				group.deadlineMisses += stage.missedDeadline;
				group.p99.push(stage.distributions.responseMs.p99);
			}
		}
	}
	return [...groups.values()].map((group) => {
		assert.equal(group.populations.size, 2, 'Two fresh populations are required');
		return {
			name: group.name,
			concurrency: group.concurrency,
			rate: group.rate,
			rps: (group.valid / group.elapsedMs) * 1000,
			requestErrors: group.requestErrors,
			requestErrorPercent: group.completed ? (group.requestErrors / group.completed) * 100 : 0,
			capacityMissPercent: (group.capacityMisses / group.offered) * 100,
			lagMisses: group.lagMisses,
			deadlineMisses: group.deadlineMisses,
			p99Min: Math.min(...group.p99),
			p99Max: Math.max(...group.p99)
		};
	});
}
