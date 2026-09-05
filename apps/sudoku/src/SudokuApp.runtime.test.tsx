// @vitest-environment jsdom

import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { createManualTimeClock } from '@exactjs/time/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createSudokuAppOperation,
	createTimedSudokuAppOperation
} from './SudokuApp.runtime.fixtures.jsx';
import { createCells } from './game-engine.js';
import { puzzles } from './puzzles.js';
import { createSavedGame, storageKey } from './storage.js';
import type { Digit } from './types.js';

describe('SudokuApp runtime', () => {
	beforeEach(() => localStorage.clear());

	it('mounts the board with setup-derived child props initialized', () => {
		const container = document.createElement('div');
		const errors: unknown[] = [];

		try {
			render(createSudokuAppOperation(), container, {
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
			render(createSudokuAppOperation(), container);
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

	it('enters a typed digit into the selected cell without selecting the number pad', async () => {
		const container = document.createElement('div');

		try {
			render(createSudokuAppOperation(), container);
			const selectedCell = container.querySelector<HTMLButtonElement>(
				'[role="gridcell"][aria-selected="true"]'
			);
			expect(selectedCell).toBeTruthy();
			window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
			flushSync();

			expect(selectedCell!.dataset.value).toBe('1');
			expect(container.querySelector('.number-key[aria-pressed="true"]')).toBeNull();
		} finally {
			unmount(container);
		}
	});

	it('uses typed digits to select the number pad after board selection is released', () => {
		const container = document.createElement('div');

		try {
			render(createSudokuAppOperation(), container);
			const one = container.querySelectorAll<HTMLButtonElement>('.number-key')[0]!;
			one.click();
			one.click();
			flushSync();

			window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
			flushSync();

			expect(
				container.querySelector<HTMLButtonElement>('.number-key[aria-pressed="true"]')?.textContent
			).toContain('2');
			expect(container.querySelector('[role="gridcell"][aria-selected="true"]')).toBeNull();
		} finally {
			unmount(container);
		}
	});

	it('clears both number and cell selection when an active number is toggled off', async () => {
		const container = document.createElement('div');

		try {
			render(createSudokuAppOperation(), container);
			const one = container.querySelectorAll<HTMLButtonElement>('.number-key')[0]!;
			expect(container.querySelectorAll('[role="gridcell"][aria-selected="true"]')).toHaveLength(1);

			one.click();
			flushSync();
			one.click();
			flushSync();

			await vi.waitFor(() => {
				expect(container.querySelector('.number-key[aria-pressed="true"]')).toBeNull();
				expect(container.querySelector('[role="gridcell"][aria-selected="true"]')).toBeNull();
			});
		} finally {
			unmount(container);
		}
	});

	it('enters a selected number-pad digit when an editable cell is clicked', () => {
		const container = document.createElement('div');

		try {
			render(createSudokuAppOperation(), container);
			const one = container.querySelectorAll<HTMLButtonElement>('.number-key')[0]!;
			const editableCell = container.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[2]!;

			one.click();
			flushSync();
			expect(one.getAttribute('aria-pressed')).toBe('true');

			editableCell.click();
			flushSync();
			expect(editableCell.dataset.value).toBe('1');
		} finally {
			unmount(container);
		}
	});

	it('toggles pencil marks with mouse right-click while preserving cell DOM layers', () => {
		const container = document.createElement('div');

		try {
			render(createSudokuAppOperation(), container);
			container.querySelectorAll<HTMLButtonElement>('.number-key')[0]!.click();
			const cell = container.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[2]!;
			const valueLayer = cell.querySelector('.cell-value');
			const notesLayer = cell.querySelector('.cell-notes');
			expect(notesLayer?.children).toHaveLength(9);

			const rightClick = new MouseEvent('pointerdown', {
				bubbles: true,
				button: 2,
				cancelable: true
			});
			Object.defineProperty(rightClick, 'pointerType', { value: 'mouse' });
			cell.dispatchEvent(rightClick);
			flushSync();

			expect(cell.dataset.notes).toBe('1');
			expect(cell.querySelector('.cell-value')).toBe(valueLayer);
			expect(cell.querySelector('.cell-notes')).toBe(notesLayer);

			const removeNote = new MouseEvent('pointerdown', {
				bubbles: true,
				button: 2,
				cancelable: true
			});
			Object.defineProperty(removeNote, 'pointerType', { value: 'mouse' });
			cell.dispatchEvent(removeNote);
			flushSync();
			expect(cell.dataset.notes).toBe('');
		} finally {
			unmount(container);
		}
	});

	it('marks both cells in a conflicting entry while a number is selected', async () => {
		const container = document.createElement('div');

		try {
			render(createSudokuAppOperation(), container);
			const cells = container.querySelectorAll<HTMLButtonElement>('[role="gridcell"]');
			container.querySelectorAll<HTMLButtonElement>('.number-key')[4]!.click();
			cells[2]!.click();
			flushSync();

			await vi.waitFor(() => {
				expect(cells[0]!.classList).toContain('is-conflict');
				expect(cells[2]!.classList).toContain('is-conflict');
			});
		} finally {
			unmount(container);
		}
	});

	it('freezes the clock at completion and restarts it for the next game', async () => {
		vi.useFakeTimers();
		const clock = createManualTimeClock(Date.now());
		const container = document.createElement('div');
		const puzzle = puzzles[0]!;
		const cells = createCells(puzzle);
		const target = cells.find((cell) => !cell.given)!;
		for (const cell of cells) {
			if (!cell.given && cell.index !== target.index) {
				cell.value = Number(puzzle.solution[cell.index]) as Digit;
			}
		}
		localStorage.setItem(
			storageKey,
			JSON.stringify(createSavedGame(puzzle.id, cells, 65, 'paper'))
		);

		try {
			render(createTimedSudokuAppOperation(clock), container);
			await Promise.resolve();
			await Promise.resolve();
			await vi.advanceTimersByTimeAsync(1_000);
			clock.advance(1_000);
			clock.runDue();
			await vi.runAllTicks();
			await vi.advanceTimersByTimeAsync(0);
			flushSync();
			await Promise.resolve();
			const runningClock = container.querySelector('.mobile-timer .elapsed-clock');
			expect(runningClock?.textContent).toBe('01:06');

			const digit = Number(puzzle.solution[target.index]) as Digit;
			container.querySelectorAll<HTMLButtonElement>('.number-key')[digit - 1]!.click();
			container.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')[target.index]!.click();
			flushSync();
			await Promise.resolve();
			flushSync();

			expect(container.querySelector('.victory-banner')?.textContent).toContain('01:06');
			expect(container.querySelector('.mobile-timer .elapsed-clock')).toBe(runningClock);
			await vi.advanceTimersByTimeAsync(3_000);
			clock.advance(3_000);
			flushSync();
			expect(container.querySelector('.mobile-timer .elapsed-clock')?.textContent).toBe('01:06');

			container.querySelector<HTMLButtonElement>('.new-game-button')!.click();
			flushSync();
			await Promise.resolve();
			await Promise.resolve();
			clock.runDue();
			flushSync();
			expect(container.querySelector('.mobile-timer .elapsed-clock')?.textContent).toBe('00:00');
			expect(clock.pendingTimerCount).toBeGreaterThan(0);
			expect(clock.nextDeadline?.epochMilliseconds).toBe(clock.now().epochMilliseconds + 1_000);

			await vi.advanceTimersByTimeAsync(1_000);
			clock.advance(1_000);
			clock.runDue();
			await vi.runAllTicks();
			flushSync();
			expect(container.querySelector('.mobile-timer .elapsed-clock')?.textContent).toBe('00:01');
		} finally {
			unmount(container);
			vi.useRealTimers();
		}
	});

	it('keeps one-second clock speed across repeated new games without tick persistence', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-18T12:00:00.000Z'));
		const clock = createManualTimeClock(Date.now());
		const interval = vi.spyOn(window, 'setInterval');
		const persist = vi.spyOn(Storage.prototype, 'setItem');
		const container = document.createElement('div');

		try {
			render(createTimedSudokuAppOperation(clock), container);
			await Promise.resolve();
			const ownedTimerCount = clock.pendingTimerCount;
			expect(ownedTimerCount).toBeGreaterThan(0);
			expect(clock.nextDeadline?.epochMilliseconds).toBe(Date.now() + 1_000);

			for (let game = 0; game < 3; game++) {
				if (game > 0) {
					container.querySelector<HTMLButtonElement>('.new-game-button')!.click();
					flushSync();
					await Promise.resolve();
					await Promise.resolve();
				}
				const writesBeforeTick = persist.mock.calls.length;
				await vi.advanceTimersByTimeAsync(1_000);
				clock.advance(1_000);
				clock.runDue();
				await Promise.resolve();
				await Promise.resolve();
				clock.runDue();
				flushSync();
				await Promise.resolve();
				expect(
					container.querySelector('.mobile-timer .elapsed-clock')?.textContent,
					`game ${game}`
				).toBe('00:01');
				expect(clock.pendingTimerCount).toBeLessThanOrEqual(ownedTimerCount);
				expect(persist.mock.calls.length).toBe(writesBeforeTick);
			}

			expect(interval).not.toHaveBeenCalled();
			const writesBeforePageHide = persist.mock.calls.length;
			window.dispatchEvent(new PageTransitionEvent('pagehide'));
			expect(persist.mock.calls.length).toBe(writesBeforePageHide + 1);
		} finally {
			unmount(container);
			interval.mockRestore();
			persist.mockRestore();
			vi.useRealTimers();
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
			render(createSudokuAppOperation(), container, { inspection });
			await Promise.resolve();
			await Promise.resolve();
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
