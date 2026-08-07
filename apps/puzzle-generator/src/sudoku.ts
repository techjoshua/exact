import { seededRandom, shuffled } from './random.js';
import type { Difficulty, SudokuPuzzle } from './types.js';

const clueRatios: Readonly<Record<Difficulty, number>> = {
	easy: 0.58,
	medium: 0.46,
	hard: 0.36
};

/**
 * Generates a deterministic 4×4 or 9×9 Sudoku with exactly one solution.
 * Difficulty controls clue density rather than claiming a human solving grade.
 */
export function generateSudoku(boxSize: 2 | 3, difficulty: Difficulty, seed: number): SudokuPuzzle {
	const size = boxSize * boxSize;
	const random = seededRandom(seed);
	const symbols = shuffled(
		Array.from({ length: size }, (_, index) => index + 1),
		random
	);
	const bands = shuffled(
		Array.from({ length: boxSize }, (_, index) => index),
		random
	);
	const rows = bands.flatMap((band) =>
		shuffled(
			Array.from({ length: boxSize }, (_, index) => index),
			random
		).map((row) => band * boxSize + row)
	);
	const stacks = shuffled(
		Array.from({ length: boxSize }, (_, index) => index),
		random
	);
	const columns = stacks.flatMap((stack) =>
		shuffled(
			Array.from({ length: boxSize }, (_, index) => index),
			random
		).map((column) => stack * boxSize + column)
	);
	const solution = rows.flatMap((row) =>
		columns.map((column) => symbols[(row * boxSize + Math.floor(row / boxSize) + column) % size]!)
	);
	const givens = [...solution];
	const targetClues = Math.max(size + boxSize, Math.ceil(size * size * clueRatios[difficulty]));

	for (const index of shuffled(
		Array.from({ length: size * size }, (_, candidate) => candidate),
		random
	)) {
		if (givens.filter(Boolean).length <= targetClues) break;
		const previous = givens[index]!;
		givens[index] = 0;
		if (countSudokuSolutions(givens, boxSize, 2) !== 1) givens[index] = previous;
	}

	return { size, boxSize, givens, solution };
}

/** Counts valid completions up to the supplied early-exit limit. */
export function countSudokuSolutions(values: readonly number[], boxSize: 2 | 3, limit = 2): number {
	const size = boxSize * boxSize;
	if (values.length !== size * size) return 0;
	const board = [...values];
	return countSolutions(board, size, boxSize, limit);
}

function countSolutions(board: number[], size: number, boxSize: number, limit: number): number {
	let bestIndex = -1;
	let bestCandidates: number[] | undefined;
	for (let index = 0; index < board.length; index++) {
		if (board[index] !== 0) continue;
		const candidates = candidatesAt(board, index, size, boxSize);
		if (!candidates.length) return 0;
		if (!bestCandidates || candidates.length < bestCandidates.length) {
			bestIndex = index;
			bestCandidates = candidates;
			if (candidates.length === 1) break;
		}
	}
	if (bestIndex < 0) return 1;

	let solutions = 0;
	for (const candidate of bestCandidates!) {
		board[bestIndex] = candidate;
		solutions += countSolutions(board, size, boxSize, limit - solutions);
		if (solutions >= limit) break;
	}
	board[bestIndex] = 0;
	return solutions;
}

function candidatesAt(
	board: readonly number[],
	index: number,
	size: number,
	boxSize: number
): number[] {
	const row = Math.floor(index / size);
	const column = index % size;
	const boxRow = Math.floor(row / boxSize) * boxSize;
	const boxColumn = Math.floor(column / boxSize) * boxSize;
	const unavailable = new Set<number>();
	for (let offset = 0; offset < size; offset++) {
		unavailable.add(board[row * size + offset]!);
		unavailable.add(board[offset * size + column]!);
		unavailable.add(
			board[(boxRow + Math.floor(offset / boxSize)) * size + boxColumn + (offset % boxSize)]!
		);
	}
	return Array.from({ length: size }, (_, candidate) => candidate + 1).filter(
		(candidate) => !unavailable.has(candidate)
	);
}
