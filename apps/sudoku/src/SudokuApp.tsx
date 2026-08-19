import type { Component } from '@exactjs/core';
import { SudokuContext } from './context.js';
import {
	applyMove,
	candidatesFor,
	createCells,
	digitPlacementProgress,
	editableCellCount,
	enteredCellCount,
	findConflicts,
	isDigit,
	isSolved,
	planNoteToggle,
	planValueEntry
} from './game-engine.js';
import { difficultyLabel, firstEditableIndex, keyboardSelection } from './presentation.js';
import { findPuzzle, nextPuzzle } from './puzzles.js';
import { createSavedGame, loadSavedGame, storageKey } from './storage.js';
import { themeName } from './themes.js';
import type { Difficulty, Digit, GameMove, SudokuCommands, SudokuState } from './types.js';
import { ExactLens } from './components/ExactLens.jsx';
import { GameClock } from './components/GameClock.jsx';
import { GameControls } from './components/GameControls.jsx';
import { ProgressOrbit } from './components/ProgressOrbit.jsx';
import { SudokuBrand } from './components/SudokuBrand.jsx';
import { SudokuGrid } from './components/SudokuGrid.jsx';
import { ThemePicker } from './components/ThemePicker.jsx';

/** Owns the complete browser-local game, history, timer, preferences, and command surface. */
export function SudokuApp(this: Component<SudokuState>) {
	const restored = loadSavedGame();
	const initialPuzzle = restored
		? findPuzzle(restored.saved.puzzleId)
		: findPuzzle('gentle-morning');
	const initialCells = restored?.cells ?? createCells(initialPuzzle);

	this.state.puzzleId = initialPuzzle.id;
	this.state.difficulty = initialPuzzle.difficulty;
	this.state.cells = initialCells;
	this.state.selection = { index: firstEditableIndex(initialCells) };
	this.state.noteMode = false;
	this.state.history = [];
	this.state.future = [];
	this.state.nextMoveId = 1;
	this.state.elapsedSeconds = restored?.saved.elapsedSeconds ?? 0;
	this.state.timerStartedAt = isSolved(initialCells) ? undefined : Date.now();
	this.state.paused = false;
	this.state.theme = restored?.saved.theme ?? 'paper';
	this.state.lensOpen = false;
	this.state.themeMenuOpen = false;

	const complete = isSolved(this.state.cells);
	const elapsedSecondsNow = () => {
		const startedAt = this.state.timerStartedAt;
		if (startedAt === undefined) return this.state.elapsedSeconds;
		return this.state.elapsedSeconds + Math.max(0, Math.floor((Date.now() - startedAt) / 1_000));
	};

	const stopTimer = () => {
		if (this.state.timerStartedAt === undefined) return;
		this.state.elapsedSeconds = elapsedSecondsNow();
		this.state.timerStartedAt = undefined;
	};

	const startTimer = () => {
		if (this.state.timerStartedAt !== undefined) return;
		this.state.timerStartedAt = Date.now();
	};

	const commit = (label: string, changes: GameMove['changes']) => {
		if (!changes.length || complete) return;
		const move: GameMove = {
			id: this.state.nextMoveId++,
			label,
			changes
		};
		applyMove(this.state.cells, move, 'forward');
		if (isSolved(this.state.cells)) stopTimer();
		this.state.history.push(move);
		this.state.future = [];
	};

	const enter = (digit: Digit) => {
		if (this.state.selection.index < 0) return;
		if (this.state.noteMode) {
			commit(
				`Toggle note ${digit}`,
				planNoteToggle(this.state.cells, this.state.selection.index, digit)
			);
			return;
		}
		commit(`Enter ${digit}`, planValueEntry(this.state.cells, this.state.selection.index, digit));
	};

	const erase = (index = this.state.selection.index) => {
		if (index === undefined || index < 0) return;
		const cell = this.state.cells[index];
		if (!cell || cell.given) return;
		commit('Erase cell', planValueEntry(this.state.cells, cell.index, undefined));
	};

	const undo = () => {
		const move = this.state.history[this.state.history.length - 1];
		if (!move) return;
		applyMove(this.state.cells, move, 'backward');
		this.state.history.pop();
		this.state.future.push(move);
		this.state.selection.index = move.changes[0]?.index ?? this.state.selection.index;
	};

	const redo = () => {
		const move = this.state.future[this.state.future.length - 1];
		if (!move) return;
		applyMove(this.state.cells, move, 'forward');
		this.state.future.pop();
		this.state.history.push(move);
		this.state.selection.index = move.changes[0]?.index ?? this.state.selection.index;
	};

	const startPuzzle = (difficulty: Difficulty) => {
		const next = nextPuzzle(difficulty, this.state.puzzleId);
		const nextCells = createCells(next);
		this.state.puzzleId = next.id;
		this.state.difficulty = next.difficulty;
		this.state.cells = nextCells;
		this.state.selection.index = firstEditableIndex(nextCells);
		this.state.selection.digit = undefined;
		this.state.noteMode = false;
		this.state.history = [];
		this.state.future = [];
		this.state.elapsedSeconds = 0;
		this.state.timerStartedAt = Date.now();
		this.state.paused = false;
	};

	const commands: SudokuCommands = {
		select: (index) => {
			if (index < 0 || index > 80) return;
			this.state.selection.index = index;
			this.state.themeMenuOpen = false;
			const cell = this.state.cells[index];
			if (this.state.selection.digit !== undefined && cell && !cell.given) {
				enter(this.state.selection.digit);
			}
		},
		toggleDigit: (digit) => {
			if (this.state.selection.digit === digit) {
				this.state.selection.digit = undefined;
				this.state.selection.index = -1;
				return;
			}
			this.state.selection.digit = digit;
		},
		toggleNote: (index) => {
			const digit = this.state.selection.digit;
			if (digit === undefined) return;
			commit(`Toggle note ${digit}`, planNoteToggle(this.state.cells, index, digit));
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
			if (this.state.paused) {
				this.state.paused = false;
				startTimer();
			} else {
				stopTimer();
				this.state.paused = true;
			}
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
					elapsedSecondsNow(),
					this.state.theme
				)
			)
		);
	};

	const persistChangedGame = (_puzzleId: string, _cells: string, _theme: string) => {
		persistGame();
	};
	persistChangedGame(this.state.puzzleId, JSON.stringify(this.state.cells), this.state.theme);

	// Capture timer-only progress when the session is suspended without making
	// the one-second display update a persistence dependency.
	const observePageLifetime = () => {
		const persistWhenHidden = () => {
			if (document.visibilityState === 'hidden') persistGame();
		};
		document.addEventListener('visibilitychange', persistWhenHidden);
		window.addEventListener('pagehide', persistGame);
		this.onUnmount(() => {
			document.removeEventListener('visibilitychange', persistWhenHidden);
			window.removeEventListener('pagehide', persistGame);
		});
	};
	observePageLifetime();

	const observeKeyboard = () => {
		window.addEventListener('keydown', (event) => {
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
				// A selected cell owns direct keyboard entry. Number-pad selection remains
				// available when the board selection has been explicitly released.
				if (this.state.selection.index >= 0) enter(digit);
				else commands.toggleDigit(digit);
				return;
			}
			if (
				(event.key === 'Enter' || event.key === ' ') &&
				this.state.selection.digit !== undefined
			) {
				event.preventDefault();
				enter(this.state.selection.digit);
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
			if (event.key.startsWith('Arrow')) {
				const currentIndex =
					this.state.selection.index < 0
						? firstEditableIndex(this.state.cells)
						: this.state.selection.index;
				const nextIndex = keyboardSelection(currentIndex, event.key);
				event.preventDefault();
				this.state.selection.index = nextIndex;
			}
			if (event.key === 'Escape') this.state.themeMenuOpen = false;
		});
	};
	observeKeyboard();

	const puzzle = findPuzzle(this.state.puzzleId);
	const conflicts = findConflicts(this.state.cells);
	const entered = enteredCellCount(this.state.cells);
	const editable = editableCellCount(this.state.cells);
	const selectedCell =
		this.state.selection.index < 0 ? undefined : this.state.cells[this.state.selection.index];
	const selectedCandidates =
		this.state.selection.index < 0
			? []
			: candidatesFor(this.state.cells, this.state.selection.index);
	const lastMove = this.state.history[this.state.history.length - 1];
	const progress = editable === 0 ? 100 : Math.round((entered / editable) * 100);
	const digitProgress = digitPlacementProgress(this.state.cells, conflicts);

	return () => (
		<div className={['sudoku-app', `theme-${this.state.theme}`]}>
			<div className="ambient ambient-one" aria-hidden="true" />
			<div className="ambient ambient-two" aria-hidden="true" />
			<header className="topbar">
				<SudokuBrand />
				<div className="topbar-actions">
					<a className="docs-link" href="./#/learn/state">
						State docs
					</a>
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
					<div className="mobile-game-status">
						<div className="mobile-timer">
							<span>Time</span>
							<GameClock
								accumulatedSeconds={this.state.elapsedSeconds}
								running={this.state.timerStartedAt !== undefined}
								startedAt={this.state.timerStartedAt ?? 0}
							/>
						</div>
						<ProgressOrbit progress={progress} compact />
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
							<GameClock
								accumulatedSeconds={this.state.elapsedSeconds}
								running={this.state.timerStartedAt !== undefined}
								startedAt={this.state.timerStartedAt ?? 0}
							/>
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
							selection={this.state.selection}
							conflicts={conflicts}
							paused={this.state.paused}
							complete={complete === true}
							elapsedSeconds={this.state.elapsedSeconds}
						/>
					</div>

					<GameControls
						selectedDigit={this.state.selection.digit}
						noteMode={this.state.noteMode}
						canUndo={this.state.history.length > 0}
						canRedo={this.state.future.length > 0}
						paused={this.state.paused}
						digitProgress={digitProgress}
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
						<ProgressOrbit progress={progress} showLabel />
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
									: selectedCell?.value
										? 'This cell already has a value.'
										: selectedCell
											? 'This cell has no legal candidates yet.'
											: 'Select a cell to inspect its candidates.'}
							</p>
						</div>
					</div>
					<button type="button" className="new-game-button" onClick={() => commands.newGame()}>
						<span aria-hidden="true">↻</span>
						New {difficultyLabel(this.state.difficulty)} puzzle
					</button>
					<p className="shortcut-note">
						Keyboard: 1–9 choose · Enter applies · N notes · arrows move · ⌘Z undo
						<br /> Mouse: right-click toggles the selected number&apos;s pencil mark
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
