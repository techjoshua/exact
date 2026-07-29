import { describe, expect, it } from 'vitest';
import type {
	NativeCompilerAnalysis,
	NativeCompilerDiagnostic
} from '../native/process-contracts.js';
import { sourceDiagnostic } from './source-diagnostics.js';

describe('source diagnostic projection', () => {
	it('retains the native code, primary range, causal facts, and validated fix kind', () => {
		const diagnostic: NativeCompilerDiagnostic = {
			severity: 'error',
			code: 'EXACT_TASK_PLACEMENT_CONFLICT',
			message: 'task has indivisible browser and server effects',
			filename: 'Page.tsx',
			start: 10,
			length: 20
		};
		const analysis = {
			tasks: [
				{
					start: 10,
					length: 20,
					environmentEffect: 'mixed',
					effectSources: [
						{
							environment: 'server',
							description: 'Products is a server context',
							path: ['Page', 'loadProduct', 'Products']
						},
						{
							environment: 'browser',
							description: 'document is a browser API',
							path: ['Page', 'document']
						}
					]
				}
			]
		} as unknown as NativeCompilerAnalysis;

		const projected = sourceDiagnostic('Page.tsx', ' '.repeat(40), diagnostic, analysis);
		expect(projected).toMatchObject({
			code: diagnostic.code,
			range: { start: 10, end: 30 },
			fixes: [{ kind: 'split-placement-conflict' }]
		});
		expect(projected.related.map((related) => related.message)).toEqual([
			'Products is a server context',
			'document is a browser API'
		]);
		expect(projected.explanation).toContain('cannot execute atomically');
	});
});
