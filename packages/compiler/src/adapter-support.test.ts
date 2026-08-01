import { describe, expect, it } from 'vitest';
import {
	createExactDiagnosticReporter,
	exactDiagnosticKey,
	formatExactDiagnostic,
	matchesExactBuildFilter
} from './adapter-support.js';

describe('build adapter support', () => {
	it('matches string, regular expression, and mixed path filters', () => {
		expect(matchesExactBuildFilter('/src/view.tsx', '/src/')).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', /\.tsx$/)).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', [/node_modules/, 'view.tsx'])).toBe(true);
		expect(matchesExactBuildFilter('/src/view.ts', [/node_modules/, /\.tsx$/])).toBe(false);
	});

	it('resets stateful regular expressions between filter checks', () => {
		const filter = /view/g;
		expect(matchesExactBuildFilter('/src/view.tsx', filter)).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', filter)).toBe(true);
	});

	it('formats and keys diagnostics consistently', () => {
		const diagnostic = {
			code: 'TS2322',
			message: 'Type string is not assignable to number',
			filename: '/src/model.ts',
			span: { line: 4, column: 7 }
		};
		expect(exactDiagnosticKey(diagnostic)).toBe(
			'TS2322:4:7:Type string is not assignable to number'
		);
		expect(formatExactDiagnostic(diagnostic)).toBe(
			'/src/model.ts:4:7 - TS2322: Type string is not assignable to number'
		);
	});

	it('reports only newly introduced diagnostics and releases invalidated files', () => {
		const report = createExactDiagnosticReporter();
		const warnings: string[] = [];
		const diagnostic = {
			code: 'TS2322',
			message: 'Type string is not assignable to number',
			filename: '/src/model.ts'
		};

		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		expect(warnings).toHaveLength(1);

		report({ affectedFiles: ['/src/model.ts'], diagnostics: [] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		expect(warnings).toHaveLength(2);
	});

	it('normalizes invalidated Windows paths before releasing diagnostics', () => {
		const report = createExactDiagnosticReporter();
		const warnings: string[] = [];
		const diagnostic = { code: 'EXACT1', message: 'changed', filename: 'C:/src/model.ts' };

		report({ affectedFiles: [], diagnostics: [diagnostic] }, (warning) => warnings.push(warning));
		report({ affectedFiles: ['C:\\src\\model.ts'], diagnostics: [] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: [], diagnostics: [diagnostic] }, (warning) => warnings.push(warning));
		expect(warnings).toHaveLength(2);
	});
});
