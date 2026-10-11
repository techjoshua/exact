import type { CrosswordPuzzle } from './types.js';

/** Marks unused cells connected to the grid edge through orthogonal unused cells, in linear time. */
export function crosswordExteriorCells(puzzle: CrosswordPuzzle): Uint8Array {
	const exterior = new Uint8Array(puzzle.cells.length);
	const pending: number[] = [];
	const visit = (index: number) => {
		if (!puzzle.cells[index] && !exterior[index]) {
			exterior[index] = 1;
			pending.push(index);
		}
	};
	for (let index = 0; index < puzzle.cells.length; index++) {
		const row = Math.floor(index / puzzle.columns);
		const column = index % puzzle.columns;
		if (row === 0 || row === puzzle.rows - 1 || column === 0 || column === puzzle.columns - 1)
			visit(index);
	}
	for (let cursor = 0; cursor < pending.length; cursor++) {
		const index = pending[cursor]!;
		const row = Math.floor(index / puzzle.columns);
		const column = index % puzzle.columns;
		if (row > 0) visit(index - puzzle.columns);
		if (row < puzzle.rows - 1) visit(index + puzzle.columns);
		if (column > 0) visit(index - 1);
		if (column < puzzle.columns - 1) visit(index + 1);
	}
	return exterior;
}
