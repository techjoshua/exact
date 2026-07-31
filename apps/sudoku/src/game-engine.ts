import type { CellChange, Digit, GameMove, Puzzle, SudokuCell } from './types.js';

const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Describes one digit's visible progress without revealing solution correctness. */
export type DigitPlacementProgress = {
	placed: number;
	conflicting: boolean;
	complete: boolean;
};

/** Creates the stable 81-cell model for a puzzle. @exact client */
export function createCells(puzzle: Puzzle): SudokuCell[] {
	return Array.from({ length: 81 }, (_, index) => {
		const parsed = Number(puzzle.givens[index]);
		const value = isDigit(parsed) ? parsed : undefined;
		return {
			id: `cell-${index}`,
			index,
			row: Math.floor(index / 9),
			column: index % 9,
			box: Math.floor(index / 27) * 3 + Math.floor((index % 9) / 3),
			given: value !== undefined,
			value,
			notes: []
		};
	});
}

/**
 * Returns whether two cell indexes share a row, column, or three-by-three box.
 * @exact client
 * @exact pure
 */
export function arePeers(leftIndex: number, rightIndex: number): boolean {
	if (leftIndex === rightIndex) return false;
	const leftRow = Math.floor(leftIndex / 9);
	const rightRow = Math.floor(rightIndex / 9);
	const leftColumn = leftIndex % 9;
	const rightColumn = rightIndex % 9;
	const leftBox = Math.floor(leftIndex / 27) * 3 + Math.floor(leftColumn / 3);
	const rightBox = Math.floor(rightIndex / 27) * 3 + Math.floor(rightColumn / 3);
	return leftRow === rightRow || leftColumn === rightColumn || leftBox === rightBox;
}

/**
 * Calculates legal candidates from current board values without storing derived state.
 * @exact client
 * @exact pure
 */
export function candidatesFor(cells: readonly SudokuCell[], index: number): Digit[] {
	if (cells[index]?.value !== undefined) return [];
	const unavailable = new Set<Digit>();
	for (const cell of cells) {
		if (cell.value !== undefined && arePeers(index, cell.index)) unavailable.add(cell.value);
	}
	return digits.filter((digit) => !unavailable.has(digit));
}

/**
 * Finds every cell participating in a duplicated row, column, or box value.
 * Builds fixed-width digit indexes in one board pass, so filled cells do not add peer scans.
 * @exact client
 * @exact pure
 */
export function findConflicts(cells: readonly SudokuCell[]): number[] {
	const conflicts = new Set<number>();
	const rows = createUnitDigitIndex();
	const columns = createUnitDigitIndex();
	const boxes = createUnitDigitIndex();
	for (const cell of cells) {
		const value = cell.value;
		if (value === undefined) continue;
		recordUnitDigit(rows[cell.row]!, value, cell.index, conflicts);
		recordUnitDigit(columns[cell.column]!, value, cell.index, conflicts);
		recordUnitDigit(boxes[cell.box]!, value, cell.index, conflicts);
	}
	return [...conflicts];
}

/** Creates one fixed-width digit index for every Sudoku unit. */
function createUnitDigitIndex(): Array<Array<number | undefined>> {
	return Array.from({ length: 9 }, () => new Array<number | undefined>(10));
}

/** Records one placement and marks both sides when the unit already contains that digit. */
function recordUnitDigit(
	unit: Array<number | undefined>,
	digit: Digit,
	index: number,
	conflicts: Set<number>
): void {
	const previous = unit[digit];
	if (previous === undefined) {
		unit[digit] = index;
		return;
	}
	conflicts.add(previous);
	conflicts.add(index);
}

/**
 * Reports completion only for a full board with no conflicts.
 * @exact client
 * @exact pure
 */
export function isSolved(cells: readonly SudokuCell[]): boolean {
	return cells.every((cell) => cell.value !== undefined) && findConflicts(cells).length === 0;
}

/**
 * Counts filled non-given cells for the progress display.
 * @exact client
 * @exact pure
 */
export function enteredCellCount(cells: readonly SudokuCell[]): number {
	return cells.filter((cell) => !cell.given && cell.value !== undefined).length;
}

