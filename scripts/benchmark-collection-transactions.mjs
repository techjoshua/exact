import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { batch, reactive } from '../packages/reactive/dist/index.js';

const samples = 10;
const warmups = 3;
const iterations = 100;
const rollback = new Error('Intentional benchmark rollback');
const results = [];

for (const size of [1_000, 10_000]) {
	for (const kind of ['Map', 'Set']) {
		for (const mode of ['ordinary', 'commit', 'rollback']) {
			const timings = [];
			for (let sample = -warmups; sample < samples; sample++) {
				const keys = Array.from({ length: size }, (_, index) => index);
				const collection = reactive(
					kind === 'Map' ? new Map(keys.map((key) => [key, key])) : new Set(keys)
				);
				const mutate = () => {
					collection.delete(0);
					if (mode === 'rollback') throw rollback;
					if (kind === 'Map') collection.set(0, 0);
					else collection.add(0);
				};
				const start = performance.now();
				for (let iteration = 0; iteration < iterations; iteration++) {
					try {
						if (mode === 'ordinary') mutate();
						else batch(mutate);
					} catch (error) {
						if (error !== rollback || mode !== 'rollback') throw error;
					}
				}
				const elapsed = (performance.now() - start) / iterations;
				assert.equal(collection.size, size);
				assert.equal(collection.has(0), true);
				if (kind === 'Map') assert.equal(collection.get(0), 0);
				if (mode === 'rollback') assert.deepEqual([...collection.keys()], keys);
				if (sample >= 0) timings.push(elapsed);
			}
			const sorted = [...timings].sort((left, right) => left - right);
			results.push({
				kind,
				size,
				mode,
				unit: 'ms per delete/restore operation',
				mean: timings.reduce((sum, value) => sum + value, 0) / samples,
				median: (sorted[4] + sorted[5]) / 2,
				max: sorted.at(-1),
				samples: timings
			});
		}
	}
}

const report = {
	createdAt: new Date().toISOString(),
	environment: { node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
	method: {
		samples,
		warmups,
		iterations,
		setupExcluded: true,
		observers: 0,
		note: 'Single-process microbenchmark. Rollback includes throwing/catching; ordinary and commit restore by reinsertion. Timings are not a paired historical comparison.'
	},
	results
};
const output = process.argv.find((value) => value.startsWith('--output='))?.slice(9);
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
