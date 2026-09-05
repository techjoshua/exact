import { performance } from 'node:perf_hooks';
import { deriveDataColors } from '../dist/derivation.js';
import { resolveTheme } from '../dist/resolver.js';

const environment = { appearance: 'light', contrast: 'standard', motion: 'full' };
for (let index = 0; index < 5; index++) resolveTheme({ environment });

const theme = resolveTheme({ environment });
const checks = [
	measure('theme resolution', 20, 40, () => resolveTheme({ environment })),
	measure('12-color categorical derivation', 20, 20, () =>
		deriveDataColors(theme, { kind: 'categorical', count: 12, surface: 0 })
	),
	measure('12-step sequential derivation', 20, 10, () =>
		deriveDataColors(theme, { kind: 'sequential', steps: 12, tone: 'accent', surface: 0 })
	)
];

for (const check of checks) {
	console.log(`${check.name}: ${check.average.toFixed(2)} ms (budget ${check.budget} ms)`);
	if (check.average > check.budget)
		throw new Error(`${check.name} exceeded its average performance budget`);
}
console.log(
	`THEME_BENCHMARK_JSON=${JSON.stringify({ environment: { node: process.version }, checks })}`
);

function measure(name, iterations, budget, run) {
	const samplesMs = [];
	for (let index = 0; index < iterations; index++) {
		const started = performance.now();
		run();
		samplesMs.push(performance.now() - started);
	}
	return {
		name,
		average: samplesMs.reduce((total, value) => total + value, 0) / samplesMs.length,
		budget,
		samplesMs
	};
}
