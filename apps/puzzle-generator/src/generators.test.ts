import { describe, expect, it } from 'vitest';
import { generateCrossword } from './crossword.js';
import { createPuzzleDocuments, exportBaseName } from './documents.js';
import { renderCrosswordSvg, renderSudokuSvg, renderWordSearchSvg } from './svg.js';
import { generateSudoku, countSudokuSolutions } from './sudoku.js';
import type { PuzzleStyle } from './types.js';
import { generateWordSearch, gridContainsBlockedSequence } from './word-search.js';
import { parseWords, validateWords } from './words.js';

const style: PuzzleStyle = {
	title: 'Test & Proof',
	titleAlignment: 'left',
	fontFamily: 'sans',
	fontSize: 20,
	ink: '#111111',
	accent: '#cc3300',
	paper: '#ffffff',
	lineWidth: 1.5,
	monochromeSolution: false,
	crosswordGrid: '#111111',
	crosswordBlocks: '#111111',
	crosswordWordList: true,
	sudokuSolutionFont: 'inherit',
	sudokuSolutionBold: false
};

describe('Sudoku generation', () => {
	for (const boxSize of [2, 3] as const) {
		it(`creates a deterministic unique ${boxSize * boxSize}×${boxSize * boxSize} puzzle`, () => {
			const first = generateSudoku(boxSize, 'hard', 42);
			const second = generateSudoku(boxSize, 'hard', 42);
			expect(first).toEqual(second);
			expect(countSudokuSolutions(first.givens, boxSize)).toBe(1);
			expect(first.solution).toHaveLength((boxSize * boxSize) ** 2);
		});
	}

	it('removes more clues as difficulty increases', () => {
		const easy = generateSudoku(3, 'easy', 84).givens.filter(Boolean).length;
		const hard = generateSudoku(3, 'hard', 84).givens.filter(Boolean).length;
		expect(hard).toBeLessThan(easy);
	});
});

describe('word-search generation', () => {
	const words = ['ORBIT', 'COMET', 'PLANET', 'GALAXY', 'NEBULA'];

	it('places every word and avoids blocked output', () => {
		const puzzle = generateWordSearch(words, 12, 14, 'hard', 1234);
		expect(puzzle.placements.map((placement) => placement.word).sort()).toEqual([...words].sort());
		expect(gridContainsBlockedSequence(puzzle.grid, puzzle.rows, puzzle.columns)).toBe(false);
	});

	it('reports a word that cannot fit the selected dimensions', () => {
		expect(() => generateWordSearch(['EXTRALONGWORD', 'TINY'], 6, 6, 'easy', 1)).toThrow(
			/longest word/i
		);
	});
});

describe('crossword generation', () => {
	it('maximizes connected overlap for a compatible word set', () => {
		const words = ['ORBIT', 'COMET', 'METEOR', 'TELESCOPE', 'PLANET', 'LUNAR'];
		const puzzle = generateCrossword(words, 7788);
		expect(puzzle.words.length).toBeGreaterThanOrEqual(5);
		expect(puzzle.rows * puzzle.columns).toBeLessThan(180);
		expect(puzzle.cells.filter(Boolean).length).toBeLessThan(
			puzzle.words.reduce((total, word) => total + word.length, 0)
		);
	});
});

describe('document and input contracts', () => {
	it('normalizes words, rejects blocked input, and emits separate SVG documents', () => {
		expect(parseWords('orbit, ORBIT\ncomet')).toEqual(['ORBIT', 'COMET']);
		expect(validateWords(['NICE', 'SHIT'], 2)).toMatch(/blocked/i);
		const documents = createPuzzleDocuments({
			kind: 'sudoku',
			difficulty: 'medium',
			seed: 5,
			boxSize: 2,
			rows: 10,
			columns: 10,
			wordText: '',
			style
		});
		expect(documents.puzzleSvg).toContain('<svg');
		expect(documents.puzzleSvg).toContain('Test &amp; Proof');
		expect(documents.solutionSvg).not.toBe(documents.puzzleSvg);
		expect(exportBaseName('My Puzzle!', 'sudoku')).toBe('my-puzzle');
	});

	it('omits an empty title and aligns a supplied title', () => {
		const puzzle = generateSudoku(2, 'easy', 7);
		const untitled = renderSudokuSvg(puzzle, { ...style, title: '' }, false);
		const centered = renderSudokuSvg(
			puzzle,
			{ ...style, title: 'Centered', titleAlignment: 'center' },
			false
		);
		expect(untitled).not.toContain('>Sudoku</text>');
		expect(centered).toContain('text-anchor="middle"');
		expect(centered).toContain('>Centered</text>');
	});

	it('renders puzzle-specific print and solution options', () => {
		const wordSearch = generateWordSearch(['ORBIT', 'COMET'], 8, 8, 'easy', 19);
		const wordPuzzleSvg = renderWordSearchSvg(wordSearch, style, false);
		const colorWordSolutionSvg = renderWordSearchSvg(wordSearch, style, true);
		const wordSolutionSvg = renderWordSearchSvg(
			wordSearch,
			{ ...style, monochromeSolution: true },
			true
		);
		expect(wordPuzzleSvg).toContain('<rect x="34"');
		expect(wordSolutionSvg).not.toContain('<ellipse');
		expect(wordSolutionSvg).toContain('fill="none" stroke="#000000"');
		const colorPaths = [
			...colorWordSolutionSvg.matchAll(/data-solution-word="([^"]+)" d="([^"]+)"/g)
		];
		const monochromePaths = [
			...wordSolutionSvg.matchAll(/data-solution-word="([^"]+)" d="([^"]+)"/g)
		];
		expect(monochromePaths.map((match) => match[1])).toEqual(colorPaths.map((match) => match[1]));
		expect(monochromePaths.map((match) => match[2])).toEqual(colorPaths.map((match) => match[2]));
		expect(monochromePaths).toHaveLength(wordSearch.placements.length);

		const crossword = generateCrossword(['ORBIT', 'COMET', 'METEOR'], 21);
		const crosswordSvg = renderCrosswordSvg(
			crossword,
			{
				...style,
				crosswordGrid: '#123456',
				crosswordBlocks: '#ffffff',
				crosswordWordList: false,
				monochromeSolution: true
			},
			true
		);
		expect(crosswordSvg).toContain('stroke="#123456"');
		expect(crosswordSvg.match(/stroke="#123456"/g)).toHaveLength(1);
		expect(crosswordSvg).not.toMatch(/<rect[^>]+stroke=/);
		expect(crosswordSvg).toContain('fill="#ffffff"');
		expect(crosswordSvg).not.toContain('>ORBIT</text>');
		expect(crosswordSvg).toContain('fill="#000000"');

		const sudokuSvg = renderSudokuSvg(
			generateSudoku(2, 'medium', 22),
			{ ...style, sudokuSolutionFont: 'handwritten', sudokuSolutionBold: true },
			true
		);
		expect(sudokuSvg).toContain('font-family="&apos;Segoe Print&apos;');
		expect(sudokuSvg).toContain('font-weight="800"');
	});
});
