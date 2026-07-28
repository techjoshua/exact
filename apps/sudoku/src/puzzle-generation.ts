import type { Difficulty, Digit, Puzzle } from './types.js';

const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const targetClues: Readonly<Record<Difficulty, number>> = {
	gentle: 40,
	tricky: 33,
	fiendish: 27
};
const titles: Readonly<Record<Difficulty, readonly string[]>> = {
	gentle: ['Fresh page', 'Soft daylight', 'Open garden'],
	tricky: ['Turning path', 'Hidden current', 'Crossing lines'],
	fiendish: ['Deep focus', 'Night geometry', 'Tangled orbit']
};

/** Creates a fresh browser-local seed without introducing a network dependency. */
export function createPuzzleSeed(): number {
	const values = new Uint32Array(1);
	if (globalThis.crypto?.getRandomValues) {
		globalThis.crypto.getRandomValues(values);
		return values[0]!;
	}
	return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

/**
 * Builds a deterministic puzzle with one solution.
 *
 * A seed first permutes a complete Sudoku grid. Clues are then removed in a
 * seeded order, retaining each removal only while the solution remains unique.
 * Several deterministic attempts keep the requested clue density dependable.
 */
export function generatePuzzle(difficulty: Difficulty, seed: number): Puzzle {
	const normalizedSeed = seed >>> 0;
	const target = targetClues[difficulty];
	let best: { givens: string; solution: string; clues: number } | undefined;

	for (let attempt = 0; attempt < 6; attempt++) {
		const attemptSeed = (normalizedSeed + Math.imul(attempt + 1, 0x9e3779b9)) >>> 0;
		const random = seededRandom(attemptSeed);
		const solution = generateSolution(random);
		const board = [...solution];
		for (const index of shuffled(
			Array.from({ length: 81 }, (_, candidate) => candidate),
			random
		)) {
			if (board.filter(Boolean).length <= target) break;
			const previous = board[index]!;
			board[index] = 0;
			if (countSolutions(board, 2) !== 1) board[index] = previous;
		}
		const clues = board.filter(Boolean).length;
		const candidate = {
			givens: board.join(''),
			solution: solution.join(''),
			clues
		};
		if (!best || candidate.clues < best.clues) best = candidate;
		if (clues <= target) break;
	}

	const titleChoices = titles[difficulty];
	return {
		id: `generated-${difficulty}-${normalizedSeed.toString(36)}`,
		difficulty,
		title: titleChoices[normalizedSeed % titleChoices.length]!,
		givens: best!.givens,
		solution: best!.solution
	};
}

/** Reconstructs a generated puzzle from its storage-safe deterministic ID. */
export function generatedPuzzleFromId(id: string): Puzzle | undefined {
	const match = /^generated-(gentle|tricky|fiendish)-([0-9a-z]+)$/.exec(id);
	if (!match) return undefined;
	const seed = Number.parseInt(match[2]!, 36);
	if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) return undefined;
	return generatePuzzle(match[1] as Difficulty, seed);
}

/** Counts solutions up to a small caller-provided limit for generation and tests. */
export function countPuzzleSolutions(givens: string, limit = 2): number {
	if (!/^[0-9]{81}$/.test(givens)) return 0;
	return countSolutions([...givens].map(Number), limit);
}

function generateSolution(random: () => number): number[] {
	const digitOrder = shuffled([...digits], random);
	const rows = shuffled([0, 1, 2], random).flatMap((band) =>
		shuffled([0, 1, 2], random).map((row) => band * 3 + row)
	);
	const columns = shuffled([0, 1, 2], random).flatMap((stack) =>
		shuffled([0, 1, 2], random).map((column) => stack * 3 + column)
	);
	return rows.flatMap((row) =>
		columns.map((column) => digitOrder[(row * 3 + Math.floor(row / 3) + column) % 9]!)
	);
}

function countSolutions(board: number[], limit: number): number {
	let bestIndex = -1;
	let bestCandidates: number[] | undefined;
	for (let index = 0; index < board.length; index++) {
		if (board[index] !== 0) continue;
		const candidates = candidatesAt(board, index);
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
		solutions += countSolutions(board, limit - solutions);
		if (solutions >= limit) break;
	}
	board[bestIndex] = 0;
	return solutions;
}

function candidatesAt(board: readonly number[], index: number): number[] {
	const row = Math.floor(index / 9);
	const column = index % 9;
	const boxRow = Math.floor(row / 3) * 3;
	const boxColumn = Math.floor(column / 3) * 3;
	const unavailable = new Set<number>();
	for (let offset = 0; offset < 9; offset++) {
		unavailable.add(board[row * 9 + offset]!);
		unavailable.add(board[offset * 9 + column]!);
		unavailable.add(board[(boxRow + Math.floor(offset / 3)) * 9 + boxColumn + (offset % 3)]!);
	}
	return digits.filter((digit) => !unavailable.has(digit));
}

function shuffled<T>(values: T[], random: () => number): T[] {
	for (let index = values.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1));
		[values[index], values[swap]] = [values[swap]!, values[index]!];
	}
	return values;
}

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
	};
}
