// @vitest-environment jsdom

import { render, unmount } from '@exactjs/dom';
import { describe, expect, it } from 'vitest';
import { SudokuApp } from './SudokuApp.jsx';

describe('SudokuApp runtime', () => {
	it('mounts the board with setup-derived child props initialized', () => {
		const container = document.createElement('div');
		const errors: unknown[] = [];

		try {
			render(<SudokuApp />, container, {
				onErrorReport(report) {
					errors.push(report.error);
				}
			});

			expect(errors).toEqual([]);
			expect(container.textContent).toContain('A quiet place to think.');
			expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(81);
		} finally {
			unmount(container);
		}
	});
});
