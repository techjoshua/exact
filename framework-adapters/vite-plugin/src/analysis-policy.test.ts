import { expect, it, vi } from 'vitest';
import type { ExactAnalysisOptions } from '@exactjs/config';

const transform = vi.hoisted(() => vi.fn(() => null));
vi.mock('./transform.js', () => ({ transformExactViteModule: transform }));
vi.mock('./root-owners.js', () => ({
	exactViteApplicationRoot: () => '/virtual/policy'
}));

import { executeExactViteSource } from './source-execution.js';

it('sets or clears the consumed policy before each source transform', () => {
	const setAnalysisPolicy = vi.fn();
	const config: { analysis?: ExactAnalysisOptions } = {
		analysis: { estimatedCostWarningThreshold: 1 }
	};
	const state = {
		options: {},
		compiler: { current: { setAnalysisPolicy } },
		testModuleTargets: { transform: () => 'client' },
		configuration: { loaded: { config }, observeSource: () => [] },
		microfrontends: { recordModule: vi.fn() },
		ensureServerAuthorization: vi.fn(),
		inspectionModules: new Map(),
		viteCommand: 'serve'
	} as unknown as Parameters<typeof executeExactViteSource>[0];
	const context = {} as ThisParameterType<typeof executeExactViteSource>;
	for (const policy of [{ estimatedCostWarningThreshold: 1 }, { estimatedCostWarningThreshold: false }, undefined] as const) {
		config.analysis = policy;
		expect(executeExactViteSource.call(context, state, 'export const value = 1;', '/virtual/policy/value.ts')).toBeNull();
		expect(setAnalysisPolicy).toHaveBeenLastCalledWith(policy);
	}
	expect(setAnalysisPolicy).toHaveBeenCalledTimes(3);
	expect(transform).toHaveBeenCalledTimes(3);
	expect(setAnalysisPolicy.mock.invocationCallOrder[0]).toBeLessThan(transform.mock.invocationCallOrder[0]!);
});
