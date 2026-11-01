import { afterEach, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ requests: [] as unknown[], disposed: 0 }));

vi.mock('../native/process.js', () => ({
	NativeCompilerProcess: class {
		request(request: unknown) {
			transport.requests.push(request);
			return { diagnostics: [], code: 'export {};', analysis: { imports: [] } };
		}
		dispose() {
			transport.disposed++;
		}
	}
}));

import { ExactCompilerSession } from './project.js';

afterEach(() => {
	transport.requests.length = 0;
	transport.disposed = 0;
});

it('updates advisory policy without resetting semantic state and permits per-request overrides', () => {
	const session = new ExactCompilerSession({
		nativeCompiler: { executable: 'unused-mocked-native-host' },
		analysis: { estimatedCostWarningThreshold: 4096 }
	});
	try {
		const request = { kind: 'compile' as const, id: '/virtual/policy.ts', source: 'export const value = 1;' };
		session.compileNative(request);
		session.setAnalysisPolicy({ estimatedCostWarningThreshold: false });
		session.compileNative(request);
		session.compileNative({ ...request, analysis: { estimatedCostWarningThreshold: 1 } });
		session.setAnalysisPolicy(undefined);
		session.compileNative(request);
		expect(transport.requests).toEqual([
			{ ...request, analysis: { estimatedCostWarningThreshold: 4096 }, traceAnalysisCost: false },
			{ ...request, analysis: { estimatedCostWarningThreshold: false }, traceAnalysisCost: false },
			{ ...request, analysis: { estimatedCostWarningThreshold: 1 }, traceAnalysisCost: false },
			{ ...request, analysis: undefined, traceAnalysisCost: false }
		]);
	} finally {
		session.dispose();
	}
	expect(transport.disposed).toBe(1);
	expect(() => session.setAnalysisPolicy({ estimatedCostWarningThreshold: 1 })).toThrow(/disposed/);
});
