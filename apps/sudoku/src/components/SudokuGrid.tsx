import type { Component } from '@exactjs/core';
import { defineGesture, type GestureSample } from '@exactjs/gestures';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by gesture:* attributes.
import gesture from '@exactjs/gestures' with { type: 'exact-enhancement' };
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by motion:* attributes.
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import { fade, pop } from '@exactjs/motion/presets';
import { SudokuContext } from '../context.js';
import { arePeers } from '../game-engine.js';
import { formatElapsed } from '../presentation.js';
import type { Digit, SudokuCell } from '../types.js';

const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const noteDigits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type SudokuGridProps = {
	cells: SudokuCell[];
	selection: { index: number; digit?: Digit };
	conflicts: number[];
	paused: boolean;
	complete: boolean;
	elapsedSeconds: number;
};

/** Renders the stable accessible board and its derived cell relationships. */
export function SudokuGrid(this: Component<{}>, props: SudokuGridProps) {
	const game = this.getContext(SudokuContext);
	const selectedValue =
		props.selection.digit ??
		(props.selection.index < 0 ? undefined : props.cells[props.selection.index]?.value);

	return () => (
		<div className="board-frame" className:is-complete={props.complete}>
			<div
				className={[
					'sudoku-board',
					selectedValue === undefined ? '' : `selected-digit-${selectedValue}`
				]}
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
								<CellButton cell={cell} grid={props} />
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
					<small>
						Every row, column and house is complete in {formatElapsed(props.elapsedSeconds)}.
					</small>
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
	grid: SudokuGridProps;
};

/** Renders one stable grid cell with value, notes, and accessible state. */
function CellButton(this: Component<{}>, props: CellButtonProps) {
	const game = this.getContext(SudokuContext);
	const selected =
		props.grid.selection.digit === undefined && props.cell.index === props.grid.selection.index;
	const peer =
		props.grid.selection.digit === undefined &&
		props.grid.selection.index >= 0 &&
		arePeers(props.cell.index, props.grid.selection.index);
	const conflict = props.grid.conflicts.includes(props.cell.index);
	let suppressClickUntil = 0;

	function eraseHeldCell(sample: GestureSample) {
		if (props.cell.given || props.grid.paused) return;
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

	const toggleSelectedNote = (event: PointerEvent) => {
		if (event.pointerType !== 'mouse' || event.button !== 2) return;
		event.preventDefault();
		if (props.cell.given || props.grid.paused) return;
		game.toggleNote(props.cell.index);
	};

	const suppressContextMenu = (event: MouseEvent) => {
		if (event.button === 2) event.preventDefault();
	};

	return () => (
		<button
			type="button"
			role="gridcell"
			className="sudoku-cell"
			className:is-given={props.cell.given}
			className:has-value={props.cell.value !== undefined}
			className:is-selected={selected}
			className:is-peer={peer}
			className:is-conflict={conflict}
			data-value={props.cell.value}
			data-notes={props.cell.notes.join(' ')}
			aria-label={cellLabel(props.cell, conflict)}
			aria-selected={selected}
			disabled={props.grid.paused}
			tabIndex={selected ? 0 : -1}
			onClick={selectCell}
			onPointerDown={toggleSelectedNote}
			onContextMenu={suppressContextMenu}
			gesture:apply={eraseOnHold}
		>
			<span className="cell-value" aria-hidden="true">
				{props.cell.value ?? ''}
			</span>
			<span className="cell-notes" aria-hidden="true">
				{noteDigits.map((digit) => (
					<span className:is-note={props.cell.notes.includes(digit)} data-digit={digit}>
						{props.cell.notes.includes(digit) ? digit : ''}
					</span>
				))}
			</span>
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
