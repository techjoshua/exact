import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { installPerformanceDom } from './dom-environment.mjs';

const scenario = requiredEnvironment('EXACT_PERFORMANCE_SCENARIO');
const fixture = requiredEnvironment('EXACT_PERFORMANCE_FIXTURE');
const warmups = positiveInteger(process.env.EXACT_PERFORMANCE_WARMUPS ?? '2', 'warmups');
const moduleStarted = performance.now();

if (scenario.startsWith('client.') || scenario.startsWith('component.')) installPerformanceDom();

const module = await import(`${pathToFileURL(fixture).href}?sample=${process.pid}`);
const moduleEvaluationMs = performance.now() - moduleStarted;
const runner = scenario.startsWith('server.') ? module.runServerScenario : module.runClientScenario;
if (typeof runner !== 'function')
	throw new Error(`Fixture does not export a runner for ${scenario}`);

for (let index = 0; index < warmups; index++) await runner(scenario);
const result = await runner(scenario);
validateResult(scenario, result);

process.stdout.write(
	`EXACT_FRAMEWORK_SAMPLE=${JSON.stringify({
		scenario,
		moduleEvaluationMs,
		metrics: result.metrics,
		units: result.units
	})}\n`
);

function validateResult(name, result) {
	if (!result || typeof result !== 'object') throw new Error(`${name} returned no result`);
	const metrics = result.metrics;
	if (!metrics || typeof metrics !== 'object' || Object.keys(metrics).length === 0)
		throw new Error(`${name} returned no metrics`);
	for (const [metric, value] of Object.entries(metrics)) {
		if (typeof value !== 'number' || !Number.isFinite(value))
			throw new Error(`${name} returned invalid metric ${metric}`);
	}
}

function requiredEnvironment(name) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function positiveInteger(value, name) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0)
		throw new Error(`${name} must be a non-negative integer`);
	return parsed;
}
