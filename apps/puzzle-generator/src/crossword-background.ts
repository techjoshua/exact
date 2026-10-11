import type { CrosswordPuzzle } from './types.js';

/** Marks empty cells with letter cells immediately above, below, left, and right, in linear time. */
export function crosswordEnclosedCells(puzzle: CrosswordPuzzle): Uint8Array {
	const enclosed = new Uint8Array(puzzle.cells.length);
	for (let row = 1; row < puzzle.rows - 1; row++) {
		for (let column = 1; column < puzzle.columns - 1; column++) {
			const index = row * puzzle.columns + column;
			if (
				!puzzle.cells[index] &&
				puzzle.cells[index - puzzle.columns]?.letter &&
				puzzle.cells[index + puzzle.columns]?.letter &&
				puzzle.cells[index - 1]?.letter &&
				puzzle.cells[index + 1]?.letter
			)
				enclosed[index] = 1;
		}
	}
	return enclosed;
}
