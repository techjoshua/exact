import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compilerTourSource = readFileSync(
	new URL('./examples/compiler-tour.ts', import.meta.url),
	'utf8'
);

describe('compiler tour generated-artifact examples', () => {
	it('shows indexed client operands without the superseded reader shape', () => {
		expect(compilerTourSource).toContain('wire: [');
		expect(compilerTourSource).toContain("['value', 0, state.query]");
		expect(compilerTourSource).toContain('createIndexedContinuationDependency');
		expect(compilerTourSource).toContain('receiveExactClientComponentProps');
		expect(compilerTourSource).not.toContain('createExpression');
		expect(compilerTourSource).not.toContain('writeReactiveLazy');
		expect(compilerTourSource).not.toContain('createCompiledChildRangeReceipt');
	});

	it('shows the current direct server writer and request-owned execution boundary', () => {
		expect(compilerTourSource).toContain('version: 8');
		expect(compilerTourSource).toContain('operations.begin');
		expect(compilerTourSource).toContain('operations.compiledAttribute');
		expect(compilerTourSource).toContain('issue: issueExactServerComponent');
		expect(compilerTourSource).toContain('write: writeExactServerComponent');
		expect(compilerTourSource).toContain("lane: 'direct'");
		expect(compilerTourSource).not.toContain('DirectIssuedRender');
		expect(compilerTourSource).not.toContain('DirectSsrComponentResult');
	});
});
