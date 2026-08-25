import { spawn } from 'node:child_process';
import process from 'node:process';

const sampleMarker = 'EXACT_FRAMEWORK_SAMPLE=';
const buildSampleMarker = 'EXACT_FRAMEWORK_BUILD_SAMPLE=';

/** Runs one benchmark worker under Node or Bun and returns its validated structured sample. */
export async function runFrameworkWorker(worker, scenario, fixture, warmups, runtime = 'node') {
	const command = runtime === 'bun' ? 'bun' : process.execPath;
	const output = await runProcess(command, ['--expose-gc', worker], {
		...process.env,
		EXACT_PERFORMANCE_FIXTURE: fixture,
		EXACT_PERFORMANCE_SCENARIO: scenario,
		EXACT_PERFORMANCE_WARMUPS: String(warmups)
	});
	const marker = output.stdout.split(/\r?\n/).find((line) => line.startsWith(sampleMarker));
	if (!marker) {
		throw new Error(
			`${scenario} worker completed without ${sampleMarker.trimEnd()}\n${output.stdout}${output.stderr}`
		);
	}
	const sample = JSON.parse(marker.slice(sampleMarker.length));
	if (sample.scenario !== scenario)
		throw new Error(`worker reported ${sample.scenario} for ${scenario}`);
	return sample;
}

/** Runs one clean production-fixture build in a separate Node process. */
export async function runBuildWorker(worker) {
	const output = await runProcess(process.execPath, [worker], process.env);
	const marker = output.stdout.split(/\r?\n/).find((line) => line.startsWith(buildSampleMarker));
	if (!marker)
		throw new Error(
			`build worker completed without ${buildSampleMarker.trimEnd()}\n${output.stdout}${output.stderr}`
		);
	const sample = JSON.parse(marker.slice(buildSampleMarker.length));
	if (!Number.isFinite(sample.elapsedMs) || !sample.bytes)
		throw new Error('build worker returned invalid metrics');
	return sample;
}

/** Summarizes clean production builds and proves their emitted byte sizes are deterministic. */
export function summarizeBuildSamples(samples) {
	if (!Array.isArray(samples) || samples.length === 0)
		throw new Error('build measurement requires samples');
	const expectedBytes = JSON.stringify(samples[0].bytes);
	for (const [index, sample] of samples.entries()) {
		if (JSON.stringify(sample.bytes) !== expectedBytes)
			throw new Error(
				`production fixture build emitted nondeterministic byte sizes: sample 1 ${expectedBytes}; sample ${index + 1} ${JSON.stringify(sample.bytes)}`
			);
	}
	return {
		samples: samples.length,
		elapsedMs: summarizeValues(samples.map((sample) => sample.elapsedMs)),
		bytes: samples[0].bytes
	};
}

/** Summarizes independent process samples without relying on engine-specific internals. */
export function summarizeScenario(scenario, samples) {
	if (!Array.isArray(samples) || samples.length === 0)
		throw new Error(`${scenario} requires at least one sample`);
	const metricNames = Object.keys(samples[0].metrics);
	const units = samples[0].units;
	const metrics = {};
	for (const name of metricNames) {
		const values = samples.map((sample) => {
			if (sample.units[name] !== units[name])
				throw new Error(`${scenario} changed the unit for ${name}`);
			const value = sample.metrics[name];
			if (typeof value !== 'number' || !Number.isFinite(value))
				throw new Error(`${scenario} returned invalid metric ${name}`);
			return value;
		});
		metrics[name] = summarizeValues(values);
	}
	return {
		scenario,
		samples: samples.length,
		moduleEvaluationMs: summarizeValues(samples.map((sample) => sample.moduleEvaluationMs)),
		metrics,
		units
	};
}

/** Returns the common latency percentiles plus extrema for one portable metric. */
export function summarizeValues(values) {
	if (!Array.isArray(values) || values.length === 0) throw new Error('measurement requires values');
	const sorted = [...values].sort((left, right) => left - right);
	const p50 = percentile(sorted, 0.5);
	return {
		p50,
		median: p50,
		p75: percentile(sorted, 0.75),
		p95: percentile(sorted, 0.95),
		p99: percentile(sorted, 0.99),
		min: sorted[0],
		max: sorted.at(-1)
	};
}

/** Resolves one nearest-rank percentile from an already sorted finite sample. */
export function percentile(sorted, fraction) {
	if (!Array.isArray(sorted) || sorted.length === 0) throw new Error('percentile requires values');
	if (!(fraction >= 0 && fraction <= 1)) throw new Error('percentile fraction must be within 0..1');
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

async function runProcess(command, args, environment) {
	return await new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: process.cwd(),
			env: environment,
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (signal) reject(new Error(`${command} terminated by ${signal}\n${stderr}`));
			else if (code !== 0) reject(new Error(`${command} exited with ${code}\n${stdout}${stderr}`));
			else resolve({ stdout, stderr });
		});
	});
}
