import { describe, expect, it } from 'vitest';
import { generateCrossword } from './crossword.js';
import { createPuzzleDocuments, exportBaseName } from './documents.js';
import { generateSudoku, countSudokuSolutions } from './sudoku.js';
import type { PuzzleStyle } from './types.js';
import { generateWordSearch, gridContainsBlockedSequence } from './word-search.js';
import { parseWords, validateWords } from './words.js';

const style: PuzzleStyle = {
	title: 'Test & Proof',
	fontFamily: 'sans',
	fontSize: 20,
	ink: '#111111',
	accent: '#cc3300',
	paper: '#ffffff',
	lineWidth: 1.5
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
});
