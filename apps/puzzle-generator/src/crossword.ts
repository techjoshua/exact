import { seededRandom, shuffled } from './random.js';
import type { CrosswordCell, CrosswordClue, CrosswordPuzzle } from './types.js';

type Orientation = 'across' | 'down';
type PlacedWord = {
	word: string;
	row: number;
	column: number;
	orientation: Orientation;
};

type Layout = {
	letters: Map<string, string>;
	owners: Map<string, Set<Orientation>>;
	placed: PlacedWord[];
	unplaced: string[];
};

/**
 * Builds a connected crossword through repeated seeded greedy layouts.
 * The selected layout prioritizes placed words, overlaps, then compact area.
 */
export function generateCrossword(
	words: readonly string[],
	seed: number,
	clues: readonly CrosswordClue[] = words.map((word) => ({ word, clue: 'No clue provided' }))
): CrosswordPuzzle {
	let best: Layout | undefined;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (let attempt = 0; attempt < 160; attempt++) {
		const random = seededRandom((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
		const ordered = orderWords(words, random, attempt);
		const layout = buildLayout(ordered, random);
		const bounds = layoutBounds(layout.letters);
		const overlaps = [...layout.owners.values()].filter((owners) => owners.size > 1).length;
		const score = layout.placed.length * 100_000 + overlaps * 1_000 - bounds.rows * bounds.columns;
		if (score > bestScore) {
			best = layout;
			bestScore = score;
		}
		if (
			layout.placed.length === words.length &&
			bounds.rows * bounds.columns <= totalLetters(words) * 2
		)
			break;
	}
	return normalizeLayout(best!, new Map(clues.map((entry) => [entry.word, entry.clue])));
}

function orderWords(words: readonly string[], random: () => number, attempt: number): string[] {
	const ordered = shuffled(words, random);
	if (attempt % 3 === 0) ordered.sort((left, right) => right.length - left.length);
	else if (attempt % 3 === 1)
		ordered.sort((left, right) => sharedLetterScore(right, words) - sharedLetterScore(left, words));
	return ordered;
}

function buildLayout(words: readonly string[], random: () => number): Layout {
	const layout: Layout = {
		letters: new Map(),
		owners: new Map(),
		placed: [],
		unplaced: []
	};
	const first = words[0]!;
	placeWord(layout, {
		word: first,
		row: 0,
		column: -Math.floor(first.length / 2),
		orientation: 'across'
	});

	for (const word of words.slice(1)) {
		const candidates: Array<PlacedWord & { overlaps: number; area: number }> = [];
		for (let letterIndex = 0; letterIndex < word.length; letterIndex++) {
			for (const [coordinate, letter] of layout.letters) {
				if (letter !== word[letterIndex]) continue;
				const [row, column] = parseCoordinate(coordinate);
				for (const orientation of shuffled<Orientation>(['across', 'down'], random)) {
					const candidate: PlacedWord = {
						word,
						row: orientation === 'down' ? row - letterIndex : row,
						column: orientation === 'across' ? column - letterIndex : column,
						orientation
					};
					const overlaps = validPlacement(layout, candidate);
					if (overlaps < 1) continue;
					const simulated = new Map(layout.letters);
					forEachWordCell(candidate, (cellRow, cellColumn, cellLetter) =>
						simulated.set(coordinateKey(cellRow, cellColumn), cellLetter)
					);
					const bounds = layoutBounds(simulated);
					candidates.push({ ...candidate, overlaps, area: bounds.rows * bounds.columns });
				}
			}
		}
		candidates.sort((left, right) => right.overlaps - left.overlaps || left.area - right.area);
		if (candidates[0]) placeWord(layout, candidates[0]);
		else layout.unplaced.push(word);
	}
	return layout;
}

function validPlacement(layout: Layout, candidate: PlacedWord): number {
	let overlaps = 0;
	let valid = true;
	forEachWordCell(candidate, (row, column, letter, index) => {
		if (!valid) return;
		const key = coordinateKey(row, column);
		const existing = layout.letters.get(key);
		const owners = layout.owners.get(key);
		if (existing && existing !== letter) {
			valid = false;
			return;
		}
		if (owners?.has(candidate.orientation)) {
			valid = false;
			return;
		}
		if (existing) overlaps++;
		else {
			const neighbors =
				candidate.orientation === 'across'
					? [coordinateKey(row - 1, column), coordinateKey(row + 1, column)]
					: [coordinateKey(row, column - 1), coordinateKey(row, column + 1)];
			if (neighbors.some((neighbor) => layout.letters.has(neighbor))) valid = false;
		}
		if (index === 0) {
			const before =
				candidate.orientation === 'across'
					? coordinateKey(row, column - 1)
					: coordinateKey(row - 1, column);
			if (layout.letters.has(before)) valid = false;
		}
		if (index === candidate.word.length - 1) {
			const after =
				candidate.orientation === 'across'
					? coordinateKey(row, column + 1)
					: coordinateKey(row + 1, column);
			if (layout.letters.has(after)) valid = false;
		}
	});
	return valid ? overlaps : 0;
}

function placeWord(layout: Layout, placement: PlacedWord): void {
	forEachWordCell(placement, (row, column, letter) => {
		const key = coordinateKey(row, column);
		layout.letters.set(key, letter);
		const owners = layout.owners.get(key) ?? new Set<Orientation>();
		owners.add(placement.orientation);
		layout.owners.set(key, owners);
	});
	layout.placed.push(placement);
}

function normalizeLayout(layout: Layout, clues: ReadonlyMap<string, string>): CrosswordPuzzle {
	const bounds = layoutBounds(layout.letters);
	const starts = new Map<string, number>();
	let nextNumber = 1;
	for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
		for (let column = bounds.minColumn; column <= bounds.maxColumn; column++) {
			const key = coordinateKey(row, column);
			if (layout.placed.some((word) => word.row === row && word.column === column))
				starts.set(key, nextNumber++);
		}
	}
	const cells: Array<CrosswordCell | undefined> = [];
	for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
		for (let column = bounds.minColumn; column <= bounds.maxColumn; column++) {
			const key = coordinateKey(row, column);
			const letter = layout.letters.get(key);
			cells.push(letter ? { letter, number: starts.get(key) } : undefined);
		}
	}
	return {
		rows: bounds.rows,
		columns: bounds.columns,
		cells,
		words: layout.placed.map((placement) => placement.word).sort(),
		entries: layout.placed
			.map((placement) => ({
				word: placement.word,
				clue: clues.get(placement.word) ?? 'No clue provided',
				number: starts.get(coordinateKey(placement.row, placement.column))!,
				orientation: placement.orientation
			}))
			.sort(
				(left, right) =>
					left.number - right.number || left.orientation.localeCompare(right.orientation)
			),
		unplaced: layout.unplaced.sort()
	};
}

