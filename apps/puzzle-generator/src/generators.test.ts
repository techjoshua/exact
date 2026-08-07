import { describe, expect, it } from 'vitest';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import {
	aiWordListPrompt,
	aiWordListSchema,
	defaultAiPromptTemplate,
	formatAiWordListResponse
} from './ai-word-list-format.js';
import { defaultLocalAiModel, localAiModels } from './ai-models.js';
import { generateCrossword } from './crossword.js';
import { createPuzzleDocuments, exportBaseName } from './documents.js';
import { renderCrosswordSvg, renderSudokuSvg, renderWordSearchSvg } from './svg.js';
import { generateSudoku, countSudokuSolutions } from './sudoku.js';
import type { PuzzleStyle } from './types.js';
import { generateWordSearch, gridContainsBlockedSequence } from './word-search.js';
import { parseCrosswordClues, parseWords, validateWords } from './words.js';

const style: PuzzleStyle = {
	title: 'Test & Proof',
	titleAlignment: 'left',
	titleFontFamily: 'serif',
	titleFontSize: 30,
	fontFamily: 'sans',
	fontSize: 20,
	pageSize: 'letter',
	pageMargin: 0.5,
	ink: '#111111',
	accent: '#cc3300',
	paper: '#ffffff',
	lineWidth: 1.5,
	monochromeSolution: false,
	crosswordGrid: '#111111',
	crosswordBlocks: '#111111',
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
	it('offers distinct local chat models below the advertised download ceiling', () => {
		const registeredModelIds = new Set(
			prebuiltAppConfig.model_list.map((model: { model_id: string }) => model.model_id)
		);
		expect(localAiModels).toHaveLength(10);
		expect(new Set(localAiModels.map((model) => model.id)).size).toBe(localAiModels.length);
		expect(localAiModels.every((model) => model.downloadMb < 1536)).toBe(true);
		expect(localAiModels.every((model) => registeredModelIds.has(model.id))).toBe(true);
		expect(JSON.stringify(localAiModels)).not.toContain('gemma3-1b');
		expect(defaultLocalAiModel).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');
	});

	it('validates and formats structured local-AI puzzle material', () => {
		const wordSearch = formatAiWordListResponse(
			JSON.stringify({
				words: ['coral reef', 'OCTOPUS', 'whale', 'SHARK', 'KELP', 'TURTLE', 'DOLPHIN']
			}),
			'word-search'
		);
		expect(wordSearch).toBe('CORALREEF\nOCTOPUS\nWHALE\nSHARK\nKELP\nTURTLE\nDOLPHIN');

		const crossword = formatAiWordListResponse(
			JSON.stringify({
				entries: [
					{ word: 'orbit', clue: 'Path around a planet' },
					{ word: 'comet', clue: 'Icy visitor' },
					{ word: 'lunar', clue: 'Related to the moon' },
					{ word: 'star', clue: 'Distant point of light' },
					{ word: 'eclipse', clue: 'Celestial shadow event' },
					{ word: 'galaxy', clue: 'Vast collection of stars' }
				]
			}),
			'crossword'
		);
		expect(crossword).toContain('ORBIT - Path around a planet');
		const crosswordTemplate = defaultAiPromptTemplate('crossword');
		expect(crosswordTemplate).toContain('{{topic}}');
		expect(crosswordTemplate).toContain('conventional American-style crossword');
		expect(crosswordTemplate).toContain('array of 20 objects');
		expect(crosswordTemplate).toContain('published crossword');
		expect(crosswordTemplate).toContain('Never put the answer');
		expect(crosswordTemplate).toContain('exactly one top-level property named "entries"');
		expect(crosswordTemplate).toContain('no introduction, explanation, markdown, or code fence');
		expect(crosswordTemplate).toContain('quoted key "entries"');
		expect(crosswordTemplate).not.toContain('ANSWER1');
		expect(defaultAiPromptTemplate('word-search')).toContain(
			'exactly one top-level property named "words"'
		);
		expect(defaultAiPromptTemplate('word-search')).toContain('quoted key "words"');
		expect(defaultAiPromptTemplate('word-search')).toContain('array of 20 strings');
		expect(defaultAiPromptTemplate('word-search')).not.toContain('WORD1');
		expect(aiWordListPrompt('space', 'crossword')).toContain('related to "space"');
		expect(aiWordListPrompt('space', 'crossword')).not.toContain('{{topic}}');
		expect(aiWordListPrompt('space', 'crossword', 'Write short clues.')).toBe(
			'Write short clues.\nTopic: "space"'
		);
		const parsedSchema = JSON.parse(aiWordListSchema('crossword'));
		expect(parsedSchema.required).toEqual(['entries']);
		expect(parsedSchema.properties.entries.minItems).toBeUndefined();
		expect(parsedSchema.properties.entries.maxItems).toBeUndefined();
	});

	it('rejects malformed or unsafe local-AI responses', () => {
		expect(() => formatAiWordListResponse('not json', 'word-search')).toThrow(/malformed/i);
		expect(() =>
			formatAiWordListResponse(
				JSON.stringify({ words: ['ORBIT', 'COMET', 'PLANET', 'GALAXY', 'SHIT', 'NEBULA'] }),
				'word-search'
			)
		).toThrow(/rejected/i);
		expect(() =>
			formatAiWordListResponse(
				JSON.stringify({
					entries: [
						{ word: 'BREAK', clue: 'Break the habit, or so?' },
						{ word: 'PROGRAM', clue: 'Programme your code with instructions' },
						{ word: 'INPUT', clue: 'Information supplied to software' },
						{ word: 'SYNTAX', clue: 'Grammar of a programming language' },
						{ word: 'CODE', clue: 'Instructions written for a computer' },
						{ word: 'REPEAT', clue: 'Do another time' }
					]
				}),
				'crossword'
			)
		).toThrow(/repeated answers.*BREAK.*PROGRAM/i);
		expect(() =>
			formatAiWordListResponse(
				JSON.stringify({
					words: ['WORD', 'ORBIT', 'COMET', 'PLANET', 'GALAXY', 'NEBULA']
				}),
				'word-search'
			)
		).toThrow(/placeholder/i);
	});

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
		expect(documents.puzzleSvg).toContain('width="816" height="1056"');
		expect(documents.puzzleSvg).toContain('data-page-margin="0.5"');
		expect(documents.puzzleSvg).toContain('Test &amp; Proof');
		expect(documents.puzzleSvg).toContain('font-size="30"');
		expect(documents.solutionSvg).not.toBe(documents.puzzleSvg);
		expect(exportBaseName('My Puzzle!', 'sudoku')).toBe('my-puzzle');
	});

	it('parses human-readable crossword clues and prints a complete clue table', () => {
		const clues = parseCrosswordClues('orbit - Path around a planet\nCOMET — Icy visitor\nmoon');
		expect(clues).toEqual([
			{ word: 'ORBIT', clue: 'Path around a planet' },
			{ word: 'COMET', clue: 'Icy visitor' },
			{ word: 'MOON', clue: 'No clue provided' }
		]);
		const crossword = generateCrossword(
			clues.map((entry) => entry.word),
			21,
			clues
		);
		const svg = renderCrosswordSvg(crossword, style, false);
		expect(svg).toContain('>Across</text>');
		expect(svg).toContain('>Down</text>');
		for (const entry of crossword.entries) expect(svg).toContain(entry.clue);
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
				monochromeSolution: true
			},
			true
		);
		expect(crosswordSvg).toContain('stroke="#123456"');
		expect(crosswordSvg.match(/stroke="#123456"/g)).toHaveLength(1);
		expect(crosswordSvg).not.toMatch(/<rect[^>]+stroke=/);
		expect(crosswordSvg).toContain('<rect width="100%" height="100%" fill="#ffffff"');
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
