import { createCells } from './game-engine.js';
import { findPuzzle } from './puzzles.js';
import type { SavedGame, SudokuCell, ThemeId } from './types.js';

/** Browser key for the single device-local game. */
export const storageKey = 'exact-sudoku:game-v1';

const themeIds: readonly ThemeId[] = [
	'paper',
	'midnight',
	'candy',
	'arcade',
	'blueprint',
	'botanical',
	'solar'
];

/** Returns a validated local game or undefined when stored data is unusable. @exact client */
export function loadSavedGame(): { saved: SavedGame; cells: SudokuCell[] } | undefined {
	try {
		const parsed = JSON.parse(
			localStorage.getItem(storageKey) ?? 'null'
		) as Partial<SavedGame> | null;
		if (
			!parsed ||
			typeof parsed.puzzleId !== 'string' ||
			!Array.isArray(parsed.values) ||
			parsed.values.length !== 81 ||
			!Array.isArray(parsed.notes) ||
			parsed.notes.length !== 81
		) {
			return undefined;
		}
		const puzzle = findPuzzle(parsed.puzzleId);
		const cells = createCells(puzzle);
		for (let index = 0; index < cells.length; index++) {
			if (cells[index]!.given) continue;
			const value = parsed.values[index];
			cells[index]!.value =
				typeof value === 'number' && value >= 1 && value <= 9
					? (value as SavedGame['values'][number])
					: undefined;
			cells[index]!.notes = (parsed.notes[index] ?? []).filter(
				(note): note is 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 =>
					Number.isInteger(note) && note >= 1 && note <= 9
			);
		}
		const saved: SavedGame = {
			puzzleId: puzzle.id,
			values: cells.map((cell) => cell.value),
			notes: cells.map((cell) => [...cell.notes]),
			elapsedSeconds:
				typeof parsed.elapsedSeconds === 'number' && parsed.elapsedSeconds >= 0
					? Math.floor(parsed.elapsedSeconds)
					: 0,
			theme: themeIds.includes(parsed.theme as ThemeId) ? (parsed.theme as ThemeId) : 'paper'
		};
		return { saved, cells };
	} catch {
		return undefined;
	}
}

/** Produces the compact device-local snapshot persisted by the game task. @exact client */
export function createSavedGame(
	puzzleId: string,
	cells: readonly SudokuCell[],
	elapsedSeconds: number,
	theme: ThemeId
): SavedGame {
	return {
		puzzleId,
		values: cells.map((cell) => cell.value),
		notes: cells.map((cell) => [...cell.notes]),
		elapsedSeconds,
		theme
	};
}