function forEachWordCell(
	placement: PlacedWord,
	visit: (row: number, column: number, letter: string, index: number) => void
): void {
	for (let index = 0; index < placement.word.length; index++) {
		visit(
			placement.row + (placement.orientation === 'down' ? index : 0),
			placement.column + (placement.orientation === 'across' ? index : 0),
			placement.word[index]!,
			index
		);
	}
}

function layoutBounds(letters: ReadonlyMap<string, string>): {
	minRow: number;
	maxRow: number;
	minColumn: number;
	maxColumn: number;
	rows: number;
	columns: number;
} {
	const coordinates = [...letters.keys()].map(parseCoordinate);
	const rows = coordinates.map(([row]) => row);
	const columns = coordinates.map(([, column]) => column);
	const minRow = Math.min(...rows);
	const maxRow = Math.max(...rows);
	const minColumn = Math.min(...columns);
	const maxColumn = Math.max(...columns);
	return {
		minRow,
		maxRow,
		minColumn,
		maxColumn,
		rows: maxRow - minRow + 1,
		columns: maxColumn - minColumn + 1
	};
}

function coordinateKey(row: number, column: number): string {
	return `${row},${column}`;
}

function parseCoordinate(value: string): [number, number] {
	const [row, column] = value.split(',').map(Number);
	return [row!, column!];
}

function sharedLetterScore(word: string, words: readonly string[]): number {
	const others = new Set(words.filter((candidate) => candidate !== word).join(''));
	return [...new Set(word)].filter((letter) => others.has(letter)).length;
}

function totalLetters(words: readonly string[]): number {
	return words.reduce((sum, word) => sum + word.length, 0);
}
