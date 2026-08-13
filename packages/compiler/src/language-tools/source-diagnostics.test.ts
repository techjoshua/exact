import { describe, expect, it } from 'vitest';
import type {
	NativeCompilerAnalysis,
	NativeCompilerDiagnostic
} from '../native/process-contracts.js';
import { isExactCompilerDiagnostic, sourceDiagnostic } from './source-diagnostics.js';

describe('source diagnostic projection', () => {
	it('distinguishes framework diagnostics from ordinary TypeScript diagnostics', () => {
		const diagnostic = (code: string): NativeCompilerDiagnostic => ({
			severity: 'error',
			code,
			message: 'example'
		});

		expect(isExactCompilerDiagnostic(diagnostic('EXACT_TASK_PLACEMENT_CONFLICT'))).toBe(true);
		expect(isExactCompilerDiagnostic(diagnostic('TS2304'))).toBe(false);
	});

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

	it('projects the compiler-owned dynamic acknowledgement edit', () => {
		const projected = sourceDiagnostic(
			'Page.tsx',
			' '.repeat(80),
			{
				severity: 'warning',
				code: 'EXACT2213',
				message: 'opaque component',
				start: 50,
				length: 8,
				fixStart: 12,
				fixText: '/** @exact dynamic */\n'
			},
			{ tasks: [] } as unknown as NativeCompilerAnalysis
		);
		expect(projected.fixes).toEqual([
			expect.objectContaining({
				kind: 'acknowledge-dynamic-component',
				edit: {
					filename: 'Page.tsx',
					range: { start: 12, end: 12 },
					newText: '/** @exact dynamic */\n'
				}
			})
		]);
	});
});
