import { generateCrossword } from './crossword.js';
import { pageFitWarning, renderCrosswordSvg, renderSudokuSvg, renderWordSearchSvg } from './svg.js';
import { generateSudoku } from './sudoku.js';
import type { Difficulty, PuzzleDocuments, PuzzleKind, PuzzleStyle } from './types.js';
import { generateWordSearch } from './word-search.js';
import { parseCrosswordClues, parseWords, validateWords } from './words.js';

/** Input required to generate either document for the currently selected puzzle. */
export type DocumentRequest = {
	kind: PuzzleKind;
	difficulty: Difficulty;
	seed: number;
	boxSize: 2 | 3;
	rows: number;
	columns: number;
	wordText: string;
	style: PuzzleStyle;
};

/** Validates a request, generates its model, and renders puzzle and solution SVGs. */
export function createPuzzleDocuments(request: DocumentRequest): PuzzleDocuments {
	if (request.kind === 'sudoku') {
		const puzzle = generateSudoku(request.boxSize, request.difficulty, request.seed);
		const clueCount = puzzle.givens.filter(Boolean).length;
		const puzzleSvg = renderSudokuSvg(puzzle, request.style, false);
		const solutionSvg = renderSudokuSvg(puzzle, request.style, true);
		return {
			puzzleSvg,
			solutionSvg,
			summary: `${puzzle.size}×${puzzle.size} grid · ${clueCount} clues · unique solution`,
			warning: pageFitWarning(puzzleSvg)
		};
	}

	const crosswordClues = request.kind === 'crossword' ? parseCrosswordClues(request.wordText) : [];
	const words =
		request.kind === 'crossword'
			? crosswordClues.map((entry) => entry.word)
			: parseWords(request.wordText);
	const issue = validateWords(words, request.kind === 'crossword' ? 3 : 2);
	if (issue) throw new Error(issue);
	if (request.kind === 'word-search') {
		const puzzle = generateWordSearch(
			words,
			request.rows,
			request.columns,
			request.difficulty,
			request.seed
		);
		const puzzleSvg = renderWordSearchSvg(puzzle, request.style, false);
		return {
			puzzleSvg,
			solutionSvg: renderWordSearchSvg(puzzle, request.style, true),
			summary: `${request.rows}×${request.columns} grid · ${words.length} hidden words${request.difficulty === 'hard' ? ' · near-match decoys' : ''}`,
			warning: pageFitWarning(puzzleSvg)
		};
	}

	const puzzle = generateCrossword(words, request.seed, crosswordClues);
	if (puzzle.words.length < 2)
		throw new Error('The supplied words do not share enough letters to form a crossword.');
	const placementWarning = puzzle.unplaced.length
		? `Could not connect: ${puzzle.unplaced.join(', ')}. Try adding bridge words or changing the seed.`
		: undefined;
	const puzzleSvg = renderCrosswordSvg(puzzle, request.style, false);
	return {
		puzzleSvg,
		solutionSvg: renderCrosswordSvg(puzzle, request.style, true),
		summary: `${puzzle.columns}×${puzzle.rows} compact grid · ${puzzle.words.length}/${words.length} words placed`,
		warning: [placementWarning, pageFitWarning(puzzleSvg)].filter(Boolean).join(' ') || undefined
	};
}

/** Downloads an SVG document through a short-lived, immediately released object URL. */
export function downloadSvg(svg: string, filename: string): void {
	const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
	try {
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Produces a filesystem-safe lowercase base name for an exported puzzle. */
export function exportBaseName(title: string, kind: PuzzleKind): string {
	return (
		title
			.normalize('NFKD')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || kind
	);
}
