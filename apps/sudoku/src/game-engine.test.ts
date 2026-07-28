import { describe, expect, it } from 'vitest';
import {
	applyMove,
	arePeers,
	candidatesFor,
	createCells,
	digitPlacementProgress,
	findConflicts,
	isSolved,
	planNoteToggle,
	planValueEntry
} from './game-engine.js';
import { puzzles } from './puzzles.js';
import type { GameMove } from './types.js';

describe('Sudoku rules', () => {
	it('ships valid givens and complete solutions', () => {
		for (const puzzle of puzzles) {
			expect(puzzle.givens).toHaveLength(81);
			expect(puzzle.solution).toHaveLength(81);
			for (let index = 0; index < 81; index++) {
				if (puzzle.givens[index] !== '0') {
					expect(puzzle.givens[index], `${puzzle.id} cell ${index}`).toBe(puzzle.solution[index]);
				}
			}
			const solvedCells = createCells({ ...puzzle, givens: puzzle.solution });
			expect(isSolved(solvedCells), puzzle.id).toBe(true);
		}
	});

	it('derives peer relationships and candidates from current values', () => {
		const cells = createCells(puzzles[0]!);

		expect(arePeers(0, 8)).toBe(true);
		expect(arePeers(0, 72)).toBe(true);
		expect(arePeers(0, 10)).toBe(true);
		expect(arePeers(0, 40)).toBe(false);
		expect(candidatesFor(cells, 2)).toEqual([1, 2, 4]);
	});

	it('marks both sides of a conflicting entry', () => {
		const cells = createCells(puzzles[0]!);
		const move: GameMove = {
			id: 1,
			label: 'Enter 5',
			changes: planValueEntry(cells, 2, 5)
		};

		applyMove(cells, move, 'forward');

		expect(findConflicts(cells)).toEqual(expect.arrayContaining([0, 2]));
		expect(isSolved(cells)).toBe(false);
	});

	it('tracks board-valid progress without checking the stored solution', () => {
		const cells = createCells(puzzles[0]!);
		const before = digitPlacementProgress(cells, findConflicts(cells));
		const empty = cells.find((cell) => !cell.given)!;
		applyMove(
			cells,
			{ id: 1, label: 'Enter 4', changes: planValueEntry(cells, empty.index, 4) },
			'forward'
		);

		expect(digitPlacementProgress(cells, findConflicts(cells))[3]!.placed).toBe(
			before[3]!.placed + 1
		);
		const solved = createCells({ ...puzzles[0]!, givens: puzzles[0]!.solution });
		expect(digitPlacementProgress(solved, findConflicts(solved))).toEqual(
			Array.from({ length: 9 }, () => ({
				placed: 9,
				conflicting: false,
				complete: true
			}))
		);

		[solved[0]!.value, solved[1]!.value] = [solved[1]!.value, solved[0]!.value];
		const swapped = digitPlacementProgress(solved, findConflicts(solved));
		expect(swapped[2]).toMatchObject({ placed: 9, conflicting: true, complete: false });
		expect(swapped[4]).toMatchObject({ placed: 9, conflicting: true, complete: false });
	});
});

describe('Transactional history', () => {
	it('restores peer notes when a value entry is undone', () => {
		const cells = createCells(puzzles[0]!);
		applyMove(cells, { id: 1, label: 'Note 4', changes: planNoteToggle(cells, 2, 4) }, 'forward');
		const move: GameMove = {
			id: 2,
			label: 'Enter 4',
			changes: planValueEntry(cells, 3, 4)
		};

		applyMove(cells, move, 'forward');
		expect(cells[2]!.notes).toEqual([]);

		applyMove(cells, move, 'backward');
		expect(cells[2]!.notes).toEqual([4]);
		expect(cells[3]!.value).toBeUndefined();
	});

	it('clears and restores all notes as one erase transaction', () => {
		const cells = createCells(puzzles[0]!);
		cells[2]!.notes = [1, 2, 4];
		const move: GameMove = {
			id: 1,
			label: 'Erase cell',
			changes: planValueEntry(cells, 2, undefined)
		};

		applyMove(cells, move, 'forward');
		expect(cells[2]!.notes).toEqual([]);

		applyMove(cells, move, 'backward');
		expect(cells[2]!.notes).toEqual([1, 2, 4]);
	});
});
