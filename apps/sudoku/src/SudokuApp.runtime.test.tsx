// @vitest-environment jsdom

import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { describe, expect, it, vi } from 'vitest';
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

	it('owns an inferred keyboard listener without authored signal plumbing', async () => {
		const container = document.createElement('div');

		try {
			render(<SudokuApp />, container);
			await vi.waitFor(() =>
				expect(container.querySelectorAll<HTMLButtonElement>('.number-key')).toHaveLength(9)
			);
			window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));

			await vi.waitFor(() =>
				expect(
					container.querySelector<HTMLButtonElement>('.number-key[aria-pressed="true"]')
						?.textContent
				).toContain('1')
			);
		} finally {
			unmount(container);
		}
	});

	it('publishes at most one prop update per component instance for a new puzzle transaction', () => {
		const container = document.createElement('div');
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'sudoku-transaction',
			executionRoot: 'page'
		});
		const events: Array<{ kind: string; id: { componentTypeId: string } }> = [];
		inspection.attach('session', { publish: (event) => events.push(event) });

		try {
			render(<SudokuApp />, container, { inspection });
			events.length = 0;
			const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
				candidate.textContent?.includes('puzzle')
			);
			expect(button).toBeTruthy();
			button!.click();

			const changesByType = new Map<string, number>();
			for (const event of events) {
				if (event.kind !== 'props.change') continue;
				const type = event.id.componentTypeId;
				changesByType.set(type, (changesByType.get(type) ?? 0) + 1);
			}
			expect(changesByType.size).toBeGreaterThan(0);
			for (const [type, changes] of changesByType) {
				expect(changes).toBeLessThanOrEqual(type.includes('CellButton') ? 81 : 1);
			}
		} finally {
			inspection.detach();
			unmount(container);
		}
	});
});
