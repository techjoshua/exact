// @vitest-environment jsdom

import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
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

	it('keeps the theme menu hidden until the trigger opens it', () => {
		const container = document.createElement('div');

		try {
			render(<SudokuApp />, container);
			const trigger = container.querySelector<HTMLButtonElement>('.theme-trigger');
			expect(trigger).toBeTruthy();
			expect(container.querySelector('.theme-menu')).toBeNull();

			trigger!.click();
			flushSync();
			expect(
				container.querySelector<HTMLButtonElement>('.theme-trigger')!.getAttribute('aria-expanded')
			).toBe('true');
			expect(container.querySelector('.theme-menu')).toBeTruthy();
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

	it('does not duplicate prop updates for a new puzzle transaction', async () => {
		const container = document.createElement('div');
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'sudoku-transaction',
			executionRoot: 'page'
		});
		const events: Array<{ kind: string; id: { instanceId?: string } }> = [];
		inspection.attach('session', { publish: (event) => events.push(event) });

		try {
			render(<SudokuApp />, container, { inspection });
			events.length = 0;
			const button = container.querySelector<HTMLButtonElement>('.new-game-button');
			const previousTitle = container.querySelector('.game-heading .eyebrow')?.textContent;
			expect(button).toBeTruthy();
			button!.click();
			flushSync();
			await vi.waitFor(
				() =>
					expect(container.querySelector('.game-heading .eyebrow')?.textContent).not.toBe(
						previousTitle
					),
				{ timeout: 5_000 }
			);

			const changesByInstance = new Map<string, number>();
			for (const event of events) {
				if (event.kind !== 'props.change') continue;
				const instance = event.id.instanceId;
				if (!instance) continue;
				changesByInstance.set(instance, (changesByInstance.get(instance) ?? 0) + 1);
			}
			for (const changes of changesByInstance.values()) expect(changes).toBe(1);
		} finally {
			inspection.detach();
			unmount(container);
		}
	});
});
