import { taskReadinessSsr } from './server-task-readiness-scenario.js';
import type { ServerScenarioResult } from './server-scenario-contract.js';

/** The isolated compiler-closed workload used for direct-server bundle and runtime measurements. */
export const serverScenarioNames = ['server.ssr-task-readiness'] as const;

/** Runs the isolated compiler-closed server workload. */
export function runServerScenario(name: string): Promise<ServerScenarioResult> {
	if (name !== 'server.ssr-task-readiness')
		throw new Error(`Unknown compiler-closed server scenario ${name}`);
	return taskReadinessSsr(64);
}
