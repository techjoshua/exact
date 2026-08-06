/** The kinds of printable puzzle supported by the application. */
export type PuzzleKind = 'sudoku' | 'word-search' | 'crossword';

/** Difficulty settings shared where their semantics are meaningful. */
export type Difficulty = 'easy' | 'medium' | 'hard';

/** Portable font stacks that do not require an external font download. */
export type PuzzleFont = 'sans' | 'serif' | 'mono' | 'handwritten' | 'playful';

/** Typography and page styling applied to both puzzle and solution exports. */
export type PuzzleStyle = {
	title: string;
	titleAlignment: 'left' | 'center' | 'right';
	fontFamily: PuzzleFont;
	fontSize: number;
	ink: string;
	accent: string;
	paper: string;
	lineWidth: number;
	monochromeSolution: boolean;
	crosswordGrid: string;
	crosswordBlocks: string;
	crosswordWordList: boolean;
	sudokuSolutionFont: PuzzleFont | 'inherit';
	sudokuSolutionBold: boolean;
};

/** A generated puzzle's two independent, standalone SVG documents. */
export type PuzzleDocuments = {
	puzzleSvg: string;
	solutionSvg: string;
	summary: string;
	warning?: string;
};

/** A completed square Sudoku puzzle. Zero denotes a removed clue. */
export type SudokuPuzzle = {
	size: number;
	boxSize: number;
	givens: number[];
	solution: number[];
};

/** One discovered word path in a word-search grid. */
export type WordPlacement = {
	word: string;
	row: number;
	column: number;
	dRow: number;
	dColumn: number;
};

/** A generated word-search and the locations used by its solution. */
export type WordSearchPuzzle = {
	rows: number;
	columns: number;
	grid: string[];
	placements: WordPlacement[];
};

/** A cell in the trimmed crossword result. */
export type CrosswordCell = {
	letter: string;
	number?: number;
};

/** A connected crossword layout and any words the heuristic could not join. */
export type CrosswordPuzzle = {
	rows: number;
	columns: number;
	cells: Array<CrosswordCell | undefined>;
	words: string[];
	unplaced: string[];
};

/** Mutable state owned by the root application component. */
export type PuzzleGeneratorState = {
	kind: PuzzleKind;
	difficulty: Difficulty;
	seed: number;
	sudokuBoxSize: 2 | 3;
	wordRows: number;
	wordColumns: number;
	wordText: string;
	style: PuzzleStyle;
	documents: PuzzleDocuments;
	status: string;
	previewSolution: boolean;
};
