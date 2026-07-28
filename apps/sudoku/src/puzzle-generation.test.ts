import { describe, expect, it } from 'vitest';
import { createCells, isSolved } from './game-engine.js';
import {
	countPuzzleSolutions,
	generatePuzzle,
	generatedPuzzleFromId
} from './puzzle-generation.js';
import type { Difficulty } from './types.js';

describe('Sudoku puzzle generation', () => {
	it.each([
		['gentle', 40],
		['tricky', 33],
		['fiendish', 27]
	] as const)('creates a deterministic, uniquely solvable %s puzzle', (difficulty, target) => {
		const puzzle = generatePuzzle(difficulty, 0x1234_5678);
		const restored = generatedPuzzleFromId(puzzle.id);
		const clues = [...puzzle.givens].filter((value) => value !== '0').length;

		expect(puzzle.givens).toHaveLength(81);
		expect(puzzle.solution).toHaveLength(81);
		expect(clues).toBeLessThanOrEqual(target + 2);
		expect(countPuzzleSolutions(puzzle.givens)).toBe(1);
		expect(restored).toEqual(puzzle);
		expect(isSolved(createCells({ ...puzzle, givens: puzzle.solution }))).toBe(true);
		for (let index = 0; index < 81; index++) {
			if (puzzle.givens[index] !== '0') expect(puzzle.givens[index]).toBe(puzzle.solution[index]);
		}
	});

	it('varies the grid for different seeds', () => {
		const difficulties: Difficulty[] = ['gentle', 'tricky', 'fiendish'];
		for (const difficulty of difficulties) {
			expect(generatePuzzle(difficulty, 1).givens).not.toBe(generatePuzzle(difficulty, 2).givens);
		}
	});

	it('rejects malformed generated IDs and invalid puzzle strings', () => {
		expect(generatedPuzzleFromId('generated-gentle-not!base36')).toBeUndefined();
		expect(countPuzzleSolutions('123')).toBe(0);
	});
});
