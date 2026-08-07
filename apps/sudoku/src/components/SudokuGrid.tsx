import type { Component } from '@exactjs/core';
import { defineGesture, type GestureSample } from '@exactjs/gestures';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by gesture:* attributes.
import gesture from '@exactjs/gestures' with { type: 'exact-enhancement' };
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by motion:* attributes.
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import { fade, pop } from '@exactjs/motion/presets';
import { SudokuContext } from '../context.js';
import { arePeers } from '../game-engine.js';
import type { Digit, SudokuCell } from '../types.js';

const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const noteDigits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type SudokuGridProps = {
	cells: SudokuCell[];
	selectedIndex: number;
	selectedDigit?: Digit;
	conflicts: number[];
	paused: boolean;
	complete: boolean;
};

/** Renders the stable accessible board and its derived cell relationships. */
export function SudokuGrid(this: Component<{}>, props: SudokuGridProps) {
	const game = this.getContext(SudokuContext);
	const selectedValue = props.selectedDigit ?? props.cells[props.selectedIndex]?.value;

	return () => (
		<div className="board-frame" className:is-complete={props.complete}>
			<div
				className="sudoku-board"
				className:is-paused={props.paused}
				role="grid"
				aria-label="Sudoku puzzle"
				aria-rowcount={9}
				aria-colcount={9}
			>
				{rows.map((row) => (
					<div className="sudoku-row" role="row">
						{props.cells
							.filter((cell) => cell.row === row)
							.map((cell) => (
								<CellButton
									cell={cell}
									selected={props.selectedDigit === undefined && cell.index === props.selectedIndex}
									peer={
										props.selectedDigit === undefined && arePeers(cell.index, props.selectedIndex)
									}
									matching={
										selectedValue !== undefined &&
										(cell.value === selectedValue || cell.notes.includes(selectedValue))
									}
									matchingDigit={selectedValue}
									conflict={props.conflicts.includes(cell.index)}
									paused={props.paused}
								/>
							))}
					</div>
				))}
			</div>
			{props.paused ? (
				<button
					className="pause-cover"
					type="button"
					onClick={() => game.togglePause()}
					motion:apply={fade}
				>
					<span>Game paused</span>
					<small>Tap to return</small>
				</button>
			) : null}
			{props.complete ? (
				<div className="victory-banner" role="status" motion:apply={pop}>
					<span className="victory-mark">✦</span>
					<strong>Beautifully solved</strong>
					<small>Every row, column and house is complete.</small>
					<button type="button" onClick={() => game.newGame()}>
						Start a new puzzle
					</button>
				</div>
			) : null}
		</div>
	);
}

type CellButtonProps = {
	cell: SudokuCell;
	selected: boolean;
	peer: boolean;
	matching: boolean;
	matchingDigit?: Digit;
	conflict: boolean;
	paused: boolean;
};

/** Renders one stable grid cell with value, notes, and accessible state. */
function CellButton(this: Component<{}>, props: CellButtonProps) {
	const game = this.getContext(SudokuContext);
	let suppressClickUntil = 0;

	function eraseHeldCell(sample: GestureSample) {
		if (props.cell.given || props.paused) return;
		suppressClickUntil = performance.now() + 500;
		sample.originalEvent.preventDefault();
		game.erase(props.cell.index);
	}

	// This is pointer-only convenience; keyboard activation must continue to select the cell.
	const eraseOnHold = defineGesture({
		name: 'erase-sudoku-cell-on-hold',
		semantics: 'decorative',
		press: {
			threshold: 6,
			delay: 550,
			onPress: eraseHeldCell
		}
	});

	const selectCell = () => {
		if (performance.now() < suppressClickUntil) {
			suppressClickUntil = 0;
			return;
		}
		game.select(props.cell.index);
	};

	return () => (
		<button
			type="button"
			role="gridcell"
			className="sudoku-cell"
			className:is-given={props.cell.given}
			className:is-selected={props.selected}
			className:is-peer={props.peer}
			className:is-matching={props.matching}
			className:is-conflict={props.conflict}
			aria-label={cellLabel(props.cell, props.conflict)}
			aria-selected={props.selected}
			disabled={props.paused}
			tabIndex={props.selected ? 0 : -1}
			onClick={selectCell}
			gesture:apply={eraseOnHold}
		>
			{props.cell.value !== undefined ? (
				<span className="cell-value">{props.cell.value}</span>
			) : (
				<span className="cell-notes" aria-hidden="true">
					{noteDigits.map((digit) => (
						<span
							className:is-note-match={
								props.cell.notes.includes(digit) && digit === props.matchingDigit
							}
						>
							{props.cell.notes.includes(digit) ? digit : ''}
						</span>
					))}
				</span>
			)}
		</button>
	);
}

function cellLabel(cell: SudokuCell, conflict: boolean): string {
	const position = `Row ${cell.row + 1}, column ${cell.column + 1}`;
	if (cell.value !== undefined) {
		return `${position}, ${cell.given ? 'given' : 'entered'} ${cell.value}${conflict ? ', conflict' : ''}`;
	}
	if (cell.notes.length) return `${position}, notes ${cell.notes.join(', ')}`;
	return `${position}, empty`;
}
