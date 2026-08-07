import { seededRandom, shuffled } from './random.js';
import type { Difficulty, WordPlacement, WordSearchPuzzle } from './types.js';
import { containsBlockedSequence } from './words.js';

type Direction = readonly [dRow: number, dColumn: number];

const directions: Readonly<Record<Difficulty, readonly Direction[]>> = {
	easy: [
		[0, 1],
		[1, 0]
	],
	medium: [
		[0, 1],
		[1, 0],
		[1, 1],
		[1, -1]
	],
	hard: [
		[0, 1],
		[0, -1],
		[1, 0],
		[-1, 0],
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1]
	]
};

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Places all words in a deterministic rectangular search grid.
 * Hard mode plants near-match decoys before safety-checked filler is applied.
 *
 * @throws When the dimensions cannot hold every requested word.
 */
export function generateWordSearch(
	words: readonly string[],
	rows: number,
	columns: number,
	difficulty: Difficulty,
	seed: number
): WordSearchPuzzle {
	if (rows < 5 || rows > 30 || columns < 5 || columns > 30)
		throw new Error('Word-search dimensions must be between 5 and 30.');
	const longest = Math.max(...words.map((word) => word.length));
	if (longest > Math.max(rows, columns))
		throw new Error(
			`The longest word needs ${longest} cells, but the longest grid edge has ${Math.max(rows, columns)}.`
		);

	for (let attempt = 0; attempt < 80; attempt++) {
		const random = seededRandom((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
		const grid = Array<string | undefined>(rows * columns).fill(undefined);
		const placements: WordPlacement[] = [];
		let failed = false;
		for (const word of [...words].sort((left, right) => right.length - left.length)) {
			const candidates = placementCandidates(grid, word, rows, columns, directions[difficulty]);
			if (!candidates.length) {
				failed = true;
				break;
			}
			const placement = shuffled(candidates, random).sort(
				(left, right) => right.overlap - left.overlap
			)[0]!;
			writePlacement(grid, word, columns, placement);
			placements.push({ word, ...placement });
		}
		if (failed) continue;
		if (difficulty === 'hard') plantNearMatches(grid, words, rows, columns, random);
		if (!fillSafely(grid, rows, columns, random)) continue;
		return { rows, columns, grid: grid as string[], placements };
	}
	throw new Error('These words could not all fit safely. Increase the grid or remove a long word.');
}

type Candidate = Omit<WordPlacement, 'word'> & { overlap: number };

function placementCandidates(
	grid: readonly (string | undefined)[],
	word: string,
	rows: number,
	columns: number,
	allowed: readonly Direction[]
): Candidate[] {
	const candidates: Candidate[] = [];
	for (const [dRow, dColumn] of allowed) {
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				const endRow = row + dRow * (word.length - 1);
				const endColumn = column + dColumn * (word.length - 1);
				if (endRow < 0 || endRow >= rows || endColumn < 0 || endColumn >= columns) continue;
				let overlap = 0;
				let valid = true;
				for (let offset = 0; offset < word.length; offset++) {
					const existing = grid[(row + dRow * offset) * columns + column + dColumn * offset];
					if (existing && existing !== word[offset]) {
						valid = false;
						break;
					}
					if (existing) overlap++;
				}
				if (valid) candidates.push({ row, column, dRow, dColumn, overlap });
			}
		}
	}
	return candidates;
}

function writePlacement(
	grid: Array<string | undefined>,
	word: string,
	columns: number,
	placement: Omit<Candidate, 'overlap'>
): void {
	for (let offset = 0; offset < word.length; offset++) {
		grid[
			(placement.row + placement.dRow * offset) * columns +
				placement.column +
				placement.dColumn * offset
		] = word[offset];
	}
}

function plantNearMatches(
	grid: Array<string | undefined>,
	words: readonly string[],
	rows: number,
	columns: number,
	random: () => number
): void {
	for (const word of shuffled(
		words.filter((candidate) => candidate.length >= 4),
		random
	).slice(0, 4)) {
		const candidates = placementCandidates(grid, word, rows, columns, directions.hard).filter(
			(candidate) => candidate.overlap === 0
		);
		const placement = shuffled(candidates, random)[0];
		if (!placement) continue;
		const mismatch = 1 + Math.floor(random() * (word.length - 2));
		const replacement =
			alphabet[(alphabet.indexOf(word[mismatch]!) + 1 + Math.floor(random() * 25)) % 26]!;
		writePlacement(
			grid,
			`${word.slice(0, mismatch)}${replacement}${word.slice(mismatch + 1)}`,
			columns,
			placement
		);
	}
}

function fillSafely(
	grid: Array<string | undefined>,
	rows: number,
	columns: number,
	random: () => number
): boolean {
	const empty = grid.flatMap((letter, index) => (letter ? [] : [index]));
	for (let attempt = 0; attempt < 120; attempt++) {
		for (const index of empty) grid[index] = alphabet[Math.floor(random() * alphabet.length)];
		if (!gridContainsBlockedSequence(grid as string[], rows, columns)) return true;
	}
	return false;
}

/** Scans every horizontal, vertical, and diagonal line for blocked output. */
export function gridContainsBlockedSequence(
	grid: readonly string[],
	rows: number,
	columns: number
): boolean {
	const lines: string[] = [];
	for (let row = 0; row < rows; row++)
		lines.push(grid.slice(row * columns, (row + 1) * columns).join(''));
	for (let column = 0; column < columns; column++) {
		let line = '';
		for (let row = 0; row < rows; row++) line += grid[row * columns + column];
		lines.push(line);
	}
	for (const dColumn of [-1, 1]) {
		for (let startRow = 0; startRow < rows; startRow++)
			lines.push(
				readLine(grid, rows, columns, startRow, dColumn === 1 ? 0 : columns - 1, 1, dColumn)
			);
		for (let startColumn = 1; startColumn < columns - 1; startColumn++)
			lines.push(readLine(grid, rows, columns, 0, startColumn, 1, dColumn));
	}
	return lines.some(containsBlockedSequence);
}

function readLine(
	grid: readonly string[],
	rows: number,
	columns: number,
	row: number,
	column: number,
	dRow: number,
	dColumn: number
): string {
	let result = '';
	while (row >= 0 && row < rows && column >= 0 && column < columns) {
		result += grid[row * columns + column];
		row += dRow;
		column += dColumn;
	}
	return result;
}
