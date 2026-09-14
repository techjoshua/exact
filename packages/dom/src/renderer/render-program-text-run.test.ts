/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
	finishProgramTextRuns,
	prepareProgramTextRun,
	type PendingProgramTextRuns
} from './render-program-text-run.js';

describe('scalar run adoption transaction', () => {
	it('validates all runs before splitting any of them', () => {
		const first = document.createElement('small');
		first.textContent = 'ab';
		const second = document.createElement('small');
		second.textContent = 'mismatch';
		const original = first.firstChild;
		const pending: PendingProgramTextRuns = { runs: [], values: new Map() };
		expect(prepareProgramTextRun(first, [0, 1], pending)).toBe(true);
		expect(prepareProgramTextRun(second, [2, 3], pending)).toBe(true);
		for (const [index, value] of ['a', 'b', 'c', 'd'].entries()) pending.values.set(index, value);
		expect(finishProgramTextRuns(pending, [])).toBe(false);
		expect(first.childNodes).toHaveLength(1);
		expect(first.firstChild).toBe(original);
		expect(second.textContent).toBe('mismatch');
	});
	it('rejects unexpected structural content and incomplete bindings', () => {
		const container = document.createElement('small');
		container.innerHTML = '<b>ab</b>';
		const pending: PendingProgramTextRuns = { runs: [], values: new Map() };
		expect(prepareProgramTextRun(container, [0, 1], pending)).toBe(false);
		container.textContent = 'ab';
		expect(prepareProgramTextRun(container, [0, 1], pending)).toBe(true);
		pending.values.set(0, 'a');
		expect(finishProgramTextRuns(pending, [])).toBe(false);
		expect(container.childNodes).toHaveLength(1);
	});
});
