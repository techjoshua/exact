import process from 'node:process';
import { summarizeValues } from './measurement.mjs';
import { measureAsyncSsr, measureRenderPlan } from './foundation-rendering.mjs';
import { measureHydrationPublication } from './foundation-publication.mjs';
import { disposeBuildHost, measureBuildHost, measureTransport } from './foundation-transport.mjs';

const scenario = requiredEnvironment('EXACT_PERFORMANCE_FOUNDATION');
const warmups = positiveInteger(process.env.EXACT_PERFORMANCE_WARMUPS ?? '2', 'warmups', 0);
const samples = positiveInteger(process.env.EXACT_PERFORMANCE_INNER_SAMPLES ?? '7', 'samples', 1);
const runners = {
	'render-plan': measureRenderPlan,
	'async-ssr': measureAsyncSsr,
	'hydration-publication': measureHydrationPublication,
	transport: measureTransport,
	'build-host': measureBuildHost
};
const runner = runners[scenario];
if (!runner) throw new Error(`Unknown performance-foundation scenario ${scenario}`);

try {
	for (let index = 0; index < warmups; index++) await runner();
	const observations = [];
	for (let index = 0; index < samples; index++) observations.push(await runner());
	const metrics = summarizeObservations(observations);
	process.stdout.write(
		`EXACT_PERFORMANCE_FOUNDATION_SAMPLE=${JSON.stringify({ scenario, metrics })}\n`
	);
} finally {
	await disposeBuildHost();
}

function summarizeObservations(observations) {
	return Object.fromEntries(
		Object.keys(observations[0]).map((name) => [
			name,
			summarizeValues(observations.map((observation) => observation[name]))
		])
	);
}

function positiveInteger(value, name, minimum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum)
		throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
	return parsed;
}

function requiredEnvironment(name) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}
