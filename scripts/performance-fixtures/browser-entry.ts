import { clientScenarioNames, runClientScenario } from './client-scenarios.js';

declare global {
	interface Window {
		__exactPerformanceStart?: number;
		__exactPerformance?: {
			evaluationMs: number;
			run(warmups?: number): Promise<{
				evaluationMs: number;
				results: Record<string, Awaited<ReturnType<typeof runClientScenario>>>;
			}>;
		};
	}
}

const evaluationMs = performance.now() - (window.__exactPerformanceStart ?? performance.timeOrigin);

window.__exactPerformance = {
	evaluationMs,
	async run(warmups = 2) {
		const results: Record<string, Awaited<ReturnType<typeof runClientScenario>>> = {};
		for (const name of clientScenarioNames) {
			for (let index = 0; index < warmups; index++) await runClientScenario(name);
			results[name] = await runClientScenario(name);
		}
		return { evaluationMs, results };
	}
};
