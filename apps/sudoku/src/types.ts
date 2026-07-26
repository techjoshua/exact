/** A legal filled value in a Sudoku cell. */
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** A supported puzzle difficulty. */
export type Difficulty = 'gentle' | 'tricky' | 'fiendish';

/** A complete visual theme. */
export type ThemeId =
	| 'paper'
	| 'midnight'
	| 'candy'
	| 'arcade'
	| 'blueprint'
	| 'botanical'
	| 'solar';

/** A stable, mutable cell owned by the game component. */
export type SudokuCell = {
	/** @exact key */
	id: string;
	index: number;
	row: number;
	column: number;
	box: number;
	given: boolean;
	value?: Digit;
	notes: Digit[];
};

/** The reversible before-and-after state of one cell. */
export type CellChange = {
	index: number;
	beforeValue?: Digit;
	afterValue?: Digit;
	beforeNotes: Digit[];
	afterNotes: Digit[];
};

/** One atomic user action in the game history. */
export type GameMove = {
	/** @exact key */
	id: number;
	label: string;
	changes: CellChange[];
};

/** A bundled puzzle and its verified solution. */
export type Puzzle = {
	/** @exact key */
	id: string;
	difficulty: Difficulty;
	title: string;
	givens: string;
	solution: string;
};

/** The serializable portion of a game restored on the same device. */
export type SavedGame = {
	puzzleId: string;
	values: Array<Digit | undefined>;
	notes: Digit[][];
	elapsedSeconds: number;
	theme: ThemeId;
};

/** State owned by the durable Sudoku component instance. */
export type SudokuState = {
	puzzleId: string;
	difficulty: Difficulty;
	cells: SudokuCell[];
	selectedIndex: number;
	selectedDigit?: Digit;
	noteMode: boolean;
	history: GameMove[];
	future: GameMove[];
	nextMoveId: number;
	elapsedSeconds: number;
	paused: boolean;
	theme: ThemeId;
	lensOpen: boolean;
	themeMenuOpen: boolean;
};

/** Commands exposed to small descendant controls through context. */
export type SudokuCommands = {
	select(index: number): void;
	toggleDigit(digit: Digit): void;
	erase(): void;
	toggleNotes(): void;
	undo(): void;
	redo(): void;
	newGame(difficulty?: Difficulty): void;
	setDifficulty(difficulty: Difficulty): void;
	setTheme(theme: ThemeId): void;
	toggleThemeMenu(): void;
	togglePause(): void;
	toggleLens(): void;
};
