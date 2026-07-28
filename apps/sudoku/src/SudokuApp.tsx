import type { Component } from '@exactjs/core';
import { SudokuContext } from './context.js';
import {
	applyMove,
	candidatesFor,
	createCells,
	editableCellCount,
	enteredCellCount,
	findConflicts,
	isDigit,
	isSolved,
	moveSelection,
	planNoteToggle,
	planValueEntry
} from './game-engine.js';
import { findPuzzle, nextPuzzle } from './puzzles.js';
import { createSavedGame, loadSavedGame, storageKey } from './storage.js';
import { themeName } from './themes.js';
import type { Difficulty, Digit, GameMove, SudokuCommands, SudokuState } from './types.js';
import { ExactLens } from './components/ExactLens.jsx';
import { GameControls } from './components/GameControls.jsx';
import { SudokuGrid } from './components/SudokuGrid.jsx';
import { ThemePicker } from './components/ThemePicker.jsx';

/** Owns the complete browser-local game, history, timer, preferences, and command surface. */
export function SudokuApp(this: Component<SudokuState>) {
	const restored = loadSavedGame();
	const initialPuzzle = restored
		? findPuzzle(restored.saved.puzzleId)
		: findPuzzle('gentle-morning');

	this.state.puzzleId = initialPuzzle.id;
	this.state.difficulty = initialPuzzle.difficulty;
	this.state.cells = restored?.cells ?? createCells(initialPuzzle);
	this.state.selectedIndex = firstEditableIndex(this.state.cells);
	this.state.selectedDigit = undefined;
	this.state.noteMode = false;
	this.state.history = [];
	this.state.future = [];
	this.state.nextMoveId = 1;
	this.state.elapsedSeconds = restored?.saved.elapsedSeconds ?? 0;
	this.state.paused = false;
	this.state.theme = restored?.saved.theme ?? 'paper';
	this.state.lensOpen = true;
	this.state.themeMenuOpen = false;

	const puzzle = findPuzzle(this.state.puzzleId);
	const conflicts = findConflicts(this.state.cells);
	const complete = isSolved(this.state.cells);
	const entered = enteredCellCount(this.state.cells);
	const editable = editableCellCount(this.state.cells);
	const selectedCell = this.state.cells[this.state.selectedIndex]!;
	const selectedCandidates = candidatesFor(this.state.cells, this.state.selectedIndex);
	const lastMove = this.state.history[this.state.history.length - 1];
	const remaining = editable - entered;
	const progress = editable === 0 ? 100 : Math.round((entered / editable) * 100);

	const commit = (label: string, changes: GameMove['changes']) => {
		if (!changes.length || complete) return;
		const move: GameMove = {
			id: this.state.nextMoveId++,
			label,
			changes
		};
		applyMove(this.state.cells, move, 'forward');
		this.state.history.push(move);
		this.state.future = [];
	};

	const enter = (digit: Digit) => {
		if (this.state.noteMode) {
			commit(
				`Toggle note ${digit}`,
				planNoteToggle(this.state.cells, this.state.selectedIndex, digit)
			);
			return;
		}
		commit(`Enter ${digit}`, planValueEntry(this.state.cells, this.state.selectedIndex, digit));
	};

	const erase = () => {
		const cell = this.state.cells[this.state.selectedIndex];
		if (!cell || cell.given) return;
		commit('Erase cell', planValueEntry(this.state.cells, cell.index, undefined));
	};

	const undo = () => {
		const move = this.state.history[this.state.history.length - 1];
		if (!move) return;
		applyMove(this.state.cells, move, 'backward');
		this.state.history.pop();
		this.state.future.push(move);
		this.state.selectedIndex = move.changes[0]?.index ?? this.state.selectedIndex;
	};

	const redo = () => {
		const move = this.state.future[this.state.future.length - 1];
		if (!move) return;
		applyMove(this.state.cells, move, 'forward');
		this.state.future.pop();
		this.state.history.push(move);
		this.state.selectedIndex = move.changes[0]?.index ?? this.state.selectedIndex;
	};

	const startPuzzle = (difficulty: Difficulty) => {
		const next = nextPuzzle(difficulty, this.state.puzzleId);
		this.state.puzzleId = next.id;
		this.state.difficulty = next.difficulty;
		this.state.cells = createCells(next);
		this.state.selectedIndex = firstEditableIndex(this.state.cells);
		this.state.selectedDigit = undefined;
		this.state.noteMode = false;
		this.state.history = [];
		this.state.future = [];
		this.state.elapsedSeconds = 0;
		this.state.paused = false;
	};

	const commands: SudokuCommands = {
		select: (index) => {
			if (index < 0 || index > 80) return;
			this.state.selectedIndex = index;
			this.state.themeMenuOpen = false;
			const cell = this.state.cells[index];
			if (this.state.selectedDigit !== undefined && cell && !cell.given) {
				enter(this.state.selectedDigit);
			}
		},
		toggleDigit: (digit) => {
			this.state.selectedDigit = this.state.selectedDigit === digit ? undefined : digit;
		},
		erase,
		toggleNotes: () => {
			this.state.noteMode = !this.state.noteMode;
		},
		undo,
		redo,
		newGame: (difficulty) => {
			startPuzzle(difficulty ?? this.state.difficulty);
		},
		setDifficulty: (difficulty) => {
			if (difficulty === this.state.difficulty) return;
			startPuzzle(difficulty);
		},
		setTheme: (theme) => {
			this.state.theme = theme;
			this.state.themeMenuOpen = false;
		},
		toggleThemeMenu: () => {
			this.state.themeMenuOpen = !this.state.themeMenuOpen;
		},
		togglePause: () => {
			if (complete) return;
			this.state.paused = !this.state.paused;
		},
		toggleLens: () => {
			this.state.lensOpen = !this.state.lensOpen;
		}
	};
	this.setContext(SudokuContext, commands);

	const persistGame = () => {
		localStorage.setItem(
			storageKey,
			JSON.stringify(
				createSavedGame(
					this.state.puzzleId,
					this.state.cells,
					this.state.elapsedSeconds,
					this.state.theme
				)
			)
		);
	};

	this.task(this.state.paused, complete, (paused, solved) => {
		if (paused || solved) return;
		setInterval(() => this.state.elapsedSeconds++, 1000);
	});

	this.task(this.state.puzzleId, JSON.stringify(this.state.cells), this.state.theme, () =>
		persistGame()
	);

	// Capture timer-only progress when the session is suspended without making
	// the one-second display update a persistence dependency.
	this.task(({ signal }) => {
		const persistWhenHidden = () => {
			if (document.visibilityState === 'hidden') persistGame();
		};
		document.addEventListener('visibilitychange', persistWhenHidden, { signal });
		window.addEventListener('pagehide', persistGame, { signal });
	});

	this.task(({ signal }) => {
		window.addEventListener(
			'keydown',
			(event) => {
				if (event.target instanceof HTMLSelectElement) return;
				if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
					event.preventDefault();
					if (event.shiftKey) redo();
					else undo();
					return;
				}
				const digit = Number(event.key);
				if (isDigit(digit)) {
					event.preventDefault();
					this.state.selectedDigit = this.state.selectedDigit === digit ? undefined : digit;
					return;
				}
				if (
					(event.key === 'Enter' || event.key === ' ') &&
					this.state.selectedDigit !== undefined
				) {
					event.preventDefault();
					enter(this.state.selectedDigit);
					return;
				}
				if (event.key === 'Backspace' || event.key === 'Delete') {
					event.preventDefault();
					erase();
					return;
				}
				if (event.key.toLowerCase() === 'n') {
					event.preventDefault();
					this.state.noteMode = !this.state.noteMode;
					return;
				}
				const nextIndex = keyboardSelection(this.state.selectedIndex, event.key);
				if (nextIndex !== this.state.selectedIndex) {
					event.preventDefault();
					this.state.selectedIndex = nextIndex;
				}
				if (event.key === 'Escape') this.state.themeMenuOpen = false;
			},
			{ signal }
		);
	});

	return () => (
		<div className={`sudoku-app theme-${this.state.theme}`}>
			<div className="ambient ambient-one" aria-hidden="true" />
			<div className="ambient ambient-two" aria-hidden="true" />
			<header className="topbar">
				<a className="brand" href="/" aria-label="Sudoku Atelier home">
					<span className="brand-mark" aria-hidden="true">
						<span>9</span>
						<span>3</span>
						<span>6</span>
						<span>1</span>
					</span>
					<span>
						<strong>Sudoku Atelier</strong>
						<small>crafted with eXact</small>
					</span>
				</a>
				<div className="topbar-actions">
					<span className="theme-label">{themeName(this.state.theme)}</span>
					<button
						type="button"
						className="icon-button mobile-lens-trigger"
						aria-label={this.state.lensOpen ? 'Close eXact Lens' : 'Open eXact Lens'}
						aria-expanded={this.state.lensOpen}
						onClick={() => commands.toggleLens()}
					>
						<span aria-hidden="true">⌁</span>
					</button>
					<ThemePicker current={this.state.theme} open={this.state.themeMenuOpen} />
					<button
						type="button"
						className="icon-button"
						aria-label={this.state.paused ? 'Resume game' : 'Pause game'}
						onClick={() => commands.togglePause()}
					>
						<span aria-hidden="true">{this.state.paused ? '▶' : 'Ⅱ'}</span>
					</button>
				</div>
			</header>

			<main className="game-layout">
				<header className="game-heading">
					<div>
						<p className="eyebrow">{puzzle.title}</p>
						<h1>A quiet place to think.</h1>
					</div>
					<div className="game-meta">
						<label>
							<span>Difficulty</span>
							<select
								value={this.state.difficulty}
								onInput={(event) => commands.setDifficulty(event.currentTarget.value as Difficulty)}
							>
								<option value="gentle">Gentle</option>
								<option value="tricky">Tricky</option>
								<option value="fiendish">Fiendish</option>
							</select>
						</label>
						<div>
							<span>Time</span>
							<strong>{formatElapsed(this.state.elapsedSeconds)}</strong>
						</div>
					</div>
				</header>

				<div className="progress-line">
					<span style={{ width: `${progress}%` }} />
				</div>

				<section className="game-column">
					<div className="board-slot">
						<SudokuGrid
							cells={this.state.cells}
							selectedIndex={this.state.selectedIndex}
							selectedDigit={this.state.selectedDigit}
							conflicts={conflicts}
							paused={this.state.paused}
							complete={complete}
						/>
					</div>

					<GameControls
						selectedDigit={this.state.selectedDigit}
						noteMode={this.state.noteMode}
						canUndo={this.state.history.length > 0}
						canRedo={this.state.future.length > 0}
						paused={this.state.paused}
						remaining={remaining}
					/>
				</section>

				<aside className="side-card">
					<div className="side-card-top">
						<p className="eyebrow">Today’s practice</p>
						<h2>{puzzle.title}</h2>
						<p>
							{complete
								? 'A clean finish. Take a breath and enjoy it.'
								: 'Notice the patterns. The board will tell you what comes next.'}
						</p>
					</div>
					<div className="progress-summary">
						<div className="progress-orbit">
							<strong>{progress}%</strong>
							<span>filled</span>
						</div>
						<div>
							<strong>
								{entered} / {editable}
							</strong>
							<span>open cells explored</span>
						</div>
					</div>
					<div className="tip-card">
						<span aria-hidden="true">✦</span>
						<div>
							<strong>Gentle hint</strong>
							<p>
								{selectedCandidates.length
									? `This cell currently allows ${selectedCandidates.join(', ')}.`
									: selectedCell.value
										? 'This cell already has a value.'
										: 'This cell has no legal candidates yet.'}
							</p>
						</div>
					</div>
					<button type="button" className="new-game-button" onClick={() => commands.newGame()}>
						<span aria-hidden="true">↻</span>
						New {difficultyLabel(this.state.difficulty)} puzzle
					</button>
					<p className="shortcut-note">
						Keyboard: 1–9 choose · Enter applies · N notes · arrows move · ⌘Z undo
					</p>
				</aside>
			</main>

			<ExactLens
				open={this.state.lensOpen}
				cell={selectedCell}
				candidates={selectedCandidates}
				conflicts={conflicts}
				lastMove={lastMove}
			/>
		</div>
	);
}

function firstEditableIndex(cells: SudokuState['cells']): number {
	const index = cells.findIndex((cell) => !cell.given);
	return index < 0 ? 0 : index;
}

function keyboardSelection(index: number, key: string): number {
	if (key === 'ArrowUp') return moveSelection(index, -1, 0);
	if (key === 'ArrowDown') return moveSelection(index, 1, 0);
	if (key === 'ArrowLeft') return moveSelection(index, 0, -1);
	if (key === 'ArrowRight') return moveSelection(index, 0, 1);
	return index;
}

function formatElapsed(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function difficultyLabel(difficulty: Difficulty): string {
	if (difficulty === 'gentle') return 'gentle';
	if (difficulty === 'tricky') return 'tricky';
	return 'fiendish';
}
