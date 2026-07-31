import { moveSelection } from './game-engine.js';
import type { Difficulty, SudokuState } from './types.js';

/** Selects the first cell a player can edit, falling back to the board origin. */
export function firstEditableIndex(cells: SudokuState['cells']): number {
	const index = cells.findIndex((cell) => !cell.given);
	return index < 0 ? 0 : index;
}

/** Resolves arrow-key navigation without changing selection for other keys. */
export function keyboardSelection(index: number, key: string): number {
	if (key === 'ArrowUp') return moveSelection(index, -1, 0);
	if (key === 'ArrowDown') return moveSelection(index, 1, 0);
	if (key === 'ArrowLeft') return moveSelection(index, 0, -1);
	if (key === 'ArrowRight') return moveSelection(index, 0, 1);
	return index;
}

/** Formats elapsed game time as a zero-padded minutes-and-seconds label. */
export function formatElapsed(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/** Returns the player-facing label for a supported puzzle difficulty. */
export function difficultyLabel(difficulty: Difficulty): string {
	if (difficulty === 'gentle') return 'gentle';
	if (difficulty === 'tricky') return 'tricky';
	return 'fiendish';
}
