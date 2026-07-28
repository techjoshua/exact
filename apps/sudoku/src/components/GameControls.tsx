import type { Component } from '@exactjs/core';
import { SudokuContext } from '../context.js';
import type { DigitPlacementProgress } from '../game-engine.js';
import type { Digit } from '../types.js';

const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type GameControlsProps = {
	selectedDigit?: Digit;
	noteMode: boolean;
	canUndo: boolean;
	canRedo: boolean;
	paused: boolean;
	remaining: number;
	digitProgress: readonly DigitPlacementProgress[];
};

/** Renders thumb-friendly number entry and history controls. */
export function GameControls(this: Component<{}>, props: GameControlsProps) {
	const game = this.getContext(SudokuContext);

	return () => (
		<section className="game-controls" aria-label="Game controls">
			<div className="number-pad">
				{digits.map((digit) => (
					<button
						type="button"
						className="number-key"
						className:is-active={props.selectedDigit === digit}
						className:is-complete={props.digitProgress[digit - 1]?.complete}
						className:is-conflicting={props.digitProgress[digit - 1]?.conflicting}
						aria-label={`${props.selectedDigit === digit ? 'Clear' : 'Select'} ${digit}; ${
							props.digitProgress[digit - 1]?.placed ?? 0
						} of 9 placed${progressStatus(props.digitProgress[digit - 1])}`}
						aria-pressed={props.selectedDigit === digit}
						onClick={() => game.toggleDigit(digit)}
						disabled={props.paused}
					>
						<span className="number-key-digit">{digit}</span>
						<span
							className="number-key-progress"
							style={{
								width: `${Math.min(props.digitProgress[digit - 1]?.placed ?? 0, 9) * (100 / 9)}%`
							}}
							aria-hidden="true"
						/>
					</button>
				))}
			</div>
			<div className="control-row">
				<button
					type="button"
					className="tool-button"
					className:is-active={props.noteMode}
					aria-pressed={props.noteMode}
					onClick={() => game.toggleNotes()}
					disabled={props.paused}
				>
					<span aria-hidden="true">✎</span>
					Notes
				</button>
				<button
					type="button"
					className="tool-button"
					onClick={() => game.erase()}
					disabled={props.paused}
				>
					<span aria-hidden="true">⌫</span>
					Erase
				</button>
				<button
					type="button"
					className="tool-button"
					onClick={() => game.undo()}
					disabled={!props.canUndo || props.paused}
				>
					<span aria-hidden="true">↶</span>
					Undo
				</button>
				<button
					type="button"
					className="tool-button"
					onClick={() => game.redo()}
					disabled={!props.canRedo || props.paused}
				>
					<span aria-hidden="true">↷</span>
					Redo
				</button>
			</div>
			<button type="button" className="mobile-new-game-button" onClick={() => game.newGame()}>
				<span aria-hidden="true">↻</span>
				New puzzle
			</button>
			<p className="remaining-copy">
				{props.selectedDigit === undefined
					? 'Choose a number, then tap cells'
					: `${props.selectedDigit} selected · tap cells to ${
							props.noteMode ? 'toggle pencil marks' : 'fill them'
						}`}
				<span> · {props.remaining} cells waiting</span>
			</p>
		</section>
	);
}

function progressStatus(progress: DigitPlacementProgress | undefined): string {
	if (progress?.complete) return '; complete without conflicts';
	if (progress?.conflicting) return '; has conflicts';
	return '';
}