/**
 * Counts the editable cells in a puzzle.
 * @exact client
 * @exact pure
 */
export function editableCellCount(cells: readonly SudokuCell[]): number {
	return cells.filter((cell) => !cell.given).length;
}

/**
 * Derives count and board-validity progress for every number-pad digit.
 *
 * Completion means exactly nine placements and no current row, column, or box
 * conflict. It deliberately does not compare player entries with the solution.
 * @exact client
 * @exact pure
 */
export function digitPlacementProgress(
	cells: readonly SudokuCell[],
	conflicts: readonly number[]
): readonly DigitPlacementProgress[] {
	const progress = Array.from<unknown, DigitPlacementProgress>({ length: 9 }, () => ({
		placed: 0,
		conflicting: false,
		complete: false
	}));
	const conflictIndexes = new Set(conflicts);
	for (const cell of cells) {
		if (cell.value === undefined) continue;
		const digit = progress[cell.value - 1]!;
		digit.placed++;
		if (conflictIndexes.has(cell.index)) digit.conflicting = true;
	}
	for (const digit of progress) digit.complete = digit.placed === 9 && !digit.conflicting;
	return progress;
}

/**
 * Plans one value entry as an atomic transaction.
 *
 * Entering a value also removes the same pencil mark from peers. Keeping those
 * changes in one plan lets undo restore the exact prior board.
 * @exact client
 * @exact pure
 */
export function planValueEntry(
	cells: readonly SudokuCell[],
	index: number,
	value: Digit | undefined
): CellChange[] {
	const target = cells[index];
	if (!target || target.given) return [];
	const changes: CellChange[] = [
		{
			index,
			beforeValue: target.value,
			afterValue: value,
			beforeNotes: [...target.notes],
			afterNotes: []
		}
	];

	if (value !== undefined) {
		for (const cell of cells) {
			if (!arePeers(index, cell.index) || !cell.notes.includes(value)) continue;
			changes.push({
				index: cell.index,
				beforeValue: cell.value,
				afterValue: cell.value,
				beforeNotes: [...cell.notes],
				afterNotes: cell.notes.filter((note) => note !== value)
			});
		}
	}

	return changes.filter(
		(change) =>
			change.beforeValue !== change.afterValue ||
			change.beforeNotes.join(',') !== change.afterNotes.join(',')
	);
}

/**
 * Plans a pencil-mark toggle for an empty editable cell.
 * @exact client
 * @exact pure
 */
export function planNoteToggle(
	cells: readonly SudokuCell[],
	index: number,
	digit: Digit
): CellChange[] {
	const cell = cells[index];
	if (!cell || cell.given || cell.value !== undefined) return [];
	const notes = cell.notes.includes(digit)
		? cell.notes.filter((note) => note !== digit)
		: [...cell.notes, digit].sort((left, right) => left - right);
	return [
		{
			index,
			beforeValue: cell.value,
			afterValue: cell.value,
			beforeNotes: [...cell.notes],
			afterNotes: notes
		}
	];
}

/** Applies or reverses a planned move while preserving stable cell objects. @exact client */
export function applyMove(cells: SudokuCell[], move: GameMove, direction: 'forward' | 'backward') {
	for (const change of move.changes) {
		const cell = cells[change.index];
		if (!cell) continue;
		cell.value = direction === 'forward' ? change.afterValue : change.beforeValue;
		cell.notes = direction === 'forward' ? [...change.afterNotes] : [...change.beforeNotes];
	}
}

/**
 * Moves a selected cell by row and column deltas without leaving the board.
 * @exact client
 * @exact pure
 */
export function moveSelection(index: number, rowDelta: number, columnDelta: number): number {
	const row = Math.max(0, Math.min(8, Math.floor(index / 9) + rowDelta));
	const column = Math.max(0, Math.min(8, (index % 9) + columnDelta));
	return row * 9 + column;
}

/**
 * Narrows an arbitrary numeric keyboard value to a Sudoku digit.
 * @exact client
 * @exact pure
 */
export function isDigit(value: number): value is Digit {
	return Number.isInteger(value) && value >= 1 && value <= 9;
}
